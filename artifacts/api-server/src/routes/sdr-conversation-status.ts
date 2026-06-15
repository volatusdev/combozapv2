import { Router } from "express";
import { db } from "@workspace/db";
import { conversationStatusesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const VALID = new Set(["aberto", "pendente", "resolvido"]);

const router = Router();
router.use(requireAuth);

router.get("/sdr/conversation-status", async (req, res) => {
  const userId = req.session.userId!;
  const slot = Number(req.query.slot ?? 1);
  const rows = await db
    .select()
    .from(conversationStatusesTable)
    .where(
      and(
        eq(conversationStatusesTable.userId, userId),
        eq(conversationStatusesTable.slotNumber, slot),
      ),
    );
  const statuses: Record<string, string> = {};
  for (const r of rows) statuses[r.jid] = r.status;
  res.json({ statuses });
});

router.put("/sdr/conversation-status", async (req, res) => {
  const userId = req.session.userId!;
  const { jid, slot = 1, status } = req.body as { jid: string; slot?: number; status: string };
  if (!jid || !VALID.has(status)) {
    res.status(400).json({ error: "jid e status válido são obrigatórios" });
    return;
  }
  await db
    .insert(conversationStatusesTable)
    .values({ userId, slotNumber: Number(slot), jid, status, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        conversationStatusesTable.userId,
        conversationStatusesTable.slotNumber,
        conversationStatusesTable.jid,
      ],
      set: { status, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

export default router;
