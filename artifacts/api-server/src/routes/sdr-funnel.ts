import { Router } from "express";
import { db } from "@workspace/db";
import { sdrFunnelStagesTable, sdrFunnelCardsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /sdr/funnel — all stages + cards ────────────────────────────────────
router.get("/sdr/funnel", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const stages = await db.select()
    .from(sdrFunnelStagesTable)
    .where(eq(sdrFunnelStagesTable.userId, userId))
    .orderBy(asc(sdrFunnelStagesTable.position));

  const cards = await db.select()
    .from(sdrFunnelCardsTable)
    .where(eq(sdrFunnelCardsTable.userId, userId))
    .orderBy(asc(sdrFunnelCardsTable.position));

  const result = stages.map(s => ({
    ...s,
    cards: cards.filter(c => c.stageId === s.id),
  }));

  res.json({ stages: result });
});

// ── POST /sdr/funnel/stages — create stage ───────────────────────────────────
router.post("/sdr/funnel/stages", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { name, color } = req.body as { name: string; color?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Nome obrigatório" }); return; }

  const last = await db.select({ pos: sdrFunnelStagesTable.position })
    .from(sdrFunnelStagesTable)
    .where(eq(sdrFunnelStagesTable.userId, userId))
    .orderBy(asc(sdrFunnelStagesTable.position));

  const position = last.length > 0 ? (last[last.length - 1].pos + 1) : 0;

  const [stage] = await db.insert(sdrFunnelStagesTable)
    .values({ userId, name: name.trim(), color: color?.trim() || "#3b82f6", position })
    .returning();

  res.json({ stage });
});

