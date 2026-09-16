import { Router, type IRouter } from "express";
import { ListChannelsQueryParams, ListChannelsResponse, VerifyChannelParams, VerifyChannelResponse } from "@workspace/api-zod";
import { channels, getChannel } from "../lib/channel-catalog";

const router: IRouter = Router();

router.get("/channels", (req, res): void => {
  const parsed = ListChannelsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const search = parsed.data.search?.toLowerCase();
  const country = parsed.data.country?.toLowerCase();
  const result = channels.filter((channel) =>
    (!search || `${channel.name} ${channel.category} ${channel.country}`.toLowerCase().includes(search)) &&
    (!country || country === "all" || channel.countryCode.toLowerCase() === country || channel.country.toLowerCase() === country),
  );
  res.json(ListChannelsResponse.parse(result));
});

router.post("/channels/:channelId/verify", async (req, res): Promise<void> => {
  const parsed = VerifyChannelParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const channel = getChannel(parsed.data.channelId);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  const started = Date.now();
  try {
    const response = await fetch(channel.streamUrl, { signal: AbortSignal.timeout(8000) });
    const manifest = await response.text();
    const tracks = [...manifest.matchAll(/#EXT-X-MEDIA:TYPE=SUBTITLES,([^\n]+)/g)].map((match, index) => {
      const attrs = Object.fromEntries([...match[1].matchAll(/([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
      return { id: attrs["NAME"] || `track-${index}`, label: attrs["NAME"] || attrs["LANGUAGE"] || "Captions", language: attrs["LANGUAGE"] || "und", default: attrs["DEFAULT"] === "YES" };
    });
    res.json(VerifyChannelResponse.parse({ channelId: channel.id, available: response.ok, checkedAt: new Date(), latencyMs: Date.now() - started, error: response.ok ? null : `HTTP ${response.status}`, nativeCaptions: tracks }));
  } catch (error) {
    res.json(VerifyChannelResponse.parse({ channelId: channel.id, available: false, checkedAt: new Date(), latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Verification failed", nativeCaptions: [] }));
  }
});

export default router;