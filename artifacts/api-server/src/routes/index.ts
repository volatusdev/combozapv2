import { Router } from "express";
import authRouter from "./auth.js";
import sdrWhatsappRouter from "./sdr-whatsapp.js";
import sdrPlanRouter from "./sdr-plan.js";
import sdrAgentsRouter from "./sdr-agents.js";
import sdrFunnelRouter from "./sdr-funnel.js";
import sdrConvStatusRouter from "./sdr-conversation-status.js";
import sdrAssignmentsRouter from "./sdr-assignments.js";
import teamRouter from "./team.js";
import healthRouter from "./health.js";
import adminRouter from "./admin.js";
import tutorialsRouter from "./tutorials.js";
import sdrPixRouter from "./sdr-pix.js";
import callsRouter from "./calls.js";
import sdrAcquirersRouter from "./sdr-acquirers.js";

const router = Router();

router.use(healthRouter);

router.use(authRouter);
router.use(sdrWhatsappRouter);
router.use(sdrPlanRouter);
router.use(sdrAgentsRouter);
router.use(sdrFunnelRouter);
router.use(sdrConvStatusRouter);
router.use(sdrAssignmentsRouter);
router.use(teamRouter);
router.use(tutorialsRouter);
router.use(sdrPixRouter);
router.use(callsRouter);
router.use(sdrAcquirersRouter);
router.use(adminRouter);

export default router;
