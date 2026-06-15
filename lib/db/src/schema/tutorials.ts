import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const tutorialsModulesTable = pgTable("tutorials_modules", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tutorialsLessonsTable = pgTable("tutorials_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => tutorialsModulesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TutorialModule = typeof tutorialsModulesTable.$inferSelect;
export type TutorialLesson = typeof tutorialsLessonsTable.$inferSelect;
