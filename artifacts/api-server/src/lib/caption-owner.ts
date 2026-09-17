import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const OWNER_COOKIE = "masslink_caption_owner";
const OWNER_COOKIE_MAX_AGE = 24 * 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required for caption ownership.");
  return value;
}

function signature(ownerId: string): string {
  return createHmac("sha256", secret()).update(ownerId).digest("base64url");
}

function encode(ownerId: string): string {
  return `${ownerId}.${signature(ownerId)}`;
}

function decode(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const ownerId = value.slice(0, separator);
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) return null;
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(ownerId));
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }
  return ownerId;
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const item of header.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name !== OWNER_COOKIE) continue;
    try {
      return decodeURIComponent(parts.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getCaptionOwner(request: Request, response: Response): string {
  const existing = decode(cookieValue(request));
  if (existing) return existing;
  const ownerId = randomUUID();
  response.append(
    "Set-Cookie",
    `${OWNER_COOKIE}=${encodeURIComponent(encode(ownerId))}; Max-Age=${OWNER_COOKIE_MAX_AGE}; Path=/api/captions; HttpOnly; SameSite=Lax; Secure`,
  );
  return ownerId;
}