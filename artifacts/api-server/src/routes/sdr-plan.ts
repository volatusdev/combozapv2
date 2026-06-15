import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { rcGet, rcSet, rcDel } from "../lib/response-cache.js";
import { db } from "@workspace/db";
import { sdrUserPlansTable, sdrOrdersTable, sdrSlotsTable, sdrPixChargesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const WOOVI_BASE = "https://api.woovi.com/api/v1";

const SDR_PLANS: Record<string, { label: string; maxSlots: number; valueCents: number; price: string }> = {
  starter:      { label: "ComboZap Starter", maxSlots: 1, valueCents: 14790, price: "R$ 147,90" },
  iniciante:    { label: "ComboZap Starter", maxSlots: 1, valueCents: 14790, price: "R$ 147,90" },
};

router.get("/sdr/plan/current", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ck = `plan:${userId}`;
  const hit = rcGet<{ plan: unknown; slots: unknown[] }>(ck);
  if (hit) { res.json(hit); return; }

  const [plan] = await db
    .select().from(sdrUserPlansTable).where(eq(sdrUserPlansTable.userId, userId)).limit(1);

  if (!plan) { res.json({ plan: null, slots: [] }); return; }

  const slots = await db
    .select().from(sdrSlotsTable).where(eq(sdrSlotsTable.userId, userId))
    .orderBy(sdrSlotsTable.slotNumber);

  const slotMap = new Map(slots.map(s => [s.slotNumber, s]));
  const allSlots = Array.from({ length: plan.maxSlots }, (_, i) => {
    const n = i + 1;
    return slotMap.get(n) ?? { id: -n, userId, slotNumber: n, name: `WhatsApp ${n}`, updatedAt: new Date() };
  });

  const result = { plan, slots: allSlots };
  rcSet(ck, result, 30_000); // 30s TTL — plan rarely changes
  res.json(result);
});

router.get("/sdr/plan/orders", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const orders = await db
    .select().from(sdrOrdersTable).where(eq(sdrOrdersTable.userId, userId))
    .orderBy(desc(sdrOrdersTable.createdAt));
  res.json({ orders });
});

