import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db, callRoomsTable, callScheduleSettingsTable, callAppointmentsTable } from "@workspace/db";
import { eq, and, gte, lt } from "drizzle-orm";

const router = Router();
const WOOVI_BASE = "https://api.woovi.com/api/v1";

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Rooms ────────────────────────────────────────────────────────────────────

router.post("/calls/rooms", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { title } = req.body as { title?: string };
  const slug = randomSlug();
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);

  const [room] = await db.insert(callRoomsTable).values({
    slug,
    title: title?.trim() || "Nova Reunião",
    createdBy: userId,
    expiresAt,
  }).returning();

  res.json({ room });
});

router.get("/calls/rooms", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const rooms = await db
    .select()
    .from(callRoomsTable)
    .where(eq(callRoomsTable.createdBy, userId))
    .orderBy(callRoomsTable.createdAt);

  res.json({ rooms });
});

router.get("/calls/rooms/:slug", async (req, res) => {
  const { slug } = req.params;
  const [room] = await db
    .select({
      slug: callRoomsTable.slug,
      title: callRoomsTable.title,
      expiresAt: callRoomsTable.expiresAt,
    })
    .from(callRoomsTable)
    .where(eq(callRoomsTable.slug, slug))
    .limit(1);

  if (!room) { res.status(404).json({ error: "Sala não encontrada" }); return; }
  res.json({ room });
});

router.delete("/calls/rooms/:slug", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { slug } = req.params;
  await db.delete(callRoomsTable)
    .where(and(eq(callRoomsTable.slug, slug), eq(callRoomsTable.createdBy, userId)));
  res.json({ ok: true });
});

router.post("/calls/rooms/:slug/pix", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { slug } = req.params;
  const { valueCents, description } = req.body as { valueCents?: number; description?: string };

  const [room] = await db.select()
    .from(callRoomsTable)
    .where(and(eq(callRoomsTable.slug, slug), eq(callRoomsTable.createdBy, userId)))
    .limit(1);

  if (!room) { res.status(403).json({ error: "Sala não encontrada" }); return; }
  if (!valueCents || valueCents < 100) { res.status(400).json({ error: "Valor mínimo R$ 1,00" }); return; }

  const appId = process.env.WOOVI_APP_ID;
  if (!appId) { res.status(503).json({ error: "PIX não configurado" }); return; }

  const correlationId = `call-${slug}-${Date.now()}`;

  try {
    const wooviRes = await fetch(`${WOOVI_BASE}/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: appId },
      body: JSON.stringify({
        correlationID: correlationId,
        value: valueCents,
        comment: description?.trim() || "Pagamento via ComboZap Call",
        expiresIn: 3600,
      }),
    });

    const body = await wooviRes.json() as Record<string, unknown>;
    if (!wooviRes.ok) {
      res.status(502).json({ error: (body?.error ?? "Erro ao gerar PIX") as string });
      return;
    }

    const charge = (body.charge ?? body) as Record<string, unknown>;

    res.json({
      correlationId,
      qrCodeImage: charge.qrCodeImage ?? null,
      brCode: charge.brCode ?? null,
      valueCents,
      description: description?.trim() || "Pagamento",
    });
  } catch (err) {
    req.log.error(err, "Call PIX generation failed");
    res.status(500).json({ error: "Erro interno ao gerar PIX" });
  }
});

// ── Availability ─────────────────────────────────────────────────────────────

const DEFAULT_AVAILABILITY = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, slotMinutes: 60 };

router.get("/calls/availability", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [row] = await db.select().from(callScheduleSettingsTable)
    .where(eq(callScheduleSettingsTable.userId, userId)).limit(1);
  const settings = row ? JSON.parse(row.settings) : DEFAULT_AVAILABILITY;
  res.json({ settings });
});

router.put("/calls/availability", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { settings } = req.body as { settings: unknown };
  const str = JSON.stringify(settings);
  await db.insert(callScheduleSettingsTable)
    .values({ userId, settings: str })
    .onConflictDoUpdate({
      target: callScheduleSettingsTable.userId,
      set: { settings: str, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// ── Appointments ─────────────────────────────────────────────────────────────

router.get("/calls/appointments", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { year, month } = req.query as { year?: string; month?: string };

  let where;
  if (year && month) {
    const y = parseInt(year);
    const m = parseInt(month) - 1;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    where = and(
      eq(callAppointmentsTable.userId, userId),
      gte(callAppointmentsTable.scheduledAt, start),
      lt(callAppointmentsTable.scheduledAt, end),
    );
  } else {
    where = eq(callAppointmentsTable.userId, userId);
  }

  const appointments = await db.select().from(callAppointmentsTable)
    .where(where)
    .orderBy(callAppointmentsTable.scheduledAt);

  res.json({ appointments });
});

router.post("/calls/appointments", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { guestName, guestPhone, scheduledAt, durationMinutes, notes } = req.body as {
    guestName?: string; guestPhone?: string; scheduledAt?: string;
    durationMinutes?: number; notes?: string;
  };

  if (!guestName?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  if (!scheduledAt) { res.status(400).json({ error: "Horário é obrigatório" }); return; }

  const [appt] = await db.insert(callAppointmentsTable).values({
    userId,
    guestName: guestName.trim(),
    guestPhone: guestPhone?.trim() ?? "",
    scheduledAt: new Date(scheduledAt),
    durationMinutes: durationMinutes ?? 60,
    notes: notes?.trim() ?? "",
  }).returning();

  res.json({ appointment: appt });
});

router.patch("/calls/appointments/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  const { status } = req.body as { status: string };
  await db.update(callAppointmentsTable)
    .set({ status })
    .where(and(eq(callAppointmentsTable.id, id), eq(callAppointmentsTable.userId, userId)));
  res.json({ ok: true });
});

router.delete("/calls/appointments/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params.id);
  await db.delete(callAppointmentsTable)
    .where(and(eq(callAppointmentsTable.id, id), eq(callAppointmentsTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
