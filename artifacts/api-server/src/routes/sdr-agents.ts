import { Router } from "express";
import { db, sdrAgentsTable, sdrAgentSlotsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// GET /sdr/agents — list all agents + their attached slots
router.get("/sdr/agents", async (req, res) => {
  const userId = req.user!.id;
  const agents = await db.select().from(sdrAgentsTable).where(eq(sdrAgentsTable.userId, userId));
  const slots = await db.select().from(sdrAgentSlotsTable).where(eq(sdrAgentSlotsTable.userId, userId));
  const result = agents.map((a) => ({
    ...a,
    specialties: (() => { try { return JSON.parse(a.specialties ?? "[]"); } catch { return []; } })(),
    paymentLinks: (() => { try { return JSON.parse(a.paymentLinks ?? "[]"); } catch { return []; } })(),
    slots: slots.filter((s) => s.agentId === a.id).map((s) => s.slotNumber),
  }));
  res.json({ agents: result });
});

// POST /sdr/agents — create agent
router.post("/sdr/agents", async (req, res) => {
  const userId = req.user!.id;
  const { name, description, prompt, specialties, paymentLinks, avatarColor, slots: reqSlots,
          wooviEnabled, pixGateway, pixDescription, pixMinCents, pixMaxCents, callEnabled } = req.body as Record<string, any>;
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }

  const resolvedGateway = String(pixGateway ?? "").trim();
  const [agent] = await db.insert(sdrAgentsTable).values({
    userId,
    name: name.trim(),
    description: description?.trim() ?? "",
    prompt: prompt?.trim() ?? "",
    specialties: JSON.stringify(Array.isArray(specialties) ? specialties : []),
    paymentLinks: JSON.stringify(Array.isArray(paymentLinks) ? paymentLinks : []),
    pixGateway: resolvedGateway,
    wooviEnabled: resolvedGateway === "woovi" || Boolean(wooviEnabled),
    pixDescription: String(pixDescription ?? "").trim(),
    pixMinCents: Math.max(0, Math.round(Number(pixMinCents) || 0)),
    pixMaxCents: Math.max(0, Math.round(Number(pixMaxCents) || 0)),
    callEnabled: Boolean(callEnabled),
    avatarColor: avatarColor ?? "#22c55e",
    active: true,
  }).returning();

  // Attach slots if provided
  const slotNums: number[] = Array.isArray(reqSlots) ? reqSlots.filter((s: unknown) => typeof s === "number" && s >= 1 && s <= 5) : [];
  if (slotNums.length > 0) {
    for (const slotNumber of slotNums) {
      // Remove any other agent from this slot first
      await db.delete(sdrAgentSlotsTable).where(
        and(eq(sdrAgentSlotsTable.userId, userId), eq(sdrAgentSlotsTable.slotNumber, slotNumber))
      );
      await db.insert(sdrAgentSlotsTable).values({ userId, agentId: agent.id, slotNumber });
    }
  }

  res.status(201).json({
    agent: {
      ...agent,
      specialties: Array.isArray(specialties) ? specialties : [],
      paymentLinks: Array.isArray(paymentLinks) ? paymentLinks : [],
      slots: slotNums,
    },
  });
});

