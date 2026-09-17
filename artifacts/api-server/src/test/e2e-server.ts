import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app";
import {
  setCaptionSessionDependenciesForTests,
} from "../lib/caption-sessions";

const apiPort = Number(process.env.E2E_API_PORT ?? 4312);
const fixturePort = Number(process.env.E2E_FIXTURE_PORT ?? 4311);
const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/speech-hls",
);
const fixtureUrl = `http://127.0.0.1:${fixturePort}/speech.m3u8`;
const releasedChunks = new Set<number>();
const waitingChunks = new Map<number, {
  resolve: () => void;
  reject: (error: Error) => void;
}>();

function releaseChunk(index: number): void {
  releasedChunks.add(index);
  waitingChunks.get(index)?.resolve();
  waitingChunks.delete(index);
}

function resetChunkGates(): void {
  for (const gate of waitingChunks.values()) {
    gate.reject(new Error("Caption test session reset."));
  }
  waitingChunks.clear();
  releasedChunks.clear();
}

function waitForChunkRelease(index: number, signal: AbortSignal): Promise<void> {
  if (releasedChunks.has(index)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      waitingChunks.delete(index);
      reject(new Error("Caption session stopped."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    waitingChunks.set(index, {
      resolve: () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      reject: (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    });
  });
}

function startFixtureServer(): Promise<Server> {
  const server = createServer((request, response) => {
    const name = path.basename(new URL(request.url ?? "/", fixtureUrl).pathname);
    if (name !== "speech.m3u8" && !/^segment-\d+\.ts$/.test(name)) {
      response.writeHead(404).end();
      return;
    }
    const file = path.join(fixtureDirectory, name);
    void stat(file).then(() => {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": name.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/mp2t",
      });
      createReadStream(file).pipe(response);
    }).catch(() => response.writeHead(404).end());
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(fixturePort, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const fixtureServer = await startFixtureServer();
  const restoreDependencies = setCaptionSessionDependenciesForTests({
    createHlsEgress: async () => {
      resetChunkGates();
      return fixtureUrl;
    },
    closeHlsEgress: () => undefined,
    transcribe: async (_bytes, file, signal) => {
      const index = Number(file.match(/(\d+)/)?.[1] ?? 0);
      await waitForChunkRelease(index, signal);
      return { text: `Hola, fixture sentence ${index}.`, language_code: "es" };
    },
    translate: async (text) => `English fixture sentence: ${text.replace(/^Hola, /, "")}`,
  });
  const testApp = createApp({
    verifyStream: async (channel) => ({
      channelId: channel.id,
      available: true,
      checkedAt: new Date(),
      latencyMs: 1,
      error: null,
      nativeCaptions: [],
    }),
  });
  testApp.post("/__test/release/:index", (request, response): void => {
    const index = Number(request.params.index);
    if (!Number.isInteger(index) || index < 0) {
      response.status(400).json({ error: "Chunk index must be a non-negative integer." });
      return;
    }
    releaseChunk(index);
    response.json({ released: index });
  });
  const server = testApp.listen(apiPort, "127.0.0.1");

  const close = async () => {
    for (const gate of waitingChunks.values()) {
      gate.reject(new Error("Caption test harness stopped."));
    }
    waitingChunks.clear();
    restoreDependencies();
    fixtureServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});