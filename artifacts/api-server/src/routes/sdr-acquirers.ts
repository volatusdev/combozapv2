import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db, userAcquirersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

const VALID_GATEWAYS = ["woovi", "mercadopago", "asaas", "pagarme"] as const;
type Gateway = (typeof VALID_GATEWAYS)[number];

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 6) return "••••••";
  return "••••••••••••" + key.slice(-4);
}

router.get("/sdr/acquirers", async (req, res) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(userAcquirersTable)
    .where(eq(userAcquirersTable.userId, userId));

  const result = VALID_GATEWAYS.map(gateway => {
    const row = rows.find(r => r.gateway === gateway);
    return {
      gateway,
      enabled: row?.enabled ?? false,
      hasKey: !!(row?.apiKey),
      maskedKey: row ? maskKey(row.apiKey) : "",
    };
  });

  res.json({ acquirers: result });
});

router.put("/sdr/acquirers/:gateway", async (req, res) => {
  const userId = req.user!.id;
  const gateway = req.params.gateway as Gateway;

  if (!VALID_GATEWAYS.includes(gateway)) {
    res.status(400).json({ error: "Gateway inválido" });
    return;
  }

  const { apiKey, enabled } = req.body as { apiKey?: string; enabled?: boolean };

  const existing = await db
    .select()
    .from(userAcquirersTable)
    .where(and(eq(userAcquirersTable.userId, userId), eq(userAcquirersTable.gateway, gateway)))
    .limit(1);

  if (existing.length > 0) {
    const updateData: Partial<typeof userAcquirersTable.$inferInsert> = {
      enabled: enabled ?? existing[0].enabled,
      updatedAt: new Date(),
    };
    if (apiKey !== undefined && apiKey !== "") {
      updateData.apiKey = apiKey.trim();
    }
    await db
      .update(userAcquirersTable)
      .set(updateData)
      .where(and(eq(userAcquirersTable.userId, userId), eq(userAcquirersTable.gateway, gateway)));
  } else {
    await db.insert(userAcquirersTable).values({
      userId,
      gateway,
      apiKey: (apiKey ?? "").trim(),
      enabled: enabled ?? false,
    });
  }

  res.json({ ok: true });
});

export default router;
