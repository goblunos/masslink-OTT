import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const MAX_SESSIONS = Number(process.env.CAPTION_MAX_CONCURRENT ?? 3);
const SESSION_TTL_MS = Number(process.env.CAPTION_SESSION_TTL_MS ?? 20 * 60_000);
const CHUNK_SECONDS = Math.max(3, Number(process.env.CAPTION_CHUNK_SECONDS ?? 6));

export type Cue = { id: number; startMs: number; endMs: number; text: string; language: string; final: boolean };
export type SessionStatus = "starting" | "listening" | "reconnecting" | "stopped" | "error" | "unsupported";
type Session = {
  id: string; channelId: string; ip: string; streamUrl: string; language: string;
  detectedLanguage: string | null; status: SessionStatus; message: string | null;
  createdAt: Date; expiresAt: Date; cues: Cue[]; process: ChildProcessWithoutNullStreams | null;
  timer: NodeJS.Timeout | null; dir: string; processed: Set<string>; failures: number;
};

const sessions = new Map<string, Session>();

function publicSession(s: Session) {
  return {
    id: s.id, channelId: s.channelId, status: s.status, language: s.language,
    detectedLanguage: s.detectedLanguage, message: s.message,
    createdAt: s.createdAt, expiresAt: s.expiresAt, cueCount: s.cues.length,
  };
}

async function transcribe(session: Session, file: string, index: number): Promise<void> {
  const connectors = new ReplitConnectors();
  const bytes = await readFile(path.join(session.dir, file));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), file);
  form.append("model_id", process.env.CAPTION_STT_MODEL ?? "scribe_v1");
  if (session.language !== "auto") form.append("language_code", session.language);
  const response = await connectors.proxy("elevenlabs", "/v1/speech-to-text", { method: "POST", body: form });
  if (!response.ok) throw new Error(`Speech service returned ${response.status}`);
  const result = await response.json() as { text?: string; language_code?: string; language_probability?: number };
  const text = result.text?.trim();
  if (!text) return;
  const language = result.language_code || session.language || "und";
  session.detectedLanguage = result.language_code ?? session.detectedLanguage;
  session.cues.push({
    id: session.cues.length + 1,
    startMs: index * CHUNK_SECONDS * 1000,
    endMs: (index + 1) * CHUNK_SECONDS * 1000,
    text, language, final: true,
  });
  if (session.cues.length > 500) session.cues.splice(0, session.cues.length - 500);
}

async function scan(session: Session): Promise<void> {
  if (session.status === "stopped") return;
  try {
    const files = (await readdir(session.dir)).filter((f) => f.endsWith(".wav")).sort();
    // Keep the newest file untouched because ffmpeg may still be writing it.
    for (const file of files.slice(0, -1)) {
      if (session.processed.has(file)) continue;
      session.processed.add(file);
      const index = Number(file.match(/(\d+)/)?.[1] ?? session.processed.size - 1);
      await transcribe(session, file, index);
      session.status = "listening";
      session.message = null;
      session.failures = 0;
    }
  } catch (error) {
    session.failures += 1;
    session.status = session.failures < 3 ? "reconnecting" : "error";
    session.message = error instanceof Error ? error.message : "Caption processing failed";
    logger.warn({ sessionId: session.id, error: session.message }, "Caption chunk failed");
  }
}

export async function startSession(channelId: string, streamUrl: string, language: string, ip: string) {
  cleanupExpired();
  if (sessions.size >= MAX_SESSIONS) throw new Error("CAPACITY");
  const existing = [...sessions.values()].find((s) => s.ip === ip && s.status !== "stopped");
  if (existing) await stopSession(existing.id);
  const id = randomUUID();
  const dir = path.join("/tmp", "masslink-captions", id);
  await mkdir(dir, { recursive: true });
  const now = new Date();
  const session: Session = {
    id, channelId, ip, streamUrl, language, detectedLanguage: null, status: "starting",
    message: "Connecting to the stream", createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS), cues: [], process: null,
    timer: null, dir, processed: new Set(), failures: 0,
  };
  sessions.set(id, session);
  const output = path.join(dir, "chunk-%05d.wav");
  const child = spawn("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-i", streamUrl,
    "-vn", "-ac", "1", "-ar", "16000", "-f", "segment",
    "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1", output,
  ]);
  session.process = child;
  child.once("error", (error) => {
    session.status = "unsupported";
    session.message = `This stream could not be captured: ${error.message}`;
  });
  child.once("exit", (code) => {
    if (session.status !== "stopped" && code !== 0) {
      session.status = "reconnecting";
      session.message = "The stream ended or blocked server-side audio capture.";
    }
  });
  session.timer = setInterval(() => void scan(session), 1500);
  return publicSession(session);
}

export function getSession(id: string) {
  const session = sessions.get(id);
  return session ? publicSession(session) : null;
}

export function getCues(id: string): Cue[] | null {
  const session = sessions.get(id);
  return session ? [...session.cues] : null;
}

export async function stopSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session) return false;
  session.status = "stopped";
  session.process?.kill("SIGTERM");
  if (session.timer) clearInterval(session.timer);
  sessions.delete(id);
  await rm(session.dir, { recursive: true, force: true });
  return true;
}

export function cleanupExpired(): void {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.expiresAt.getTime() <= now) void stopSession(session.id);
  }
}