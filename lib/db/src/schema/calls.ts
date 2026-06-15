import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const callRoomsTable = pgTable("call_rooms", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull().default("Reunião"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CallRoom = typeof callRoomsTable.$inferSelect;
export type InsertCallRoom = typeof callRoomsTable.$inferInsert;
