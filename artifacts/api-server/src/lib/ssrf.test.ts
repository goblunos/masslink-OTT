import { describe, expect, it } from "vitest";
import {
  assertSafeHttpUrl,
  assertSafeStreamUrl,
  isSafeStreamUrl,
} from "./channel-catalog";

describe("caption egress URL restrictions", () => {
  it("only accepts HTTPS public-host catalog stream URLs", () => {
    expect(isSafeStreamUrl("https://127.0.0.1/private.m3u8")).toBe(false);
    expect(isSafeStreamUrl("http://public.example/live.m3u8")).toBe(false);
    expect(isSafeStreamUrl("https://public.example/live.m3u8")).toBe(true);
  });

  it("rejects private and local nested HTTP(S) resources", async () => {
    await expect(assertSafeHttpUrl("http://127.0.0.1/private.ts")).rejects.toThrow(
      "not permitted",
    );
    await expect(assertSafeHttpUrl("https://localhost/live.m3u8")).rejects.toThrow(
      "not permitted",
    );
    await expect(assertSafeStreamUrl("http://public.example/live.m3u8")).rejects.toThrow(
      "not permitted",
    );
  });
});