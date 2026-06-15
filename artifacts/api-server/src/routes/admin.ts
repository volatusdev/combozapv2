import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

// ── Impersonation token store ────────────────────────────────────────────────
interface ImpersonationToken { userId: number; expiresAt: number; }
const impersonationTokens = new Map<string, ImpersonationToken>();

/** Generate a single-use impersonation token (15 min TTL) */
export function createImpersonationToken(userId: number): string {
  const token = randomBytes(32).toString("hex");
  impersonationTokens.set(token, { userId, expiresAt: Date.now() + 15 * 60 * 1000 });
  // Cleanup expired tokens
  for (const [k, v] of impersonationTokens) {
    if (v.expiresAt < Date.now()) impersonationTokens.delete(k);
  }
  return token;
}

/** Consume a token (single-use). Returns userId or null if invalid/expired. */
export function consumeImpersonationToken(token: string): number | null {
  const entry = impersonationTokens.get(token);
  if (!entry) return null;
  impersonationTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

const EVO_URL = process.env.EVO_URL ?? "";
const EVO_KEY = process.env.EVO_KEY ?? "";

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "Acesso restrito ao administrador" });
    return;
  }
  next();
}

router.use(requireAuth, requireAdmin);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exec = (q: ReturnType<typeof sql>) => (db as any).execute(q) as Promise<{ rows: Record<string, unknown>[] }>;

async function fetchEvoInstances(): Promise<{ instanceName: string; connected: boolean; phone: string | null }[]> {
  try {
    const r = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_KEY },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const arr = (await r.json()) as Record<string, unknown>[];
    return arr.map(item => {
      const inst = (item.instance ?? item) as Record<string, unknown>;
      const owner = (inst.owner ?? inst.ownerJid ?? "") as string;
      const state = (inst.connectionStatus ?? inst.state ?? "") as string;
      const connected = !!owner || state === "open" || state === "CONNECTED";
      return {
        instanceName: String(inst.instanceName ?? ""),
        connected,
        phone: owner ? owner.replace(/@.*/, "") : null,
      };
    });
  } catch {
    return [];
  }
}

