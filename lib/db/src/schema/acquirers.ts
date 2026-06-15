import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const userAcquirersTable = pgTable("user_acquirers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  gateway: text("gateway").notNull(),
  apiKey: text("api_key").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserAcquirer = typeof userAcquirersTable.$inferSelect;
export type InsertUserAcquirer = typeof userAcquirersTable.$inferInsert;
