import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable, teamMembersTable, teamRolesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { parsePermissions, DEFAULT_PERMISSIONS } from "./team.js";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";
import { logger } from "../lib/logger.js";
import { initUserFolderBunny } from "../lib/bunny.js";
import { consumeImpersonationToken } from "./admin.js";

const router = Router();

router.post("/auth/register", async (req, res) => {
  const { name, email, whatsapp, password, confirmPassword, acceptTerms } = req.body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !whatsapp?.trim() || !password) {
    res.status(400).json({ error: "Todos os campos são obrigatórios" }); return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Senhas não coincidem" }); return;
  }
  if (!acceptTerms || acceptTerms === "false") {
    res.status(400).json({ error: "Aceite os termos de uso" }); return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Senha deve ter ao menos 8 caracteres" }); return;
  }

  const emailLower = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, emailLower))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "E-mail já está em uso" }); return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const apiToken = randomBytes(32).toString("hex");

  const [user] = await db.insert(usersTable).values({
    name: name.trim(),
    email: emailLower,
    whatsapp: whatsapp.trim(),
    passwordHash,
    apiToken,
    role: "admin",
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    plan: usersTable.plan,
  });

  req.session.userId = user.id;
  initUserFolderBunny(emailLower).catch(() => {});
  res.json({ user: { ...user, plan: user.plan ?? "sem_plano" } });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as Record<string, string>;

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "E-mail e senha obrigatórios" }); return;
  }

  const emailLower = email.toLowerCase().trim();

  // ── Check owner accounts first ────────────────────────────────────────────
  const [user] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    plan: usersTable.plan,
    passwordHash: usersTable.passwordHash,
  }).from(usersTable).where(eq(usersTable.email, emailLower)).limit(1);

  if (user && user.passwordHash) {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "E-mail ou senha incorretos" }); return; }
    req.session.userId = user.id;
    req.session.teamMemberId = undefined;
    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ user: { ...safeUser, plan: safeUser.plan ?? "sem_plano" } });
    return;
  }

  // ── Check team members ────────────────────────────────────────────────────
  const [member] = await db.select({
    id: teamMembersTable.id,
    name: teamMembersTable.name,
    email: teamMembersTable.email,
    passwordHash: teamMembersTable.passwordHash,
    isActive: teamMembersTable.isActive,
    roleId: teamMembersTable.roleId,
    ownerUserId: teamMembersTable.ownerUserId,
  }).from(teamMembersTable).where(eq(teamMembersTable.email, emailLower)).limit(1);

  if (member && member.passwordHash) {
    const valid = await bcrypt.compare(password, member.passwordHash);
    if (!valid) { res.status(401).json({ error: "E-mail ou senha incorretos" }); return; }
    if (!member.isActive) { res.status(403).json({ error: "Conta desativada. Contate o administrador." }); return; }

    const [owner] = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      plan: usersTable.plan,
    }).from(usersTable).where(eq(usersTable.id, member.ownerUserId)).limit(1);

    if (!owner) { res.status(500).json({ error: "Conta principal não encontrada" }); return; }

    let permissions = { ...DEFAULT_PERMISSIONS };
    if (member.roleId) {
      const [role] = await db.select({ permissions: teamRolesTable.permissions })
        .from(teamRolesTable).where(eq(teamRolesTable.id, member.roleId)).limit(1);
      if (role) permissions = parsePermissions(role.permissions);
    }

    req.session.userId = member.ownerUserId;
    req.session.teamMemberId = member.id;

    res.json({
      user: {
        ...owner,
        plan: owner.plan ?? "sem_plano",
        teamMemberId: member.id,
        teamMemberName: member.name,
        teamMemberEmail: member.email,
        permissions,
      },
    });
    return;
  }

  res.status(401).json({ error: "E-mail ou senha incorretos" });
});

// ── Firebase Auth sync ────────────────────────────────────────────────────────
// Verifies a Firebase ID token, then finds-or-creates the user in our DB
// and opens a session. Called by the frontend after any Firebase sign-in.

