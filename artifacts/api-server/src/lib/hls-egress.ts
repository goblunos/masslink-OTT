import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { assertSafeHttpUrl } from "./channel-catalog";

const MAX_RESOURCES_PER_SESSION = 2_048;
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REMOTE_TIMEOUT_MS = 10_000;

type EgressSession = {
  resources: Map<string, string>;
  keys: Map<string, string>;
};

const sessions = new Map<string, EgressSession>();
let serverPromise: Promise<{ port: number }> | null = null;

function resourceUrl(port: number, sessionId: string, key: string): string {
  return `http://127.0.0.1:${port}/hls/${sessionId}/${key}`;
}

async function ensureServer(): Promise<{ port: number }> {
  if (serverPromise) return serverPromise;
  serverPromise = new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void handleRequest(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Caption egress proxy did not bind."));
        return;
      }
      server.unref();
      resolve({ port: address.port });
    });
  });
  return serverPromise;
}

function getResource(request: IncomingMessage): string | null {
  const parsed = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = parsed.pathname.split("/");
  if (parts.length !== 4 || parts[1] !== "hls") return null;
  const session = sessions.get(parts[2]);
  return session?.resources.get(parts[3]) ?? null;
}

async function fetchRemote(url: string): Promise<{ response: Response; url: string }> {
  let current = url;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    await assertSafeHttpUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) {
      return { response, url: current };
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("Remote stream redirect had no location.");
    current = new URL(location, current).toString();
  }
  throw new Error("Remote stream exceeded redirect limit.");
}

async function readPlaylist(response: Response): Promise<string> {
  if (response.body === null) throw new Error("Remote playlist had no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_PLAYLIST_BYTES) throw new Error("Remote playlist exceeded the size limit.");
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function registerResource(sessionId: string, remoteUrl: string): string {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Caption egress session expired.");
  const existing = session.keys.get(remoteUrl);
  if (existing) return existing;
  if (session.resources.size >= MAX_RESOURCES_PER_SESSION) {
    const oldest = session.resources.keys().next().value;
    if (oldest) {
      const oldestUrl = session.resources.get(oldest);
      session.resources.delete(oldest);
      if (oldestUrl) session.keys.delete(oldestUrl);
    }
  }
  const key = randomUUID();
  session.resources.set(key, remoteUrl);
  session.keys.set(remoteUrl, key);
  return key;
}

function rewritePlaylist(sessionId: string, port: number, playlist: string, baseUrl: string): string {
  const rewrite = (value: string): string => {
    const remoteUrl = new URL(value, baseUrl);
    if (remoteUrl.protocol !== "http:" && remoteUrl.protocol !== "https:") {
      throw new Error("Playlist contained an unsupported resource protocol.");
    }
    return resourceUrl(port, sessionId, registerResource(sessionId, remoteUrl.toString()));
  };
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, value: string) => `URI="${rewrite(value)}"`);
      }
      return line.trim() === "" ? line : rewrite(line.trim());
    })
    .join("\n");
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET") {
    response.writeHead(405).end();
    return;
  }
  const remoteUrl = getResource(request);
  if (!remoteUrl) {
    response.writeHead(404).end();
    return;
  }
  const parsed = new URL(request.url ?? "/", "http://127.0.0.1");
  const sessionId = parsed.pathname.split("/")[2];
  const session = sessions.get(sessionId);
  if (!session) {
    response.writeHead(404).end();
    return;
  }
  const remote = await fetchRemote(remoteUrl);
  if (!remote.response.ok || !remote.response.body) {
    response.writeHead(remote.response.status || 502).end();
    return;
  }
  const contentType = remote.response.headers.get("content-type")?.toLowerCase() ?? "";
  const isPlaylist =
    contentType.includes("mpegurl") || /\.m3u8(?:$|[?#])/.test(new URL(remote.url).pathname);
  if (isPlaylist) {
    const playlist = rewritePlaylist(
      sessionId,
      (await ensureServer()).port,
      await readPlaylist(remote.response),
      remote.url,
    );
    response.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" });
    response.end(playlist);
    return;
  }
  response.writeHead(200, {
    "content-type": remote.response.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  const body = remote.response.body;
  const reader = body.getReader();
  let cancelled = false;
  const cancelReader = (): void => {
    if (cancelled) return;
    cancelled = true;
    void reader.cancel().catch(() => undefined);
  };
  const waitForDrain = (): Promise<void> =>
    new Promise((resolve) => {
      const finish = (): void => {
        response.off("drain", finish);
        response.off("close", finish);
        resolve();
      };
      response.once("drain", finish);
      response.once("close", finish);
    });
  request.once("aborted", cancelReader);
  response.once("close", cancelReader);
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!response.write(Buffer.from(part.value))) {
        if (response.destroyed || response.writableEnded) break;
        await waitForDrain();
      }
    }
  } finally {
    request.off("aborted", cancelReader);
    response.off("close", cancelReader);
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have been detached by cancellation.
    }
    if (!response.writableEnded) response.end();
  }
}

export async function createHlsEgress(sessionId: string, streamUrl: string): Promise<string> {
  const server = await ensureServer();
  sessions.set(sessionId, { resources: new Map(), keys: new Map() });
  const key = registerResource(sessionId, streamUrl);
  return resourceUrl(server.port, sessionId, key);
}

export function closeHlsEgress(sessionId: string): void {
  sessions.delete(sessionId);
}