import { db, callAppointmentsTable } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { logger } from "./logger.js";

const EVO_URL = process.env.EVO_URL ?? "";
const EVO_KEY = process.env.EVO_KEY ?? "";

async function sendReminders(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 50 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 70 * 60 * 1000);

  const due = await db
    .select()
    .from(callAppointmentsTable)
    .where(and(
      gte(callAppointmentsTable.scheduledAt, windowStart),
      lte(callAppointmentsTable.scheduledAt, windowEnd),
      eq(callAppointmentsTable.reminderSent, false),
      eq(callAppointmentsTable.source, "agent"),
    ));

  for (const appt of due) {
    if (!appt.instance || !appt.jid) continue;
    try {
      const dateFmt = appt.scheduledAt.toLocaleString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long",
        hour: "2-digit", minute: "2-digit",
      });
      const callLink = appt.roomSlug ? `https://app.combozap.com/call/${appt.roomSlug}` : null;
      const msgText = callLink
        ? `🔔 *Lembrete de Call!*\n\nSua chamada de vídeo começa em aproximadamente 1 hora.\n\n*Horário:* ${dateFmt}\n\n🔗 *Link para entrar:*\n${callLink}\n\n_Clique no link acima no horário combinado._`
        : `🔔 *Lembrete de Call!*\n\nSua chamada de vídeo começa em aproximadamente 1 hora.\n\n*Horário:* ${dateFmt}`;

      await fetch(`${EVO_URL}/message/sendText/${appt.instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ number: appt.jid, textMessage: { text: msgText } }),
        signal: AbortSignal.timeout(10_000),
      });

      await db.update(callAppointmentsTable)
        .set({ reminderSent: true })
        .where(eq(callAppointmentsTable.id, appt.id));

      logger.info({ apptId: appt.id, instance: appt.instance }, "Call reminder sent");
    } catch (err) {
      logger.error({ apptId: appt.id, err }, "Failed to send call reminder");
    }
  }
}

export function startCallReminders(): void {
  setInterval(() => { sendReminders().catch(() => undefined); }, 5 * 60 * 1000);
  sendReminders().catch(() => undefined);
}
