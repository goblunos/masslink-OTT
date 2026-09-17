import { Router, type IRouter } from "express";
import { ListChannelsQueryParams, ListChannelsResponse, VerifyChannelParams, VerifyChannelResponse } from "@workspace/api-zod";
import { assertSafeStreamUrl, channels, getChannel, type Channel } from "../lib/channel-catalog";

type Verification = {
  channelId: string;
  available: boolean;
  checkedAt: Date;
  latencyMs: number;
  error: string | null;
  nativeCaptions: Array<{
    id: string;
    label: string;
    language: string;
    default: boolean;
  }>;
};

type VerifyStream = (channel: Channel) => Promise<Verification>;

const verifyStream: VerifyStream = async (channel) => {
  const started = Date.now();
  try {
    await assertSafeStreamUrl(channel.streamUrl);
    const response = await fetch(channel.streamUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain" },
    });
    const manifest = await response.text();
    const tracks = [...manifest.matchAll(/#EXT-X-MEDIA:TYPE=SUBTITLES,([^\n]+)/g)].map((match, index) => {
      const attrs = Object.fromEntries([...match[1].matchAll(/([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g)].map((m) => [m[1], m[2] ?? m[3]]));
      return { id: attrs["NAME"] || `track-${index}`, label: attrs["NAME"] || attrs["LANGUAGE"] || "Captions", language: attrs["LANGUAGE"] || "und", default: attrs["DEFAULT"] === "YES" };
    });
    return {
      channelId: channel.id,
      available: response.ok,
      checkedAt: new Date(),
      latencyMs: Date.now() - started,
      error: response.ok ? null : `HTTP ${response.status}`,
      nativeCaptions: tracks,
    };
  } catch {
    return {
      channelId: channel.id,
      available: false,
      checkedAt: new Date(),
      latencyMs: Date.now() - started,
      error: "Stream verification failed",
      nativeCaptions: [],
    };
  }
};

export function createChannelsRouter(options: { verifyStream?: VerifyStream } = {}): IRouter {
  const router: IRouter = Router();
  const verifier = options.verifyStream ?? verifyStream;

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
    res.json(VerifyChannelResponse.parse(await verifier(channel)));
  });

  return router;
}

export default createChannelsRouter();