router.get("/admin/stats", async (_req, res) => {
  const [{ rows }, evoInstances] = await Promise.all([
    exec(sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_admin = false)                                                     AS total_users,
        (SELECT COUNT(*)::int FROM sdr_user_plans)                                                                   AS total_subscribers,
        (SELECT COUNT(*)::int FROM users u LEFT JOIN sdr_user_plans p ON p.user_id = u.id WHERE p.user_id IS NULL AND u.is_admin = false) AS no_plan_users,
        (SELECT COUNT(*)::int FROM sdr_instance_map)                                                                 AS total_instances_db,
        (SELECT COUNT(*)::int FROM sdr_orders WHERE status = 'COMPLETED')                                            AS paid_orders,
        (SELECT COALESCE(SUM(value_cents),0)::int FROM sdr_orders WHERE status='COMPLETED')                          AS paid_total,
        (SELECT COUNT(*)::int FROM sdr_orders WHERE status = 'PENDING')                                              AS pending_orders,
        (SELECT COALESCE(SUM(value_cents),0)::int FROM sdr_orders WHERE status='PENDING')                           AS pending_total
    `),
    fetchEvoInstances(),
  ]);

  const r = rows[0] ?? {};
  const connectedInstances = evoInstances.filter(i => i.connected).length;

  res.json({
    totalUsers:          Number(r.total_users          ?? 0),
    totalSubscribers:    Number(r.total_subscribers    ?? 0),
    noPlanUsers:         Number(r.no_plan_users        ?? 0),
    totalInstancesDb:    Number(r.total_instances_db   ?? 0),
    totalInstancesEvo:   evoInstances.length,
    connectedInstances,
    paidOrders:          Number(r.paid_orders          ?? 0),
    paidTotal:           Number(r.paid_total           ?? 0),
    pendingOrders:       Number(r.pending_orders       ?? 0),
    pendingTotal:        Number(r.pending_total        ?? 0),
  });
});

router.get("/admin/instances", async (_req, res) => {
  const [{ rows }, evoInstances] = await Promise.all([
    exec(sql`
      SELECT
        m.instance_name, m.slot_number, m.created_at,
        u.id AS user_id, u.email, u.name
      FROM sdr_instance_map m
      INNER JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC
    `),
    fetchEvoInstances(),
  ]);

  const evoMap = new Map(evoInstances.map(i => [i.instanceName, i]));

  const instances = rows.map(r => {
    const evo = evoMap.get(String(r.instance_name));
    return {
      instanceName: r.instance_name,
      slotNumber:   r.slot_number,
      userId:       r.user_id,
      email:        r.email,
      name:         r.name,
      createdAt:    r.created_at,
      connected:    evo?.connected ?? false,
      phone:        evo?.phone ?? null,
    };
  });

  res.json({ instances });
});

router.get("/admin/users", async (_req, res) => {
  const { rows } = await exec(sql`
    SELECT u.id, u.email, u.name, u.whatsapp, u.plan, u.is_admin, u.created_at
    FROM users u
    LEFT JOIN sdr_user_plans p ON p.user_id = u.id
    WHERE p.user_id IS NULL AND u.is_admin = false
    ORDER BY u.created_at DESC
  `);

  res.json({
    users: rows.map(r => ({
      id: r.id, email: r.email, name: r.name,
      whatsapp: r.whatsapp, plan: r.plan,
      isAdmin: r.is_admin, createdAt: r.created_at,
    })),
  });
});

router.get("/admin/subscribers", async (_req, res) => {
  const [{ rows }, evoInstances] = await Promise.all([
    exec(sql`
      SELECT
        u.id, u.email, u.name, u.whatsapp, u.created_at,
        p.plan_type, p.max_slots, p.purchased_at,
        (SELECT COUNT(*)::int FROM sdr_instance_map m WHERE m.user_id = u.id) AS slots_registered
      FROM sdr_user_plans p
      INNER JOIN users u ON u.id = p.user_id
      ORDER BY p.purchased_at DESC
    `),
    fetchEvoInstances(),
  ]);

  const connectedByUser = new Map<number, number>();
  const { rows: mapRows } = await exec(sql`SELECT instance_name, user_id FROM sdr_instance_map`);
  for (const mr of mapRows) {
    const evo = evoInstances.find(i => i.instanceName === String(mr.instance_name));
    if (evo?.connected) {
      const uid = Number(mr.user_id);
      connectedByUser.set(uid, (connectedByUser.get(uid) ?? 0) + 1);
    }
  }

  res.json({
    subscribers: rows.map(r => ({
      id: r.id, email: r.email, name: r.name,
      whatsapp: r.whatsapp, createdAt: r.created_at,
      planType: r.plan_type, maxSlots: r.max_slots, purchasedAt: r.purchased_at,
      slotsRegistered: Number(r.slots_registered ?? 0),
      slotsConnected:  connectedByUser.get(Number(r.id)) ?? 0,
    })),
  });
});

router.post("/admin/impersonate/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId || isNaN(userId)) { res.status(400).json({ error: "userId inválido" }); return; }

  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  const token = createImpersonationToken(userId);
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim()
    || `app.combozap.com`;
  const url = `https://${domain}/api/auth/impersonate/${token}`;

  res.json({ url, expiresIn: 900, user: { id: user.id, email: user.email, name: user.name } });
});

router.get("/admin/orders", async (_req, res) => {
  const { rows } = await exec(sql`
    SELECT
      o.id, o.user_id, u.email, u.name,
      o.plan_type, o.value_cents, o.status, o.created_at
    FROM sdr_orders o
    INNER JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `);

  res.json({
    orders: rows.map(r => ({
      id: r.id, userId: r.user_id,
      email: r.email, name: r.name,
      planType: r.plan_type, valueCents: r.value_cents,
      status: r.status, createdAt: r.created_at,
    })),
  });
});

export default router;