router.post("/auth/firebase-sync", async (req, res) => {
  const { idToken, name: rawName, whatsapp: rawWhatsapp } = req.body as {
    idToken?: string; name?: string; whatsapp?: string;
  };

  if (!idToken) { res.status(400).json({ error: "idToken obrigatório" }); return; }

  let decoded: Awaited<ReturnType<typeof verifyFirebaseToken>>;
  try {
    decoded = await verifyFirebaseToken(idToken);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Use safe string logging to avoid pino serialization failure with Firebase error objects
    try { logger.error({ errMsg: msg }, "firebase-sync: verifyIdToken failed"); } catch { /* ignore */ }
    if (msg.includes("não configurado")) {
      res.status(500).json({ error: "Servidor não configurado para Firebase (contacte o suporte)" }); return;
    }
    res.status(401).json({ error: "Token Firebase inválido ou expirado" }); return;
  }

  const { uid, email, name: fbName } = decoded;
  if (!email) { res.status(400).json({ error: "Firebase account sem e-mail" }); return; }

  const displayName = rawName?.trim() || fbName || email.split("@")[0];

  try {
    // Find existing user by firebaseUid OR email
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.firebaseUid, uid), eq(usersTable.email, email.toLowerCase())))
      .limit(1);

    if (existing) {
      // Sync firebaseUid if missing (e.g., existing bcrypt user logging in via Firebase for the first time)
      if (!existing.firebaseUid) {
        await db.update(usersTable).set({ firebaseUid: uid }).where(eq(usersTable.id, existing.id));
      }
      req.session.userId = existing.id;
      req.session.teamMemberId = undefined;
      res.json({
        user: {
          id: existing.id, email: existing.email, name: existing.name,
          role: existing.role, plan: existing.plan ?? "sem_plano",
          isAdmin: existing.isAdmin ?? false,
        },
      });
      return;
    }

    // New user — create in DB
    const apiToken = randomBytes(32).toString("hex");
    const [created] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      name: displayName,
      whatsapp: rawWhatsapp?.trim() ?? "",
      passwordHash: null,
      apiToken,
      firebaseUid: uid,
      role: "admin",
    }).returning({
      id: usersTable.id, email: usersTable.email,
      name: usersTable.name, role: usersTable.role, plan: usersTable.plan,
      isAdmin: usersTable.isAdmin,
    });

    req.session.userId = created.id;
    req.session.teamMemberId = undefined;
    initUserFolderBunny(email.toLowerCase()).catch(() => {});
    res.json({ user: { ...created, plan: created.plan ?? "sem_plano", isAdmin: created.isAdmin ?? false } });
  } catch (dbErr: unknown) {
    logger.error({ err: dbErr }, "firebase-sync: DB error");
    res.status(503).json({ error: "Erro interno ao acessar banco de dados. Tente novamente." });
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json(req.user);
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Admin impersonation — public endpoint (no auth required) ─────────────────
// Token is single-use, 15-minute TTL, generated only by admin endpoint.
router.get("/auth/impersonate/:token", async (req, res) => {
  const token = String(req.params.token ?? "");
  const userId = consumeImpersonationToken(token);

  if (!userId) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#dc2626">Link expirado ou inválido</h2>
        <p>Este link de acesso já foi utilizado ou expirou (validade 15 minutos).</p>
        <a href="/" style="color:#2563eb">Voltar ao início</a>
      </body></html>
    `);
    return;
  }

  const [user] = await db.select({
    id: usersTable.id, email: usersTable.email,
    name: usersTable.name, role: usersTable.role,
    plan: usersTable.plan, isAdmin: usersTable.isAdmin,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) {
    res.status(404).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#dc2626">Usuário não encontrado</h2>
        <a href="/" style="color:#2563eb">Voltar ao início</a>
      </body></html>
    `);
    return;
  }

  req.session.userId = user.id;
  req.session.teamMemberId = undefined;

  res.redirect("/sdr/atendimento");
});

export default router;