router.post("/sdr/plan/purchase", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const appId = process.env.WOOVI_APP_ID;
  if (!appId) { res.status(503).json({ error: "Pagamento PIX não configurado" }); return; }

  const { planType, name, email, whatsapp, cpf } = req.body as Record<string, string>;
  const planData = SDR_PLANS[planType?.toLowerCase()];
  if (!planData) { res.status(400).json({ error: "Plano SDR inválido" }); return; }
  if (!name?.trim() || !email?.trim() || !whatsapp?.trim() || !cpf?.trim()) {
    res.status(400).json({ error: "Preencha todos os campos" }); return;
  }

  const taxIDClean = cpf.replace(/\D/g, "");
  if (taxIDClean.length !== 11 && taxIDClean.length !== 14) {
    res.status(400).json({ error: "CPF ou CNPJ inválido" }); return;
  }

  const correlationId = `combozap-sdr-${planType.toLowerCase()}-${userId}-${Date.now()}`;

  try {
    const wooviRes = await fetch(`${WOOVI_BASE}/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": appId },
      body: JSON.stringify({
        correlationID: correlationId,
        value: planData.valueCents,
        comment: `${planData.label} - VolatusNet SDR`,
        customer: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: whatsapp.replace(/\D/g, ""),
          taxID: taxIDClean,
        },
        expiresIn: 3600,
      }),
    });

    const body = await wooviRes.json() as Record<string, unknown>;
    if (!wooviRes.ok) {
      res.status(502).json({ error: (body?.error ?? body?.message ?? "Erro ao gerar cobrança PIX") as string });
      return;
    }

    const charge = (body.charge ?? body) as Record<string, unknown>;

    await db.insert(sdrOrdersTable).values({
      userId,
      planType: planType.toLowerCase(),
      maxSlots: planData.maxSlots,
      valueCents: planData.valueCents,
      correlationId,
      status: "PENDING",
      pixBrCode: charge.brCode as string ?? null,
    }).onConflictDoNothing();

    res.json({
      correlationId,
      qrCodeImage: charge.qrCodeImage ?? null,
      brCode: charge.brCode ?? null,
      valueCents: planData.valueCents,
      price: planData.price,
      label: planData.label,
    });
  } catch (err) {
    req.log.error(err, "Woovi SDR fetch failed");
    res.status(500).json({ error: "Erro interno ao gerar PIX" });
  }
});

router.get("/sdr/plan/status/:correlationId", requireAuth, async (req, res) => {
  const appId = process.env.WOOVI_APP_ID;
  if (!appId) { res.status(503).json({ error: "Pagamento não configurado" }); return; }

  try {
    const wooviRes = await fetch(
      `${WOOVI_BASE}/charge?correlationID=${encodeURIComponent(String(req.params.correlationId))}`,
      { headers: { "Authorization": appId } },
    );
    const body = await wooviRes.json() as Record<string, unknown>;
    const status = ((body.charge as Record<string, unknown>)?.status ?? body.status ?? "ACTIVE") as string;

    if (status === "COMPLETED") {
      await activatePlan(req.session.userId!, String(req.params.correlationId), req.log);
    }

    res.json({ status });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/sdr/plan/webhook", async (req, res) => {
  try {
    const payload = req.body as Record<string, unknown>;
    const event: string = payload?.event as string ?? "";
    if (!event.includes("COMPLETED")) { res.json({ ok: true, skipped: true }); return; }

    const charge = (payload?.charge ?? payload) as Record<string, unknown>;
    const correlationId: string = charge?.correlationID as string ?? "";
    if (!correlationId) { res.json({ ok: true }); return; }

    // Verify with Woovi API that the charge is actually COMPLETED before trusting the webhook
    const appId = process.env.WOOVI_APP_ID;
    if (!appId) {
      req.log.warn("Webhook recebido mas WOOVI_APP_ID não configurado — ignorando");
      res.json({ ok: true }); return;
    }

    let actualStatus = "";
    try {
      const verifyRes = await fetch(
        `${WOOVI_BASE}/charge?correlationID=${encodeURIComponent(correlationId)}`,
        { headers: { "Authorization": appId } },
      );
      if (verifyRes.ok) {
        const verifyBody = await verifyRes.json() as Record<string, unknown>;
        actualStatus = ((verifyBody.charge as Record<string, unknown>)?.status ?? verifyBody.status ?? "") as string;
      }
    } catch (verifyErr) {
      req.log.error(verifyErr, "Webhook: falha ao verificar cobrança na Woovi");
    }

    if (actualStatus !== "COMPLETED") {
      req.log.warn({ correlationId, actualStatus }, "Webhook rejeitado: status não confirmado pela Woovi");
      res.json({ ok: true, skipped: true }); return;
    }

    const [order] = await db
      .select().from(sdrOrdersTable).where(eq(sdrOrdersTable.correlationId, correlationId)).limit(1);

    if (order) {
      await activatePlan(order.userId, correlationId, req.log);
    }

    // Also handle SDR PIX charges generated by AI agents
    const [pixCharge] = await db
      .select()
      .from(sdrPixChargesTable)
      .where(eq(sdrPixChargesTable.correlationId, correlationId))
      .limit(1);

    if (pixCharge && pixCharge.status === "PENDING") {
      await db.update(sdrPixChargesTable)
        .set({ status: "COMPLETED", paidAt: new Date() })
        .where(eq(sdrPixChargesTable.correlationId, correlationId));
      req.log.info({ correlationId, userId: pixCharge.userId }, "SDR PIX charge completed via webhook");
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Erro no webhook SDR");
    res.status(500).json({ error: "Erro interno" });
  }
});

router.put("/sdr/slots/:slotNumber/name", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slotNumber = parseInt(String(req.params.slotNumber), 10);
  const { name } = req.body as { name: string };

  if (!name?.trim() || isNaN(slotNumber)) {
    res.status(400).json({ error: "Nome e número do slot obrigatórios" }); return;
  }

  const [plan] = await db
    .select().from(sdrUserPlansTable).where(eq(sdrUserPlansTable.userId, userId)).limit(1);

  if (!plan || slotNumber < 1 || slotNumber > plan.maxSlots) {
    res.status(403).json({ error: "Slot não disponível no seu plano" }); return;
  }

  await db.insert(sdrSlotsTable).values({
    userId, slotNumber, name: name.trim(),
  }).onConflictDoNothing();

  await db.update(sdrSlotsTable)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(and(eq(sdrSlotsTable.userId, userId), eq(sdrSlotsTable.slotNumber, slotNumber)));

  rcDel(`plan:${userId}`); // slot name change invalidates cached plan
  res.json({ ok: true, name: name.trim() });
});

async function activatePlan(userId: number, correlationId: string, log: unknown) {
  try {
    const [order] = await db
      .select().from(sdrOrdersTable)
      .where(and(eq(sdrOrdersTable.correlationId, correlationId), eq(sdrOrdersTable.userId, userId)))
      .limit(1);

    if (!order) return;

    await db.update(sdrOrdersTable)
      .set({ status: "COMPLETED" })
      .where(eq(sdrOrdersTable.correlationId, correlationId));

    await db.insert(sdrUserPlansTable).values({
      userId,
      planType: order.planType,
      maxSlots: order.maxSlots,
      purchasedAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    await db.update(sdrUserPlansTable)
      .set({ planType: order.planType, maxSlots: order.maxSlots, updatedAt: new Date() })
      .where(eq(sdrUserPlansTable.userId, userId));

    rcDel(`plan:${userId}`); // plan activated — bust cache
  } catch (err) {
    (log as { error: (err: unknown, msg: string) => void }).error(err, "Erro ao ativar plano");
  }
}

export default router;
