import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixtureDirectory = path.resolve(
  import.meta.dirname,
  "../../api-server/test/fixtures/speech-hls",
);
const apiBaseURL = "http://127.0.0.1:4312";

test("English caption opt-in, playback, expiry, pause, and close lifecycle", async ({ page }) => {
  const captionStarts: string[] = [];
  const releaseChunk = async (index: number) => {
    const response = await page.request.post(`${apiBaseURL}/__test/release/${index}`);
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({ released: index });
  };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/captions/sessions")) {
      captionStarts.push(request.url());
    }
  });

  // Keep the catalog immutable: only the network source at the browser
  // boundary is redirected to the checked-in local HLS fixture.
  await page.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith(".m3u8")) {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.apple.mpegurl",
        headers: { "access-control-allow-origin": "*" },
        body: fs.readFileSync(path.join(fixtureDirectory, "speech.m3u8")),
      });
      return;
    }
    const segment = pathname.match(/segment-\d+\.ts$/)?.[0];
    if (segment) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp2t",
        headers: { "access-control-allow-origin": "*" },
        body: fs.readFileSync(path.join(fixtureDirectory, segment)),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  const card = page.locator('[data-testid^="card-channel-"]').first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Play .* live/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const video = page.locator('video[aria-label$="live player"]');
  // The real HLS media element is muted only in the test to avoid an
  // autoplay policy masking whether media time advances.
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.muted = true;
  });
  await expect.poll(async () => video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    if (media.paused) void media.play().catch(() => undefined);
    return media.currentTime;
  }), {
    timeout: 20_000,
  }).toBeGreaterThan(1);
  expect(captionStarts).toHaveLength(0);

  // Safari exposes native HLS subtitles through the media element's
  // TextTrackList. Add a deterministic native English track at that boundary
  // so this regression does not depend on public-stream or WebKit HLS support.
  await video.evaluate((element) => {
    (element as HTMLVideoElement).addTextTrack("subtitles", "English", "en");
  });
  await page.getByTestId("button-caption-settings").click();
  const nativeSelect = page.getByTestId("select-native-caption");
  await expect(nativeSelect).toContainText("English");
  await nativeSelect.selectOption({ label: "English" });
  await expect.poll(async () => video.evaluate((element) =>
    Array.from((element as HTMLVideoElement).textTracks).map((track) => track.mode),
  )).toEqual(["showing"]);
  await expect(page.getByTestId("text-live-caption")).toBeHidden();
  expect(captionStarts).toHaveLength(0);

  const toggle = page.getByTestId("button-toggle-ai-captions");
  const startResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().includes("/api/captions/sessions") &&
    response.status() === 201,
  );
  await toggle.click();
  const sessionId = (await (await startResponse).json()).id as string;
  expect(captionStarts).toHaveLength(1);
  await expect(nativeSelect).toHaveValue("none");
  await expect.poll(async () => video.evaluate((element) =>
    Array.from((element as HTMLVideoElement).textTracks).map((track) => track.mode),
  )).toEqual(["disabled"]);
  await expect(page.getByTestId("status-ai-captions")).toContainText(/starting|listening/);

  await page.getByTestId("button-toggle-transcript").click();
  await releaseChunk(0);
  await expect(page.getByTestId("text-live-caption")).toContainText("English fixture sentence", {
    timeout: 30_000,
  });
  await expect.poll(async () => video.evaluate((element) =>
    Array.from((element as HTMLVideoElement).textTracks).filter((track) => track.mode === "showing").length,
  )).toBe(0);
  await expect(page.getByRole("complementary", { name: "English live transcript" }))
    .toContainText("fixture sentence 0");
  await page.screenshot({
    path: "test-results/caption-journey-english-overlay.png",
    fullPage: false,
  });

  const firstOverlayStartedAt = Date.now();
  const cues = await page.evaluate(async (id) => {
    const response = await fetch(`/api/captions/sessions/${id}/cues`);
    return response.json() as Promise<Array<{ startMs: number; endMs: number }>>;
  }, sessionId);
  const firstCue = cues[0];
  expect(firstCue).toBeDefined();
  const cueDurationMs = (firstCue?.endMs ?? 0) - (firstCue?.startMs ?? 0);
  expect(cueDurationMs).toBe(6_000);
  await expect(page.getByTestId("text-live-caption")).toBeHidden({ timeout: 12_000 });
  expect(Date.now() - firstOverlayStartedAt).toBeGreaterThanOrEqual(cueDurationMs - 750);
  expect(await page.evaluate(async (id) => {
    const response = await fetch(`/api/captions/sessions/${id}`);
    return response.status;
  }, sessionId)).toBe(200);

  // Release cue 1 only once cue 0 has expired, then pause while cue 1 is
  // visibly active. Pausing must clear the overlay rather than leaving stale
  // text over a frozen frame.
  await releaseChunk(1);
  await expect(page.getByTestId("text-live-caption")).toContainText("fixture sentence 1", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("text-live-caption")).toBeVisible();
  await page.getByTestId("button-toggle-play").click();
  await expect.poll(async () => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByTestId("text-live-caption")).toBeHidden();

  // Release cue 2 while paused. It must update the transcript, but must not
  // queue for overlay playback after resume.
  await releaseChunk(2);
  await expect.poll(async () => page.evaluate(async (id) => {
    const response = await fetch(`/api/captions/sessions/${id}/cues`);
    return (await response.json() as unknown[]).length;
  }, sessionId), { timeout: 20_000 }).toBe(3);
  await expect(page.getByRole("complementary", { name: "English live transcript" }))
    .toContainText("fixture sentence 2", { timeout: 4_000 });
  await expect(page.getByTestId("text-live-caption")).toBeHidden();

  await page.getByTestId("button-toggle-play").click();
  await expect.poll(async () => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
  await expect(page.getByTestId("text-live-caption")).toBeHidden({ timeout: 4_000 });

  // A newly released cue after resume is allowed to display normally.
  await releaseChunk(3);
  await expect(page.getByTestId("text-live-caption")).toContainText("fixture sentence 3", {
    timeout: 20_000,
  });

  const deleteResponse = page.waitForResponse((response) =>
    response.request().method() === "DELETE" &&
    response.url().includes(`/api/captions/sessions/${sessionId}`),
  );
  await page.getByTestId("button-close-player").click();
  await expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => page.evaluate(async (id) => {
    const response = await fetch(`/api/captions/sessions/${id}`);
    return response.status;
  }, sessionId)).toBe(404);
});