// PUT /sdr/agents/:id — update agent
router.put("/sdr/agents/:id", async (req, res) => {
  const userId = req.user!.id;
  const agentId = parseInt(req.params.id, 10);
  const { name, description, prompt, specialties, paymentLinks, avatarColor, active, slots: reqSlots,
          wooviEnabled, pixGateway, pixDescription, pixMinCents, pixMaxCents, callEnabled } = req.body as Record<string, any>;

  const [existing] = await db.select({ id: sdrAgentsTable.id })
    .from(sdrAgentsTable)
    .where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  const [updated] = await db.update(sdrAgentsTable).set({
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: description.trim() }),
    ...(prompt !== undefined && { prompt: prompt.trim() }),
    ...(specialties !== undefined && { specialties: JSON.stringify(Array.isArray(specialties) ? specialties : []) }),
    ...(paymentLinks !== undefined && { paymentLinks: JSON.stringify(Array.isArray(paymentLinks) ? paymentLinks : []) }),
    ...(pixGateway !== undefined && { pixGateway: String(pixGateway).trim() }),
    ...(pixGateway !== undefined && { wooviEnabled: String(pixGateway).trim() === "woovi" }),
    ...(pixGateway === undefined && wooviEnabled !== undefined && { wooviEnabled: Boolean(wooviEnabled) }),
    ...(pixDescription !== undefined && { pixDescription: String(pixDescription).trim() }),
    ...(pixMinCents !== undefined && { pixMinCents: Math.max(0, Math.round(Number(pixMinCents) || 0)) }),
    ...(pixMaxCents !== undefined && { pixMaxCents: Math.max(0, Math.round(Number(pixMaxCents) || 0)) }),
    ...(callEnabled !== undefined && { callEnabled: Boolean(callEnabled) }),
    ...(avatarColor !== undefined && { avatarColor }),
    ...(active !== undefined && { active: Boolean(active) }),
    updatedAt: new Date(),
  }).where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId))).returning();

  // Sync slots if provided
  if (Array.isArray(reqSlots)) {
    const slotNums: number[] = reqSlots.filter((s: unknown) => typeof s === "number" && s >= 1 && s <= 5);
    // Get current slots
    const currentSlots = await db.select({ slotNumber: sdrAgentSlotsTable.slotNumber })
      .from(sdrAgentSlotsTable)
      .where(and(eq(sdrAgentSlotsTable.userId, userId), eq(sdrAgentSlotsTable.agentId, agentId)));
    const currentNums = currentSlots.map(s => s.slotNumber);

    // Detach removed slots
    for (const sn of currentNums) {
      if (!slotNums.includes(sn)) {
        await db.delete(sdrAgentSlotsTable).where(
          and(eq(sdrAgentSlotsTable.userId, userId), eq(sdrAgentSlotsTable.agentId, agentId), eq(sdrAgentSlotsTable.slotNumber, sn))
        );
      }
    }
    // Attach new slots
    for (const sn of slotNums) {
      if (!currentNums.includes(sn)) {
        await db.delete(sdrAgentSlotsTable).where(
          and(eq(sdrAgentSlotsTable.userId, userId), eq(sdrAgentSlotsTable.slotNumber, sn))
        );
        await db.insert(sdrAgentSlotsTable).values({ userId, agentId, slotNumber: sn });
      }
    }
  }

  res.json({ agent: updated });
});

// PATCH /sdr/agents/:id/toggle — toggle active/inactive
router.patch("/sdr/agents/:id/toggle", async (req, res) => {
  const userId = req.user!.id;
  const agentId = parseInt(req.params.id, 10);

  const [existing] = await db.select({ id: sdrAgentsTable.id, active: sdrAgentsTable.active })
    .from(sdrAgentsTable)
    .where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  const [updated] = await db.update(sdrAgentsTable)
    .set({ active: !existing.active, updatedAt: new Date() })
    .where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId)))
    .returning();

  res.json({ agent: updated, active: updated.active });
});

// DELETE /sdr/agents/:id — delete agent
router.delete("/sdr/agents/:id", async (req, res) => {
  const userId = req.user!.id;
  const agentId = parseInt(req.params.id, 10);
  await db.delete(sdrAgentSlotsTable).where(and(eq(sdrAgentSlotsTable.agentId, agentId), eq(sdrAgentSlotsTable.userId, userId)));
  await db.delete(sdrAgentsTable).where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId)));
  res.json({ ok: true });
});

// POST /sdr/agents/:id/slots — attach agent to slot
router.post("/sdr/agents/:id/slots", async (req, res) => {
  const userId = req.user!.id;
  const agentId = parseInt(req.params.id, 10);
  const { slotNumber } = req.body as { slotNumber: number };

  if (!slotNumber || slotNumber < 1 || slotNumber > 5) {
    res.status(400).json({ error: "Slot inválido (1-5)" }); return;
  }

  const [existing] = await db.select({ id: sdrAgentsTable.id })
    .from(sdrAgentsTable)
    .where(and(eq(sdrAgentsTable.id, agentId), eq(sdrAgentsTable.userId, userId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  // Remove any other agent from this slot first
  await db.delete(sdrAgentSlotsTable).where(
    and(eq(sdrAgentSlotsTable.userId, userId), eq(sdrAgentSlotsTable.slotNumber, slotNumber))
  );

  await db.insert(sdrAgentSlotsTable).values({ userId, agentId, slotNumber });
  res.json({ ok: true, agentId, slotNumber });
});

// DELETE /sdr/agents/:id/slots/:slotNumber — detach agent from slot
router.delete("/sdr/agents/:id/slots/:slotNumber", async (req, res) => {
  const userId = req.user!.id;
  const agentId = parseInt(req.params.id, 10);
  const slotNumber = parseInt(req.params.slotNumber, 10);

  await db.delete(sdrAgentSlotsTable).where(
    and(
      eq(sdrAgentSlotsTable.userId, userId),
      eq(sdrAgentSlotsTable.agentId, agentId),
      eq(sdrAgentSlotsTable.slotNumber, slotNumber),
    )
  );
  res.json({ ok: true });
});

export default router;
