import { db } from "@workspace/db";
import { logger } from "./logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPool = () => (db as any).$client as import("pg").Pool;

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "create_sdr_funnel_stages",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_funnel_stages (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "create_sdr_funnel_cards",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_funnel_cards (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stage_id      INTEGER NOT NULL REFERENCES sdr_funnel_stages(id) ON DELETE CASCADE,
        jid           TEXT,
        contact_name  TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        title         TEXT NOT NULL DEFAULT '',
        value_cents   INTEGER,
        notes         TEXT NOT NULL DEFAULT '',
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "create_tutorials_modules",
    sql: `
      CREATE TABLE IF NOT EXISTS tutorials_modules (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "create_tutorials_lessons",
    sql: `
      CREATE TABLE IF NOT EXISTS tutorials_lessons (
        id          SERIAL PRIMARY KEY,
        module_id   INTEGER NOT NULL REFERENCES tutorials_modules(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "create_conversation_statuses",
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_statuses (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number  INTEGER NOT NULL DEFAULT 1,
        jid          TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'aberto',
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, slot_number, jid)
      )
    `,
  },
  {
    name: "create_quick_replies",
    sql: `
      CREATE TABLE IF NOT EXISTS quick_replies (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        shortcut   TEXT NOT NULL DEFAULT '',
        content    TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "create_sdr_messages",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_messages (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number  INTEGER NOT NULL DEFAULT 1,
        jid          TEXT NOT NULL,
        message_id   TEXT NOT NULL,
        from_me      BOOLEAN NOT NULL DEFAULT false,
        text         TEXT NOT NULL DEFAULT '',
        timestamp    INTEGER NOT NULL DEFAULT 0,
        media_type   TEXT,
        media_data   TEXT,
        media_mime   TEXT,
        media_name   TEXT,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, slot_number, message_id)
      )
    `,
  },
  {
    name: "create_sdr_chats",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_chats (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number     INTEGER NOT NULL DEFAULT 1,
        jid             TEXT NOT NULL,
        name            TEXT,
        phone           TEXT NOT NULL DEFAULT '',
        unread          INTEGER NOT NULL DEFAULT 0,
        last_message    TEXT NOT NULL DEFAULT '',
        last_timestamp  INTEGER NOT NULL DEFAULT 0,
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, slot_number, jid)
      )
    `,
  },
  {
    name: "create_sdr_chat_assignments",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_chat_assignments (
        id              SERIAL PRIMARY KEY,
        owner_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number     INTEGER NOT NULL DEFAULT 1,
        jid             TEXT NOT NULL,
        assigned_to_id  INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        assigned_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(owner_user_id, slot_number, jid)
      )
    `,
  },
  {
    name: "add_media_url_to_sdr_messages",
    sql: `ALTER TABLE sdr_messages ADD COLUMN IF NOT EXISTS media_url TEXT`,
  },
  {
    name: "add_color_to_sdr_funnel_stages",
    sql: `ALTER TABLE sdr_funnel_stages ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6'`,
  },
  {
    name: "create_sdr_followup_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_followup_settings (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number   INTEGER NOT NULL DEFAULT 0,
        enabled       BOOLEAN NOT NULL DEFAULT FALSE,
        stages_json   TEXT NOT NULL DEFAULT '[{"minutes":30},{"minutes":60},{"minutes":240},{"minutes":720},{"minutes":1440},{"minutes":2880}]',
        ai_prompt     TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, slot_number)
      );
    `,
  },
  {
    name: "create_sdr_followup_queue",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_followup_queue (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        instance_name  TEXT NOT NULL,
        slot_number    INTEGER NOT NULL,
        jid            TEXT NOT NULL,
        stage          INTEGER NOT NULL,
        scheduled_at   TIMESTAMP NOT NULL,
        sent_at        TIMESTAMP,
        cancelled_at   TIMESTAMP,
        cancel_reason  TEXT,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_followup_queue_instance_jid
        ON sdr_followup_queue(instance_name, jid)
        WHERE sent_at IS NULL AND cancelled_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_followup_queue_scheduled
        ON sdr_followup_queue(scheduled_at)
        WHERE sent_at IS NULL AND cancelled_at IS NULL;
    `,
  },
  {
    name: "create_sdr_pix_charges",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_pix_charges (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id       INTEGER,
        instance       TEXT NOT NULL DEFAULT '',
        jid            TEXT NOT NULL DEFAULT '',
        contact_name   TEXT NOT NULL DEFAULT '',
        correlation_id TEXT NOT NULL UNIQUE,
        value_cents    INTEGER NOT NULL DEFAULT 0,
        description    TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'PENDING',
        paid_at        TIMESTAMP,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sdr_pix_charges_user ON sdr_pix_charges(user_id);
      CREATE INDEX IF NOT EXISTS idx_sdr_pix_charges_corr ON sdr_pix_charges(correlation_id);
    `,
  },
  {
    name: "add_agent_woovi_fields",
    sql: `
      ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS woovi_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS pix_description  TEXT    NOT NULL DEFAULT '';
      ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS pix_min_cents    INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS pix_max_cents    INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    name: "create_sdr_contact_tags",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_contact_tags (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jid         TEXT NOT NULL,
        tag_id      INTEGER NOT NULL REFERENCES sdr_tags(id) ON DELETE CASCADE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, jid, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sdr_contact_tags_user ON sdr_contact_tags(user_id);
      CREATE INDEX IF NOT EXISTS idx_sdr_contact_tags_jid  ON sdr_contact_tags(user_id, jid);
    `,
  },
  {
    name: "create_sdr_ai_paused",
    sql: `
      CREATE TABLE IF NOT EXISTS sdr_ai_paused (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_number INTEGER NOT NULL DEFAULT 1,
        jid         TEXT NOT NULL,
        paused_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, slot_number, jid)
      );
      CREATE INDEX IF NOT EXISTS idx_sdr_ai_paused_user ON sdr_ai_paused(user_id, slot_number);
    `,
  },
  {
    name: "create_user_acquirers",
    sql: `
      CREATE TABLE IF NOT EXISTS user_acquirers (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        gateway     TEXT NOT NULL,
        api_key     TEXT NOT NULL DEFAULT '',
        enabled     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, gateway)
      );
      CREATE INDEX IF NOT EXISTS idx_user_acquirers_user ON user_acquirers(user_id);
    `,
  },
  {
    name: "create_call_schedule_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS call_schedule_settings (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings   TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS call_appointments (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        guest_name       TEXT NOT NULL DEFAULT '',
        guest_phone      TEXT NOT NULL DEFAULT '',
        scheduled_at     TIMESTAMP NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        notes            TEXT NOT NULL DEFAULT '',
        status           TEXT NOT NULL DEFAULT 'pending',
        created_at       TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_call_appointments_user ON call_appointments(user_id);
      CREATE INDEX IF NOT EXISTS idx_call_appointments_scheduled ON call_appointments(scheduled_at);
    `,
  },
  {
    name: "create_call_rooms",
    sql: `
      CREATE TABLE IF NOT EXISTS call_rooms (
        id          SERIAL PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL DEFAULT 'Reunião',
        created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TIMESTAMP NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_call_rooms_created_by ON call_rooms(created_by);
      CREATE INDEX IF NOT EXISTS idx_call_rooms_expires_at ON call_rooms(expires_at);
    `,
  },
  {
    name: "add_pix_gateway_to_agents",
    sql: `ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS pix_gateway TEXT NOT NULL DEFAULT '';`,
  },
  {
    name: "add_pix_charge_media",
    sql: `
      ALTER TABLE sdr_pix_charges ADD COLUMN IF NOT EXISTS br_code       TEXT NOT NULL DEFAULT '';
      ALTER TABLE sdr_pix_charges ADD COLUMN IF NOT EXISTS qr_code_image TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    name: "add_call_enabled_to_agents",
    sql: `ALTER TABLE sdr_agents ADD COLUMN IF NOT EXISTS call_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
  },
  {
    name: "add_call_appointment_agent_fields",
    sql: `
      ALTER TABLE call_appointments ADD COLUMN IF NOT EXISTS room_slug      TEXT    NOT NULL DEFAULT '';
      ALTER TABLE call_appointments ADD COLUMN IF NOT EXISTS source         TEXT    NOT NULL DEFAULT 'manual';
      ALTER TABLE call_appointments ADD COLUMN IF NOT EXISTS instance       TEXT    NOT NULL DEFAULT '';
      ALTER TABLE call_appointments ADD COLUMN IF NOT EXISTS jid            TEXT    NOT NULL DEFAULT '';
      ALTER TABLE call_appointments ADD COLUMN IF NOT EXISTS reminder_sent  BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    name: "add_avatar_url_to_sdr_contacts",
    sql: `ALTER TABLE sdr_contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
  },
];

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  for (const m of MIGRATIONS) {
    try {
      await pool.query(m.sql);
      logger.info({ migration: m.name }, "Migration applied");
    } catch (err) {
      logger.error({ migration: m.name, err }, "Migration failed");
    }
  }
}
