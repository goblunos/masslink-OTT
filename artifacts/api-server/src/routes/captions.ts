import { Router, type IRouter } from "express";
import {
  StartCaptionSessionBody, StartCaptionSessionResponse, GetCaptionSessionParams,
  GetCaptionSessionResponse, StopCaptionSessionParams, ListCaptionCuesParams, ListCaptionCuesResponse,
} from "@workspace/api-zod";
import { getChannel } from "../lib/channel-catalog";
import { getCues, getSession, startSession, stopSession } from "../lib/caption-sessions";

const router: IRouter = Router();
const starts = new Map<string, number[]>();

router.post("/captions/sessions", async (req, res): Promise<void> => {
  const parsed = StartCaptionSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const channel = getChannel(parsed.data.channelId);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  const ip = req.ip || "unknown";
  const now = Date.now();
  const recent = (starts.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 6) { res.status(429).json({ error: "Caption start rate limit reached" }); return; }
  starts.set(ip, [...recent, now]);
  try {
    const session = await startSession(channel.id, channel.streamUrl, parsed.data.language, ip);
    res.status(201).json(StartCaptionSessionResponse.parse(session));
  } catch (error) {
    if (error instanceof Error && error.message === "CAPACITY") {
      res.status(429).json({ error: "All live caption slots are in use. Native captions remain available." }); return;
    }
    throw error;
  }
});

router.get("/captions/sessions/:sessionId", (req, res): void => {
  const parsed = GetCaptionSessionParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const session = getSession(parsed.data.sessionId);
  if (!session) { res.status(404).json({ error: "Caption session expired" }); return; }
  res.json(GetCaptionSessionResponse.parse(session));
});

router.get("/captions/sessions/:sessionId/cues", (req, res): void => {
  const parsed = ListCaptionCuesParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const cues = getCues(parsed.data.sessionId);
  if (!cues) { res.status(404).json({ error: "Caption session expired" }); return; }
  res.json(ListCaptionCuesResponse.parse(cues));
});

router.delete("/captions/sessions/:sessionId", async (req, res): Promise<void> => {
  const parsed = StopCaptionSessionParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await stopSession(parsed.data.sessionId);
  res.sendStatus(204);
});

export default router;