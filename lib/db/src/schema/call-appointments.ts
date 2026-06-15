import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const callScheduleSettingsTable = pgTable("call_schedule_settings", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  settings: text("settings").notNull().default("{}"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const callAppointmentsTable = pgTable("call_appointments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  guestName: text("guest_name").notNull().default(""),
  guestPhone: text("guest_phone").notNull().default(""),
  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  roomSlug: text("room_slug").notNull().default(""),
  source: text("source").notNull().default("manual"),
  instance: text("instance").notNull().default(""),
  jid: text("jid").notNull().default(""),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CallScheduleSettings = typeof callScheduleSettingsTable.$inferSelect;
export type CallAppointment = typeof callAppointmentsTable.$inferSelect;
export type InsertCallAppointment = typeof callAppointmentsTable.$inferInsert;
