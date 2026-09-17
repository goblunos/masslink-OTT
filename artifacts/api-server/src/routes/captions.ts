import { Router, type IRouter } from "express";
import {
  StartCaptionSessionBody, StartCaptionSessionResponse, GetCaptionSessionParams,
  GetCaptionSessionResponse, StopCaptionSessionParams, ListCaptionCuesParams, ListCaptionCuesResponse,
} from "@workspace/api-zod";
import { getCaptionOwner } from "../lib/caption-owner";
import { getChannel } from "../lib/channel-catalog";
import { getCues, getSession, startSession, stopSession } from "../lib/caption-sessions";

const router: IRouter = Router();
const starts = new Map<string, number[]>();

router.post("/captions/sessions", async (req, res): Promise<void> => {
  const parsed = StartCaptionSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const channel = getChannel(parsed.data.channelId);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  const ownerId = getCaptionOwner(req, res);
  const ip = req.ip || "unknown";
  const now = Date.now();
  for (const [address, times] of starts) {
    const fresh = times.filter((time) => now - time < 60_000);
    if (fresh.length === 0) starts.delete(address);
    else starts.set(address, fresh);
  }
  const recent = starts.get(ip) ?? [];
  if (recent.length >= 6) { res.status(429).json({ error: "Caption start rate limit reached" }); return; }
  starts.set(ip, [...recent, now]);
  try {
    // The request's streamUrl is intentionally ignored. The server only ever
    // captures the URL from its trusted catalog entry.
    const session = await startSession(channel.id, channel.streamUrl, parsed.data.language, ownerId);
    res.status(201).json(StartCaptionSessionResponse.parse(session));
  } catch (error) {
    if (error instanceof Error && error.message === "CAPACITY") {
      res.status(429).json({ error: "All live caption slots are in use. Native captions remain available." }); return;
    }
    req.log.warn(
      { channelId: channel.id, error: error instanceof Error ? error.message : "unknown error" },
      "Caption session could not start",
    );
    res.status(503).json({ error: "Live captions are temporarily unavailable." });
  }
});

router.get("/captions/sessions/:sessionId", (req, res): void => {
  const parsed = GetCaptionSessionParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ownerId = getCaptionOwner(req, res);
  const session = getSession(parsed.data.sessionId, ownerId);
  if (!session) { res.status(404).json({ error: "Caption session expired" }); return; }
  res.json(GetCaptionSessionResponse.parse(session));
});

router.get("/captions/sessions/:sessionId/cues", (req, res): void => {
  const parsed = ListCaptionCuesParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ownerId = getCaptionOwner(req, res);
  const cues = getCues(parsed.data.sessionId, ownerId);
  if (!cues) { res.status(404).json({ error: "Caption session expired" }); return; }
  res.json(ListCaptionCuesResponse.parse(cues));
});

router.delete("/captions/sessions/:sessionId", async (req, res): Promise<void> => {
  const parsed = StopCaptionSessionParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ownerId = getCaptionOwner(req, res);
  const stopped = await stopSession(parsed.data.sessionId, ownerId);
  if (!stopped) { res.status(404).json({ error: "Caption session expired" }); return; }
  res.sendStatus(204);
});

export default router;