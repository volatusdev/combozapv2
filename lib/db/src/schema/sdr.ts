import { pgTable, serial, integer, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const sdrTagsTable = pgTable("sdr_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  desc: text("desc").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sdrContactTagsTable = pgTable("sdr_contact_tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  jid: text("jid").notNull(),
  tagId: integer("tag_id").notNull().references(() => sdrTagsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sdrUserPlansTable = pgTable("sdr_user_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  planType: text("plan_type").notNull(),
  maxSlots: integer("max_slots").notNull().default(1),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sdrOrdersTable = pgTable("sdr_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planType: text("plan_type").notNull(),
  maxSlots: integer("max_slots").notNull(),
  valueCents: integer("value_cents").notNull(),
  correlationId: text("correlation_id").notNull().unique(),
  status: text("status").notNull().default("PENDING"),
  pixBrCode: text("pix_br_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sdrSlotsTable = pgTable("sdr_slots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull(),
  name: text("name").notNull().default("WhatsApp"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sdrAgentsTable = pgTable("sdr_agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  prompt: text("prompt").notNull().default(""),
  specialties: text("specialties").notNull().default("[]"),
  paymentLinks: text("payment_links").notNull().default("[]"),
  wooviEnabled: boolean("woovi_enabled").notNull().default(false),
  pixGateway: text("pix_gateway").notNull().default(""),
  pixDescription: text("pix_description").notNull().default(""),
  pixMinCents: integer("pix_min_cents").notNull().default(0),
  pixMaxCents: integer("pix_max_cents").notNull().default(0),
  callEnabled: boolean("call_enabled").notNull().default(false),
  avatarColor: text("avatar_color").notNull().default("#22c55e"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sdrAgentSlotsTable = pgTable("sdr_agent_slots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => sdrAgentsTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Contacts collected automatically from inbound WhatsApp messages
export const sdrContactsTable = pgTable("sdr_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  instanceName: text("instance_name").notNull(),
  jid: text("jid").notNull(),
  name: text("name"),
  phone: text("phone").notNull(),
  avatarUrl: text("avatar_url"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("sdr_contacts_uniq").on(t.userId, t.instanceName, t.jid),
}));

// Maps instance name (hash) → userId + slotNumber for webhook reverse lookup
export const sdrInstanceMapTable = pgTable("sdr_instance_map", {
  instanceName: text("instance_name").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Team management ───────────────────────────────────────────────────────────

export const teamRolesTable = pgTable("team_roles", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  permissions: text("permissions").notNull().default("{}"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").references(() => teamRolesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Contact notes ─────────────────────────────────────────────────────────────

export const sdrContactNotesTable = pgTable("sdr_contact_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  jid: text("jid").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


// ── Funnel / Kanban ───────────────────────────────────────────────────────────

export const sdrFunnelStagesTable = pgTable("sdr_funnel_stages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sdrFunnelCardsTable = pgTable("sdr_funnel_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  stageId: integer("stage_id").notNull().references(() => sdrFunnelStagesTable.id, { onDelete: "cascade" }),
  jid: text("jid"),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  title: text("title").notNull().default(""),
  valueCents: integer("value_cents"),
  notes: text("notes").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});


// ── Status de Conversa ────────────────────────────────────────────────────────

export const conversationStatusesTable = pgTable("conversation_statuses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(1),
  jid: text("jid").notNull(),
  status: text("status").notNull().default("aberto"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("conv_status_unique").on(t.userId, t.slotNumber, t.jid)]);

// ── Histórico persistente de mensagens ───────────────────────────────────────

export const sdrMessagesTable = pgTable("sdr_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(1),
  jid: text("jid").notNull(),
  messageId: text("message_id").notNull(),
  fromMe: boolean("from_me").notNull().default(false),
  text: text("text").notNull().default(""),
  timestamp: integer("timestamp").notNull().default(0),
  mediaType: text("media_type"),
  mediaData: text("media_data"),
  mediaMime: text("media_mime"),
  mediaName: text("media_name"),
  mediaUrl: text("media_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sdr_messages_uniq").on(t.userId, t.slotNumber, t.messageId)]);

// ── Lista de chats persistente ────────────────────────────────────────────────

export const sdrChatsTable = pgTable("sdr_chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(1),
  jid: text("jid").notNull(),
  name: text("name"),
  phone: text("phone").notNull().default(""),
  unread: integer("unread").notNull().default(0),
  lastMessage: text("last_message").notNull().default(""),
  lastTimestamp: integer("last_timestamp").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sdr_chats_uniq").on(t.userId, t.slotNumber, t.jid)]);

// ── Atribuição de conversas a membros da equipe ───────────────────────────────

export const sdrChatAssignmentsTable = pgTable("sdr_chat_assignments", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(1),
  jid: text("jid").notNull(),
  assignedToId: integer("assigned_to_id").references(() => teamMembersTable.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sdr_chat_assign_uniq").on(t.ownerUserId, t.slotNumber, t.jid)]);

// ── Agente de Follow-up ───────────────────────────────────────────────────────

export const sdrFollowupSettingsTable = pgTable("sdr_followup_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(0),
  enabled: boolean("enabled").notNull().default(false),
  stagesJson: text("stages_json").notNull().default('[{"minutes":30},{"minutes":60},{"minutes":240},{"minutes":720},{"minutes":1440},{"minutes":2880}]'),
  aiPrompt: text("ai_prompt").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sdr_followup_settings_uniq").on(t.userId, t.slotNumber)]);

export const sdrFollowupQueueTable = pgTable("sdr_followup_queue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  instanceName: text("instance_name").notNull(),
  slotNumber: integer("slot_number").notNull(),
  jid: text("jid").notNull(),
  stage: integer("stage").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  sentAt: timestamp("sent_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sdrPixChargesTable = pgTable("sdr_pix_charges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id"),
  instance: text("instance").notNull().default(""),
  jid: text("jid").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  correlationId: text("correlation_id").notNull().unique(),
  valueCents: integer("value_cents").notNull().default(0),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("PENDING"),
  brCode: text("br_code").notNull().default(""),
  qrCodeImage: text("qr_code_image").notNull().default(""),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── IA pausada por conversa ───────────────────────────────────────────────────

export const sdrAiPausedTable = pgTable("sdr_ai_paused", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  slotNumber: integer("slot_number").notNull().default(1),
  jid: text("jid").notNull(),
  pausedAt: timestamp("paused_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sdr_ai_paused_uniq").on(t.userId, t.slotNumber, t.jid)]);

export type TeamRole = typeof teamRolesTable.$inferSelect;
export type TeamMember = Omit<typeof teamMembersTable.$inferSelect, "passwordHash">;
