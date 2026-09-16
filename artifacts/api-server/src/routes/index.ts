import { Router, type IRouter } from "express";
import healthRouter from "./health";
import channelsRouter from "./channels";
import captionsRouter from "./captions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(channelsRouter);
router.use(captionsRouter);

export default router;
