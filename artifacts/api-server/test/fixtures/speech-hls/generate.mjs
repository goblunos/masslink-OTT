#!/usr/bin/env node
/**
 * Regenerates the deterministic local HLS fixture used by the caption
 * regression. The checked-in audio must be real, intelligible Spanish speech;
 * transcription is mocked at the provider boundary, so the fixture's job is
 * to exercise real HLS demuxing and ffmpeg chunk capture.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const audio = path.join(directory, "speech.wav");
const phrases = [
  "Hola, esta es una transmisión de prueba para subtítulos.",
  "El audio continúa con voz clara y palabras en español.",
  "La señal local permanece estable durante toda la demostración.",
  "Este mensaje permite probar el procesamiento de muchos segmentos.",
];
const sentence = Array.from({ length: 22 }, (_, index) => phrases[index % phrases.length]).join(" ");

function commandExists(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

async function main() {
  if (!commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required to generate the caption fixture.");
  }
  if (!commandExists("espeak")) {
    throw new Error(
      "espeak is required to generate the speech fixture. " +
      "Install it with `nix-shell -p espeak` and rerun this command.",
    );
  }
  await mkdir(directory, { recursive: true });
  for (const entry of await (await import("node:fs/promises")).readdir(directory)) {
    if (/^(segment-\d+\.ts|speech\.m3u8|speech\.wav)$/.test(entry)) {
      await rm(path.join(directory, entry), { force: true });
    }
  }

  execFileSync("espeak", ["-w", audio, "-s", "145", "-v", "es", sentence], {
    stdio: "inherit",
  });
  const audioArgs = ["-i", audio];

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=25",
    ...audioArgs,
    "-t",
    "72",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "75",
    "-sc_threshold",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-f",
    "hls",
    "-hls_time",
    "3",
    "-hls_list_size",
    "0",
    "-hls_segment_filename",
    path.join(directory, "segment-%03d.ts"),
    path.join(directory, "speech.m3u8"),
  ];
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  if (existsSync(audio)) await rm(audio, { force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});