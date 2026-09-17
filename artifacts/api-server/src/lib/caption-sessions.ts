import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { assertSafeStreamUrl } from "./channel-catalog";
import { translateCaptionToEnglish } from "./caption-translation";
import { closeHlsEgress, createHlsEgress } from "./hls-egress";
import { logger } from "./logger";

function boundedEnvNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

const MAX_SESSIONS = boundedEnvNumber("CAPTION_MAX_CONCURRENT", 3, 1, 10);
const SESSION_TTL_MS = boundedEnvNumber(
  "CAPTION_SESSION_TTL_MS",
  20 * 60_000,
  60_000,
  60 * 60_000,
);
const CHUNK_SECONDS = boundedEnvNumber("CAPTION_CHUNK_SECONDS", 6, 3, 15);
const MAX_CHUNK_BYTES = 25 * 1024 * 1024;
const MAX_CUES = 500;
const CAPTION_TMP_ROOT = path.join("/tmp", "masslink-captions");

export type Cue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
  language: string;
  final: boolean;
};
export type SessionStatus =
  | "starting"
  | "listening"
  | "reconnecting"
  | "stopped"
  | "error"
  | "unsupported";
type Session = {
  id: string;
  channelId: string;
  ownerId: string;
  streamUrl: string;
  language: string;
  detectedLanguage: string | null;
  status: SessionStatus;
  message: string | null;
  createdAt: Date;
  expiresAt: Date;
  cues: Cue[];
  nextCueId: number;
  process: ChildProcess | null;
  timer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
  scanPromise: Promise<void> | null;
  abortController: AbortController;
  egressUrl: string | null;
  dir: string;
  processed: Set<string>;
  failures: number;
  scanning: boolean;
  stopping: boolean;
};

const sessions = new Map<string, Session>();
const ffmpegCheck = { promise: null as Promise<void> | null };

type SpeechResult = {
  text?: string;
  language_code?: string;
};

type CaptionSessionDependencies = {
  assertSafeStreamUrl: typeof assertSafeStreamUrl;
  createHlsEgress: typeof createHlsEgress;
  closeHlsEgress: typeof closeHlsEgress;
  transcribe: (bytes: Uint8Array, file: string, signal: AbortSignal) => Promise<SpeechResult>;
  translate: typeof translateCaptionToEnglish;
};

const defaultDependencies: CaptionSessionDependencies = {
  assertSafeStreamUrl,
  createHlsEgress,
  closeHlsEgress,
  transcribe: async (bytes, file, signal) => {
    const form = new FormData();
    form.append("file", new Blob([bytes as unknown as ArrayBuffer], { type: "audio/wav" }), file);
    form.append("model_id", process.env.CAPTION_STT_MODEL ?? "scribe_v1");
    // Deliberately omit language_code so ElevenLabs detects the source language.
    // Translation happens below; the STT request must never be forced to English.
    const connectors = new ReplitConnectors();
    let timeoutHandle: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Speech service timed out.")), 30_000);
      });
      const cancelled = new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new Error("Caption session stopped."));
          return;
        }
        onAbort = () => reject(new Error("Caption session stopped."));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const response = await Promise.race([
        connectors.proxy("elevenlabs", "/v1/speech-to-text", {
          method: "POST",
          body: form,
        }),
        timeout,
        cancelled,
      ]);
      if (!response.ok) {
        throw new Error(`Speech service returned ${response.status}.`);
      }
      return (await response.json()) as SpeechResult;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  },
  translate: translateCaptionToEnglish,
};

let dependencies: CaptionSessionDependencies = { ...defaultDependencies };

/**
 * Test-only dependency boundary. The production API never calls this function;
 * tests use it to replace paid speech/translation providers and the remote HLS
 * source while retaining the real ffmpeg/session lifecycle.
 */
