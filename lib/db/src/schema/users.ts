import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  whatsapp: text("whatsapp"),
  apiToken: text("api_token").notNull().unique(),
  role: text("role").notNull().default("viewer"),
  isActive: boolean("is_active").notNull().default(true),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  plan: text("plan").notNull().default("sem_plano"),
  aiTokens: integer("ai_tokens").notNull().default(0),
  neonAuthId: text("neon_auth_id").unique(),
  firebaseUid: text("firebase_uid").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
