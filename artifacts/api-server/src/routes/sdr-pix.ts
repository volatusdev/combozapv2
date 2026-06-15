import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db, sdrPixChargesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

router.get("/sdr/pix/stats", async (req, res) => {
  const userId = req.user!.id;
  const charges = await db
    .select()
    .from(sdrPixChargesTable)
    .where(eq(sdrPixChargesTable.userId, userId));

  const total = charges.length;
  const paid = charges.filter(c => c.status === "COMPLETED").length;
  const pending = charges.filter(c => c.status === "PENDING").length;
  const expired = charges.filter(c => c.status === "EXPIRED").length;
  const totalValueCents = charges.reduce((s, c) => s + c.valueCents, 0);
  const paidValueCents = charges.filter(c => c.status === "COMPLETED").reduce((s, c) => s + c.valueCents, 0);
  const pendingValueCents = charges.filter(c => c.status === "PENDING").reduce((s, c) => s + c.valueCents, 0);

  res.json({
    total, paid, pending, expired,
    totalValueCents, paidValueCents, pendingValueCents,
    conversionRate: total > 0 ? paid / total : 0,
  });
});

router.get("/sdr/pix/charges", async (req, res) => {
  const userId = req.user!.id;
  const charges = await db
    .select()
    .from(sdrPixChargesTable)
    .where(eq(sdrPixChargesTable.userId, userId))
    .orderBy(desc(sdrPixChargesTable.createdAt))
    .limit(200);
  res.json({ charges });
});

export default router;
