import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { createChannelsRouter } from "./channels";
import captionsRouter from "./captions";
import type { Channel } from "../lib/channel-catalog";

type ChannelVerifier = (channel: Channel) => Promise<{
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
}>;

export function createRouter(options: { verifyStream?: ChannelVerifier } = {}): IRouter {
  const router: IRouter = Router();
  router.use(healthRouter);
  router.use(createChannelsRouter({ verifyStream: options.verifyStream }));
  router.use(captionsRouter);
  return router;
}

export default createRouter();