// ── PUT /sdr/funnel/stages/:id — rename/recolor stage ────────────────────────
router.put("/sdr/funnel/stages/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params.id);
  const { name, color } = req.body as { name?: string; color?: string };
  if (name !== undefined && !name.trim()) { res.status(400).json({ error: "Nome obrigatório" }); return; }

  const set: Partial<typeof sdrFunnelStagesTable.$inferInsert> = {};
  if (name !== undefined) set.name = name.trim();
  if (color !== undefined) set.color = color.trim();

  if (Object.keys(set).length === 0) { res.status(400).json({ error: "Nada para atualizar" }); return; }

  const [updated] = await db.update(sdrFunnelStagesTable)
    .set(set)
    .where(and(eq(sdrFunnelStagesTable.id, id), eq(sdrFunnelStagesTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Coluna não encontrada" }); return; }
  res.json({ stage: updated });
});

// ── PATCH /sdr/funnel/stages/reorder — reorder stages ─────────────────────────
router.patch("/sdr/funnel/stages/reorder", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { order } = req.body as { order: number[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order inválido" }); return; }

  await Promise.all(order.map((id, idx) =>
    db.update(sdrFunnelStagesTable)
      .set({ position: idx })
      .where(and(eq(sdrFunnelStagesTable.id, id), eq(sdrFunnelStagesTable.userId, userId)))
  ));

  res.json({ ok: true });
});

// ── DELETE /sdr/funnel/stages/:id — delete stage (must be empty) ─────────────
router.delete("/sdr/funnel/stages/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params.id);

  const cards = await db.select({ id: sdrFunnelCardsTable.id })
    .from(sdrFunnelCardsTable)
    .where(and(eq(sdrFunnelCardsTable.stageId, id), eq(sdrFunnelCardsTable.userId, userId)))
    .limit(1);

  if (cards.length > 0) {
    res.status(400).json({ error: "Mova ou remova os cards antes de excluir a coluna" });
    return;
  }

  await db.delete(sdrFunnelStagesTable)
    .where(and(eq(sdrFunnelStagesTable.id, id), eq(sdrFunnelStagesTable.userId, userId)));

  res.json({ ok: true });
});

// ── POST /sdr/funnel/cards — create card ─────────────────────────────────────
router.post("/sdr/funnel/cards", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { stageId, jid, contactName, contactPhone, title, valueCents, notes } =
    req.body as {
      stageId: number;
      jid?: string;
      contactName?: string;
      contactPhone?: string;
      title?: string;
      valueCents?: number | null;
      notes?: string;
    };

  if (!stageId) { res.status(400).json({ error: "stageId obrigatório" }); return; }

  // Verify stage belongs to this user
  const [stage] = await db.select({ id: sdrFunnelStagesTable.id })
    .from(sdrFunnelStagesTable)
    .where(and(eq(sdrFunnelStagesTable.id, stageId), eq(sdrFunnelStagesTable.userId, userId)))
    .limit(1);
  if (!stage) { res.status(404).json({ error: "Coluna não encontrada" }); return; }

  const existing = await db.select({ pos: sdrFunnelCardsTable.position })
    .from(sdrFunnelCardsTable)
    .where(and(eq(sdrFunnelCardsTable.stageId, stageId), eq(sdrFunnelCardsTable.userId, userId)))
    .orderBy(asc(sdrFunnelCardsTable.position));

  const position = existing.length > 0 ? (existing[existing.length - 1].pos + 1) : 0;

  const [card] = await db.insert(sdrFunnelCardsTable)
    .values({
      userId, stageId,
      jid: jid ?? null,
      contactName: contactName?.trim() ?? "",
      contactPhone: contactPhone?.trim() ?? "",
      title: title?.trim() ?? "",
      valueCents: valueCents ?? null,
      notes: notes?.trim() ?? "",
      position,
    })
    .returning();

  res.json({ card });
});

// ── PUT /sdr/funnel/cards/:id — update card ───────────────────────────────────
router.put("/sdr/funnel/cards/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params.id);
  const { stageId, contactName, contactPhone, title, valueCents, notes } =
    req.body as {
      stageId?: number;
      contactName?: string;
      contactPhone?: string;
      title?: string;
      valueCents?: number | null;
      notes?: string;
    };

  const setValues: Partial<typeof sdrFunnelCardsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (stageId !== undefined) setValues.stageId = stageId;
  if (contactName !== undefined) setValues.contactName = contactName.trim();
  if (contactPhone !== undefined) setValues.contactPhone = contactPhone.trim();
  if (title !== undefined) setValues.title = title.trim();
  if (valueCents !== undefined) setValues.valueCents = valueCents;
  if (notes !== undefined) setValues.notes = notes.trim();

  const [updated] = await db.update(sdrFunnelCardsTable)
    .set(setValues)
    .where(and(eq(sdrFunnelCardsTable.id, id), eq(sdrFunnelCardsTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Card não encontrado" }); return; }
  res.json({ card: updated });
});

// ── PATCH /sdr/funnel/cards/:id/move — move card to different stage ───────────
router.patch("/sdr/funnel/cards/:id/move", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params.id);
  const { stageId } = req.body as { stageId: number };

  if (!stageId) { res.status(400).json({ error: "stageId obrigatório" }); return; }

  // Get last position in target stage
  const existing = await db.select({ pos: sdrFunnelCardsTable.position })
    .from(sdrFunnelCardsTable)
    .where(and(eq(sdrFunnelCardsTable.stageId, stageId), eq(sdrFunnelCardsTable.userId, userId)))
    .orderBy(asc(sdrFunnelCardsTable.position));

  const position = existing.length > 0 ? (existing[existing.length - 1].pos + 1) : 0;

  const [updated] = await db.update(sdrFunnelCardsTable)
    .set({ stageId, position, updatedAt: new Date() })
    .where(and(eq(sdrFunnelCardsTable.id, id), eq(sdrFunnelCardsTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Card não encontrado" }); return; }
  res.json({ card: updated });
});

// ── DELETE /sdr/funnel/cards/:id — delete card ────────────────────────────────
router.delete("/sdr/funnel/cards/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params.id);

  await db.delete(sdrFunnelCardsTable)
    .where(and(eq(sdrFunnelCardsTable.id, id), eq(sdrFunnelCardsTable.userId, userId)));

  res.json({ ok: true });
});

export default router;