export function setCaptionSessionDependenciesForTests(
  overrides: Partial<CaptionSessionDependencies>,
): () => void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Caption session test dependencies are only available in tests.");
  }
  const previous = dependencies;
  dependencies = { ...dependencies, ...overrides };
  return () => {
    dependencies = previous;
  };
}

function publicSession(session: Session) {
  return {
    id: session.id,
    channelId: session.channelId,
    status: session.status,
    language: session.language,
    detectedLanguage: session.detectedLanguage,
    message: session.message,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    cueCount: session.cues.length,
  };
}

async function ensureFfmpeg(): Promise<void> {
  if (ffmpegCheck.promise) return ffmpegCheck.promise;
  ffmpegCheck.promise = new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.once("error", () => reject(new Error("FFmpeg is not available on the server.")));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("FFmpeg is not available on the server."));
    });
  }).catch((error) => {
    ffmpegCheck.promise = null;
    throw error;
  });
  return ffmpegCheck.promise;
}

async function transcribe(session: Session, file: string, index: number): Promise<void> {
  if (session.stopping) return;
  const filePath = path.join(session.dir, file);
  const fileInfo = await stat(filePath);
  if (fileInfo.size > MAX_CHUNK_BYTES) {
    throw new Error("Caption audio chunk exceeded the server limit.");
  }
  const bytes = await readFile(filePath);
  const result = await dependencies.transcribe(bytes, file, session.abortController.signal);
  if (session.stopping) return;
  const text = result.text?.trim();
  if (text) {
    session.detectedLanguage = result.language_code ?? session.detectedLanguage;
    const englishText = await dependencies.translate(
      text,
      result.language_code,
      session.abortController.signal,
    );
    if (session.stopping) return;
    session.cues.push({
      id: session.nextCueId++,
      startMs: index * CHUNK_SECONDS * 1000,
      endMs: (index + 1) * CHUNK_SECONDS * 1000,
      text: englishText,
      language: "en",
      final: true,
    });
    if (session.cues.length > MAX_CUES) {
      session.cues.splice(0, session.cues.length - MAX_CUES);
    }
  }
}

async function scan(session: Session): Promise<void> {
  if (session.stopping || session.status === "stopped" || session.scanning) return;
  session.scanning = true;
  try {
    const files = (await readdir(session.dir))
      .filter((file) => file.endsWith(".wav"))
      .sort();
    // The newest segment can still be open by ffmpeg.
    for (const file of files.slice(0, -1)) {
      if (session.processed.has(file) || session.stopping) continue;
      const index = Number(file.match(/(\d+)/)?.[1] ?? session.nextCueId - 1);
      try {
        await transcribe(session, file, index);
        if (session.stopping) break;
        session.processed.add(file);
        await unlink(path.join(session.dir, file)).catch(() => undefined);
        session.status = "listening";
        session.message = null;
        session.failures = 0;
      } catch (error) {
        session.failures += 1;
        session.status = session.failures < 3 ? "reconnecting" : "error";
        session.message = "Caption processing is temporarily unavailable.";
        logger.warn(
          {
            sessionId: session.id,
            error: error instanceof Error ? error.message : "unknown error",
          },
          "Caption chunk failed",
        );
        // Leave the chunk unprocessed so a transient provider error can retry.
        break;
      }
    }
  } catch (error) {
    session.failures += 1;
    session.status = session.failures < 3 ? "reconnecting" : "error";
    session.message = "Caption audio capture is temporarily unavailable.";
    logger.warn(
      { sessionId: session.id, error: error instanceof Error ? error.message : "unknown error" },
      "Caption directory scan failed",
    );
  } finally {
    session.scanning = false;
  }
}

