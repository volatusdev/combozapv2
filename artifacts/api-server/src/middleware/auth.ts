import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, teamMembersTable, teamRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parsePermissions, type RolePermissions } from "../routes/team.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    teamMemberId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        role: string;
        plan: string;
        isAdmin: boolean;
        teamMemberId?: number;
        teamMemberName?: string;
        teamMemberEmail?: string;
        permissions?: RolePermissions;
      };
    }
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (req.user?.isAdmin) { next(); return; }
    res.status(403).json({ error: "Forbidden" });
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.session?.userId) {
    const [u] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        plan: usersTable.plan,
        isAdmin: usersTable.isAdmin,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);
    if (u) {
      req.user = { ...u, plan: u.plan ?? "sem_plano", isAdmin: u.isAdmin ?? false };

      if (req.session.teamMemberId) {
        const [member] = await db
          .select({
            id: teamMembersTable.id,
            name: teamMembersTable.name,
            email: teamMembersTable.email,
            roleId: teamMembersTable.roleId,
            isActive: teamMembersTable.isActive,
          })
          .from(teamMembersTable)
          .where(eq(teamMembersTable.id, req.session.teamMemberId))
          .limit(1);

        if (member && member.isActive) {
          let permissions: RolePermissions | undefined;
          if (member.roleId) {
            const [role] = await db
              .select({ permissions: teamRolesTable.permissions })
              .from(teamRolesTable)
              .where(eq(teamRolesTable.id, member.roleId))
              .limit(1);
            if (role) permissions = parsePermissions(role.permissions);
          }
          req.user.teamMemberId = member.id;
          req.user.teamMemberName = member.name;
          req.user.teamMemberEmail = member.email;
          req.user.permissions = permissions;
        } else {
          // Member deactivated — clear team session
          req.session.teamMemberId = undefined;
        }
      }

      next();
      return;
    }
  }

  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : null;

  if (bearer) {
    const [byToken] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        plan: usersTable.plan,
      })
      .from(usersTable)
      .where(eq(usersTable.apiToken, bearer))
      .limit(1);
    if (byToken) {
      req.user = { ...byToken, plan: byToken.plan ?? "sem_plano", isAdmin: false };
      req.session.userId = byToken.id;
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}
