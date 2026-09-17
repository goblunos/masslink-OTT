import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import net from "node:net";

export type Channel = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  category: string;
  logo: string;
  streamUrl: string;
  /** The catalog does not contain audience metrics; zero means unavailable. */
  viewers: number;
  /** The catalog does not designate featured channels. */
  featured: boolean;
};

type CatalogChannel = {
  id?: unknown;
  name?: unknown;
  displayName?: unknown;
  logo?: unknown;
  country?: unknown;
  group?: unknown;
  url?: unknown;
};

const CATALOG_RELATIVE_PATH = path.join(
  "artifacts",
  "masslink-ott",
  "src",
  "data",
  "channel-catalog.json",
);

function catalogPath(): string {
  const candidates = [
    path.resolve(process.cwd(), CATALOG_RELATIVE_PATH),
    path.resolve(process.cwd(), "../..", CATALOG_RELATIVE_PATH),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../masslink-ott/src/data/channel-catalog.json",
    ),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../masslink-ott/src/data/channel-catalog.json",
    ),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Trusted channel catalog is missing. Expected ${CATALOG_RELATIVE_PATH}.`,
    );
  }
  return found;
}

function readCatalog(): CatalogChannel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(catalogPath(), "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Trusted channel catalog could not be loaded: ${
        error instanceof Error ? error.message : "invalid JSON"
      }`,
    );
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { channels?: unknown }).channels)
  ) {
    throw new Error("Trusted channel catalog has an invalid shape.");
  }
  return (parsed as { channels: CatalogChannel[] }).channels;
}

function requiredString(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Trusted channel catalog entry ${index} has no ${field}.`);
  }
  return value.trim();
}

/**
 * Only catalog URLs reach this function. Keep the checks here as a second
 * line of defence before a URL is handed to fetch or ffmpeg.
 */
export function isSafeStreamUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hostname !== "" &&
      !parsed.hostname.endsWith(".localhost") &&
      parsed.hostname !== "localhost" &&
      !net.isIP(parsed.hostname) // IPs are checked after DNS resolution.
    );
  } catch {
    return false;
  }
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hostname !== "" &&
      !parsed.hostname.endsWith(".localhost") &&
      parsed.hostname !== "localhost" &&
      !net.isIP(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function countryCode(id: string, country: string): string {
  const suffix = id.slice(id.lastIndexOf(".") + 1);
  return /^[a-z]{2}$/i.test(suffix) ? suffix.toUpperCase() : country.slice(0, 2).toUpperCase();
}

export const channels: Channel[] = readCatalog().map((entry, index) => {
  const id = requiredString(entry.id, "id", index);
  const name = requiredString(entry.displayName ?? entry.name, "name", index);
  const country = requiredString(entry.country, "country", index);
  const streamUrl = requiredString(entry.url, "url", index);
  if (!isSafeStreamUrl(streamUrl)) {
    throw new Error(`Trusted channel catalog entry ${id} has an unsafe stream URL.`);
  }
  return {
    id,
    name,
    country,
    countryCode: countryCode(id, country),
    category: requiredString(entry.group ?? "General", "group", index),
    logo: typeof entry.logo === "string" ? entry.logo : "",
    streamUrl,
    viewers: 0,
    featured: false,
  };
});

export function getChannel(id: string): Channel | undefined {
  return channels.find((channel) => channel.id === id);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (net.isIPv4(address)) {
    const octets = address.split(".").map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 198 && octets[1] === 18) ||
      (octets[0] === 198 && octets[1] === 19) ||
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
      octets[0] === 0 ||
      octets[0] >= 224
    );
  }
  if (normalized.startsWith("::ffff:")) {
    return isPrivateAddress(normalized.slice("::ffff:".length));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

export async function assertSafeStreamUrl(streamUrl: string): Promise<void> {
  if (!isSafeStreamUrl(streamUrl)) {
    throw new Error("Stream URL is not permitted.");
  }
  await assertSafeHttpUrl(streamUrl);
}

export async function assertSafeHttpUrl(streamUrl: string): Promise<void> {
  if (!isSafeHttpUrl(streamUrl)) {
    throw new Error("Stream URL is not permitted.");
  }
  const hostname = new URL(streamUrl).hostname;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Stream host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Stream host is not publicly routable.");
  }
}