export async function startSession(
  channelId: string,
  streamUrl: string,
  language: string,
  ownerId: string,
) {
  await ensureFfmpeg();
  await dependencies.assertSafeStreamUrl(streamUrl);
  cleanupExpired();
  const existing = [...sessions.values()].find(
    (session) => session.ownerId === ownerId && !session.stopping,
  );
  if (existing) await stopSession(existing.id);
  if (sessions.size >= MAX_SESSIONS) throw new Error("CAPACITY");

  const id = randomUUID();
  const dir = path.join(CAPTION_TMP_ROOT, id);
  await mkdir(dir, { recursive: true });
  const now = new Date();
  const session: Session = {
    id,
    channelId,
    ownerId,
    streamUrl,
    language,
    detectedLanguage: null,
    status: "starting",
    message: "Connecting to the stream",
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    cues: [],
    nextCueId: 1,
    process: null,
    timer: null,
    expiryTimer: null,
    scanPromise: null,
    abortController: new AbortController(),
    egressUrl: null,
    dir,
    processed: new Set(),
    failures: 0,
    scanning: false,
    stopping: false,
  };
  sessions.set(id, session);
  session.expiryTimer = setTimeout(() => {
    void stopSession(id).catch((error) =>
      logger.warn(
        { sessionId: id, error: error instanceof Error ? error.message : "unknown error" },
        "Caption session expiry cleanup failed",
      ),
    );
  }, SESSION_TTL_MS);
  session.expiryTimer.unref();

  try {
    session.egressUrl = await dependencies.createHlsEgress(id, streamUrl);
    const output = path.join(dir, "chunk-%05d.wav");
    const child = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "http,https,tls,tcp,crypto",
        "-i",
        session.egressUrl,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "segment",
        "-segment_time",
        String(CHUNK_SECONDS),
        "-reset_timestamps",
        "1",
        output,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    session.process = child;
    child.once("error", () => {
      if (!session.stopping) {
        session.status = "unsupported";
        session.message = "This stream could not be captured by the server.";
      }
    });
    child.once("exit", (code) => {
      if (!session.stopping && code !== 0) {
        session.status = "reconnecting";
        session.message = "The stream ended or blocked server-side audio capture.";
      }
    });
    session.timer = setInterval(() => queueScan(session), 1500);
    return publicSession(session);
  } catch (error) {
    await stopSession(id);
    throw error;
  }
}

export function getSession(id: string, ownerId?: string) {
  const session = sessions.get(id);
  if (!session || (ownerId !== undefined && session.ownerId !== ownerId)) return null;
  return publicSession(session);
}

export function getCues(id: string, ownerId?: string): Cue[] | null {
  const session = sessions.get(id);
  if (!session || (ownerId !== undefined && session.ownerId !== ownerId)) return null;
  return [...session.cues];
}

async function terminateProcess(process: ChildProcess | null): Promise<void> {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  try {
    process.kill("SIGTERM");
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (process.exitCode === null && process.signalCode === null) {
        try {
          process.kill("SIGKILL");
        } catch {
          resolve();
          return;
        }
      }
      const killWait = setTimeout(resolve, 500);
      process.once("exit", () => {
        clearTimeout(killWait);
        resolve();
      });
    }, 2_000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export async function stopSession(id: string, ownerId?: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session || (ownerId !== undefined && session.ownerId !== ownerId)) return false;
  session.stopping = true;
  session.status = "stopped";
  session.abortController.abort();
  if (session.timer) clearInterval(session.timer);
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  dependencies.closeHlsEgress(id);
  sessions.delete(id);
  if (session.scanPromise) await session.scanPromise;
  await terminateProcess(session.process);
  await rm(session.dir, { recursive: true, force: true });
  return true;
}

function queueScan(session: Session): void {
  if (session.scanPromise || session.stopping) return;
  const promise = scan(session);
  const tracked = promise.finally(() => {
    if (session.scanPromise === tracked) session.scanPromise = null;
  });
  session.scanPromise = tracked;
}

export function cleanupExpired(): void {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.expiresAt.getTime() <= now) {
      void stopSession(session.id).catch((error) =>
        logger.warn(
          { sessionId: session.id, error: error instanceof Error ? error.message : "unknown error" },
          "Expired caption session cleanup failed",
        ),
      );
    }
  }
}