import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db, teamRolesTable, teamMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

type PermLevel = "none" | "view" | "edit";
export interface RolePermissions {
  atendimento: PermLevel;
  contatos: PermLevel;
  tags: PermLevel;
  disparo: PermLevel;
  conexao: PermLevel;
  plano: PermLevel;
  agentes: PermLevel;
}

export const DEFAULT_PERMISSIONS: RolePermissions = {
  atendimento: "none",
  contatos: "none",
  tags: "none",
  disparo: "none",
  conexao: "none",
  plano: "none",
  agentes: "none",
};

export function parsePermissions(raw: string): RolePermissions {
  try {
    return { ...DEFAULT_PERMISSIONS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session?.teamMemberId) {
    res.status(403).json({ error: "Apenas o titular da conta pode gerenciar a equipe" });
    return;
  }
  next();
}

// ── Roles ─────────────────────────────────────────────────────────────────────

router.get("/team/roles", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const roles = await db
    .select()
    .from(teamRolesTable)
    .where(eq(teamRolesTable.ownerUserId, ownerId))
    .orderBy(teamRolesTable.createdAt);
  res.json({ roles });
});

router.post("/team/roles", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const { name, permissions } = req.body as { name: string; permissions: Record<string, string> };
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  const [role] = await db.insert(teamRolesTable).values({
    ownerUserId: ownerId,
    name: name.trim(),
    permissions: JSON.stringify({ ...DEFAULT_PERMISSIONS, ...(permissions ?? {}) }),
  }).returning();
  res.json({ role });
});

router.put("/team/roles/:id", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const roleId = parseInt(String(req.params.id), 10);
  const { name, permissions } = req.body as { name?: string; permissions?: Record<string, string> };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name?.trim()) updates.name = name.trim();
  if (permissions) updates.permissions = JSON.stringify({ ...DEFAULT_PERMISSIONS, ...permissions });
  const [updated] = await db
    .update(teamRolesTable)
    .set(updates)
    .where(and(eq(teamRolesTable.id, roleId), eq(teamRolesTable.ownerUserId, ownerId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Cargo não encontrado" }); return; }
  res.json({ role: updated });
});

router.delete("/team/roles/:id", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const roleId = parseInt(String(req.params.id), 10);
  await db
    .delete(teamRolesTable)
    .where(and(eq(teamRolesTable.id, roleId), eq(teamRolesTable.ownerUserId, ownerId)));
  res.json({ ok: true });
});

// ── Members ───────────────────────────────────────────────────────────────────

const memberSelect = {
  id: teamMembersTable.id,
  name: teamMembersTable.name,
  email: teamMembersTable.email,
  roleId: teamMembersTable.roleId,
  isActive: teamMembersTable.isActive,
  createdAt: teamMembersTable.createdAt,
} as const;

router.get("/team/members", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const members = await db
    .select(memberSelect)
    .from(teamMembersTable)
    .where(eq(teamMembersTable.ownerUserId, ownerId))
    .orderBy(teamMembersTable.createdAt);
  res.json({ members });
});

router.post("/team/members", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const { name, email, password, roleId } = req.body as {
    name: string; email: string; password: string; roleId?: number | null;
  };
  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" }); return;
  }
  const emailLower = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.email, emailLower))
    .limit(1);
  if (existing) { res.status(409).json({ error: "E-mail já está em uso" }); return; }
  const passwordHash = await bcrypt.hash(password, 10);
  const [member] = await db.insert(teamMembersTable).values({
    ownerUserId: ownerId,
    name: name.trim(),
    email: emailLower,
    passwordHash,
    roleId: roleId ?? null,
    isActive: true,
  }).returning(memberSelect);
  res.json({ member });
});

router.put("/team/members/:id", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const memberId = parseInt(String(req.params.id), 10);
  const { name, email, password, roleId, isActive } = req.body as {
    name?: string; email?: string; password?: string; roleId?: number | null; isActive?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (name?.trim()) updates.name = name.trim();
  if (email?.trim()) updates.email = email.toLowerCase().trim();
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if (roleId !== undefined) updates.roleId = roleId;
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" }); return; }
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar" }); return; }
  const [updated] = await db
    .update(teamMembersTable)
    .set(updates)
    .where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.ownerUserId, ownerId)))
    .returning(memberSelect);
  if (!updated) { res.status(404).json({ error: "Membro não encontrado" }); return; }
  res.json({ member: updated });
});

router.delete("/team/members/:id", requireAuth, requireOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const memberId = parseInt(String(req.params.id), 10);
  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.ownerUserId, ownerId)));
  res.json({ ok: true });
});

export default router;
