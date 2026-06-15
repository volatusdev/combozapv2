import { Router } from "express";
import { db, sdrChatAssignmentsTable, teamMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/sdr/assignments/members", async (req, res) => {
  const userId = req.session.userId!;
  const members = await db
    .select({ id: teamMembersTable.id, name: teamMembersTable.name })
    .from(teamMembersTable)
    .where(and(
      eq(teamMembersTable.ownerUserId, userId),
      eq(teamMembersTable.isActive, true),
    ));
  res.json({ members });
});

router.get("/sdr/assignments", async (req, res) => {
  const userId = req.session.userId!;
  const slot = Number(req.query.slot ?? 1);
  const rows = await db
    .select({
      jid: sdrChatAssignmentsTable.jid,
      assignedToId: sdrChatAssignmentsTable.assignedToId,
      memberName: teamMembersTable.name,
    })
    .from(sdrChatAssignmentsTable)
    .leftJoin(
      teamMembersTable,
      eq(sdrChatAssignmentsTable.assignedToId, teamMembersTable.id),
    )
    .where(and(
      eq(sdrChatAssignmentsTable.ownerUserId, userId),
      eq(sdrChatAssignmentsTable.slotNumber, slot),
    ));

  const assignments: Record<string, { memberId: number; memberName: string }> = {};
  for (const r of rows) {
    if (r.assignedToId) {
      assignments[r.jid] = { memberId: r.assignedToId, memberName: r.memberName ?? "" };
    }
  }
  res.json({ assignments });
});

router.put("/sdr/assignments", async (req, res) => {
  const userId = req.session.userId!;
  const { jid, slot = 1, memberId } = req.body as {
    jid: string;
    slot?: number;
    memberId: number | null;
  };
  if (!jid) {
    res.status(400).json({ error: "jid obrigatório" });
    return;
  }

  if (memberId === null) {
    await db
      .delete(sdrChatAssignmentsTable)
      .where(and(
        eq(sdrChatAssignmentsTable.ownerUserId, userId),
        eq(sdrChatAssignmentsTable.slotNumber, Number(slot)),
        eq(sdrChatAssignmentsTable.jid, jid),
      ));
  } else {
    await db
      .insert(sdrChatAssignmentsTable)
      .values({
        ownerUserId: userId,
        slotNumber: Number(slot),
        jid,
        assignedToId: memberId,
        assignedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          sdrChatAssignmentsTable.ownerUserId,
          sdrChatAssignmentsTable.slotNumber,
          sdrChatAssignmentsTable.jid,
        ],
        set: { assignedToId: memberId, assignedAt: new Date() },
      });
  }
  res.json({ ok: true });
});

export default router;
