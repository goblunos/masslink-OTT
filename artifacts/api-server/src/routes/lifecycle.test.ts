import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import { stopSession } from "../lib/caption-sessions";

const created: string[] = [];

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-caption-session-secret";
});

afterEach(async () => {
  await Promise.all(created.splice(0).map((id) => stopSession(id)));
});

describe("Masslink playback and caption lifecycle", () => {
  it("lists channels and verifies an HLS stream", async () => {
    const catalog = await request(app).get("/api/channels").expect(200);
    expect(catalog.body.length).toBeGreaterThan(0);
    const channel = catalog.body[0];
    const verification = await request(app)
      .post(`/api/channels/${channel.id}/verify`)
      .expect(200);
    expect(verification.body.channelId).toBe(channel.id);
    expect(Array.isArray(verification.body.nativeCaptions)).toBe(true);
  }, 15_000);

  it("creates captions only after an explicit start and cleans them up", async () => {
    const catalog = await request(app).get("/api/channels").expect(200);
    const channel = catalog.body[0];
    const start = await request(app)
      .post("/api/captions/sessions")
      .send({ channelId: channel.id, streamUrl: channel.streamUrl, language: "auto" })
      .expect(201);
    const cookie = (start.headers["set-cookie"]?.[0] ?? "").split(";")[0];
    created.push(start.body.id);
    expect(start.body.status).toBe("starting");

    await request(app)
      .get(`/api/captions/sessions/${start.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    await request(app)
      .delete(`/api/captions/sessions/${start.body.id}`)
      .set("Cookie", cookie)
      .expect(204);
    created.splice(created.indexOf(start.body.id), 1);
    await request(app).get(`/api/captions/sessions/${start.body.id}`).expect(404);
  });

  it("rejects unknown channels instead of fetching arbitrary stream URLs", async () => {
    await request(app)
      .post("/api/captions/sessions")
      .send({ channelId: "unknown", streamUrl: "http://127.0.0.1/private", language: "auto" })
      .expect(404);
  });

  it("keeps ownership across changing transport addresses with the signed cookie", async () => {
    const catalog = await request(app).get("/api/channels").expect(200);
    const channel = catalog.body[0];
    const start = await request(app)
      .post("/api/captions/sessions")
      .send({ channelId: channel.id, streamUrl: channel.streamUrl, language: "auto" })
      .expect(201);
    const cookie = (start.headers["set-cookie"]?.[0] ?? "").split(";")[0];
    expect(cookie).toMatch(/^masslink_caption_owner=/);
    created.push(start.body.id);

    await request(app)
      .get(`/api/captions/sessions/${start.body.id}`)
      .set("Cookie", cookie)
      .set("X-Forwarded-For", "198.51.100.20")
      .expect(200);
    await request(app)
      .get(`/api/captions/sessions/${start.body.id}`)
      .set("Cookie", "masslink_caption_owner=invalid")
      .set("X-Forwarded-For", "198.51.100.21")
      .expect(404);
  });
});