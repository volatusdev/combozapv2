import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./lib/session.js";
import { db } from "@workspace/db";
import { sdrPixChargesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const app: Express = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const isProd = process.env.NODE_ENV === "production";

const productionOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["https://combozap.com", "https://www.combozap.com", "https://app.combozap.com"];

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }
    const allowed = productionOrigins.some((o) => origin === o);
    cb(null, isProd ? allowed : true);
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "too_many_requests", message: "Muitas tentativas. Tente em 15 minutos." },
  skip: () => !isProd,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "too_many_requests", message: "Limite de requisições atingido." },
  skip: () => !isProd,
});

// Health check — registered first, before auth or rate-limiting touches it
app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });

// Public PIX page endpoint — no auth required, works for all gateways
app.get("/api/pix/:correlationId", async (req, res) => {
  const { correlationId } = req.params;
  if (!correlationId || correlationId.length > 120) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    // Check DB first — works for all gateways (Woovi, Asaas, MP, Pagar.me)
    const [dbCharge] = await db.select()
      .from(sdrPixChargesTable)
      .where(eq(sdrPixChargesTable.correlationId, correlationId))
      .limit(1);

    if (dbCharge?.brCode) {
      res.json({
        brCode: dbCharge.brCode,
        qrCodeImage: dbCharge.qrCodeImage || null,
        valueCents: dbCharge.valueCents,
        description: dbCharge.description,
        status: dbCharge.status,
      });
      return;
    }

    // Fallback: fetch from Woovi API (legacy charges created before DB storage)
    const apiKey = process.env.WOOVI_API_KEY;
    if (!apiKey) { res.status(404).json({ error: "Cobrança não encontrada" }); return; }
    const r = await fetch(`https://api.openpix.com.br/api/v1/charge/${encodeURIComponent(correlationId)}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) { res.status(r.status).json({ error: "Cobrança não encontrada" }); return; }
    const data = await r.json() as { charge?: { brCode?: string; qrCodeImage?: string; value?: number; comment?: string; status?: string } };
    const charge = data.charge;
    if (!charge?.brCode) { res.status(404).json({ error: "Cobrança sem dados" }); return; }
    res.json({
      brCode: charge.brCode,
      qrCodeImage: charge.qrCodeImage ?? null,
      valueCents: charge.value ?? 0,
      description: charge.comment ?? "",
      status: charge.status ?? "PENDING",
    });
  } catch (err) {
    logger.error({ err }, "PIX public fetch error");
    res.status(500).json({ error: "Erro ao buscar cobrança" });
  }
});

app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any unhandled error from async route handlers (Express 5 forwards them here).
// Always returns JSON so the client never gets an HTML error page.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "internal_error", message });
  }
});

export default app;
