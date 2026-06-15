import { Router } from "express";
import { createHash } from "crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { createWooviCharge, parsePixValue } from "../lib/woovi.js";
import { rcGet, rcSet, rcDel } from "../lib/response-cache.js";
import { db } from "@workspace/db";
import { sdrTagsTable, sdrContactTagsTable, sdrInstanceMapTable, sdrAgentSlotsTable, sdrAgentsTable, sdrUserPlansTable, sdrContactsTable, sdrContactNotesTable, sdrMessagesTable, sdrChatsTable, usersTable, sdrFollowupSettingsTable, sdrFollowupQueueTable, sdrPixChargesTable, sdrAiPausedTable, userAcquirersTable, callRoomsTable, callAppointmentsTable, callScheduleSettingsTable } from "@workspace/db";
import { eq, and, desc, lte, gte, isNull } from "drizzle-orm";
import { buildMediaPath, uploadMediaToBunny, uploadAvatarToBunny } from "../lib/bunny.js";

async function requireActivePlan(userId: number, slot: number): Promise<{ ok: true; maxSlots: number } | { ok: false; error: string }> {
  const [plan] = await db.select().from(sdrUserPlansTable).where(eq(sdrUserPlansTable.userId, userId)).limit(1);
  if (!plan) {
    // Slot 1 is always free — no paid plan required
    if (slot === 1) return { ok: true, maxSlots: 1 };
    return { ok: false, error: "Você precisa de um plano ativo para conectar mais de 1 WhatsApp." };
  }
  if (slot > plan.maxSlots) return { ok: false, error: `Seu plano permite até ${plan.maxSlots} slot(s). Faça upgrade para acessar mais conexões.` };
  return { ok: true, maxSlots: plan.maxSlots };
}

const router = Router();

// ── Per-instance isolation maps ───────────────────────────────────────────────
// All keyed by instanceName — completely isolated per slot/user

/** Persist clearedAt to disk so it survives PM2 restarts */
const CLEARED_AT_FILE = path.join(
  process.env.SESSION_FILE_PATH ?? "/tmp/.volatusnet-sessions",
  "cleared_at.json"
);
const chatClearedAt = new Map<string, number>();

async function loadClearedAt(): Promise<void> {
  try {
    const raw = await fsp.readFile(CLEARED_AT_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, number>;
    for (const [k, v] of Object.entries(obj)) chatClearedAt.set(k, v);
  } catch { /* file doesn't exist yet — start fresh */ }
}

async function saveClearedAt(): Promise<void> {
  try {
    const obj: Record<string, number> = {};
    for (const [k, v] of chatClearedAt) obj[k] = v;
    await fsp.mkdir(path.dirname(CLEARED_AT_FILE), { recursive: true });
    await fsp.writeFile(CLEARED_AT_FILE, JSON.stringify(obj));
  } catch { /* non-fatal */ }
}

// Load persisted clearedAt on startup
loadClearedAt().catch(() => {});

/** Last-message snapshot per JID — used for chat list preview */
interface LiveChatEntry { name: string | null; text: string; ts: number; fromMe: boolean; }
const liveChats = new Map<string, Map<string, LiveChatEntry>>();
const MAX_LIVE_CHATS_PER_INSTANCE = 500;
function getLive(instance: string): Map<string, LiveChatEntry> {
  if (!liveChats.has(instance)) liveChats.set(instance, new Map());
  return liveChats.get(instance)!;
}
function addLiveEntry(instance: string, jid: string, entry: LiveChatEntry) {
  const m = getLive(instance);
  if (!m.has(jid) && m.size >= MAX_LIVE_CHATS_PER_INSTANCE) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of m) { if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; } }
    if (oldestKey) m.delete(oldestKey);
  }
  m.set(jid, entry);
  saveChatToDb(instance, jid, entry).catch(() => {}); // fire-and-forget DB persistence
}

/** Full message history per JID — populated by webhooks and outbound sends.
 *  This is the primary source when Evolution API findMessages returns nothing.
 *  Keeps messages only from the current server session (resets on restart = "new msgs only"). */
interface HistoryMsg {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  senderName: string | null;
  mediaType?: string;   // "image" | "audio" | "video" | "sticker" | "document"
  mediaData?: string;   // base64 content — fallback when Bunny upload fails
  mediaMime?: string;   // MIME type e.g. "image/jpeg", "audio/ogg; codecs=opus"
  mediaName?: string;   // filename for documents
  mediaUrl?: string;    // Bunny CDN URL (preferred over base64)
}
const msgHistory = new Map<string, Map<string, HistoryMsg[]>>();
const MAX_HISTORY_PER_JID = 200;

function getHistory(instance: string, jid: string): HistoryMsg[] {
  let byInstance = msgHistory.get(instance);
  if (!byInstance) { byInstance = new Map(); msgHistory.set(instance, byInstance); }
  let arr = byInstance.get(jid);
  if (!arr) { arr = []; byInstance.set(jid, arr); }
  return arr;
}

function pushHistory(instance: string, jid: string, msg: HistoryMsg) {
  const arr = getHistory(instance, jid);
  if (arr.some(m => m.id === msg.id)) return; // dedupe by id
  arr.push(msg);
  arr.sort((a, b) => a.timestamp - b.timestamp);
  if (arr.length > MAX_HISTORY_PER_JID) arr.splice(0, arr.length - MAX_HISTORY_PER_JID);
  saveMessageToDb(instance, jid, msg).catch(() => {}); // fire-and-forget DB persistence
}

function clearHistory(instance: string) {
  getLive(instance).clear();
  msgHistory.get(instance)?.clear();
}

/** Contact name cache: instance → jid → best-known display name */
const contactNames = new Map<string, Map<string, string>>();
const MAX_NAMES_PER_INSTANCE = 2000;
function cacheContactName(instance: string, jid: string, name: string | null) {
  if (!name?.trim()) return;
  if (!contactNames.has(instance)) contactNames.set(instance, new Map());
  const m = contactNames.get(instance)!;
  // Evict oldest entries when cap reached
  if (!m.has(jid) && m.size >= MAX_NAMES_PER_INSTANCE) {
    const firstKey = m.keys().next().value;
    if (firstKey) m.delete(firstKey);
  }
  m.set(jid, name.trim());
}
function getCachedName(instance: string, jid: string): string | null {
  return contactNames.get(instance)?.get(jid) ?? null;
}

/** Phone number cache per instance — avoids repeated fetchInstances calls */
const instancePhoneCache = new Map<string, { number: string; name?: string }>();

/** Processed webhook message IDs — prevents duplicate AI replies on retries */
const aiProcessed = new Map<string, number>(); // msgId → timestamp
function markAiProcessed(msgId: string): boolean {
  const now = Date.now();
  if (aiProcessed.has(msgId)) return false;
  aiProcessed.set(msgId, now);
  // Cleanup entries older than 15 min to avoid memory growth
  if (aiProcessed.size > 2000) {
    const cutoff = now - 15 * 60 * 1000;
    for (const [k, v] of aiProcessed) { if (v < cutoff) aiProcessed.delete(k); }
  }
  return true;
}

/** Rate limit: last AI reply timestamp per (instance:jid) — prevents reply storm */
const lastAiReplyAt = new Map<string, number>();

/**
 * Global AI concurrency limiter — hard cap on simultaneous OpenAI API calls.
 * Prevents thunder-herd when 50+ clients all receive messages at once.
 */
const AI_MAX_CONCURRENT = 10;
let aiInFlight = 0;

// ── AI reply queue (per-instance throttle) ───────────────────────────────────
// Humanizes response timing and protects against WhatsApp rate-limiting.
// Each instance has its own queue + worker. Sends are spaced 8–20 s apart,
// with a 5–10 s initial delay before the first reply. Hard cap: 60 replies/hour.
const AI_QUEUE_INIT_MIN_MS = 5_000;
const AI_QUEUE_INIT_MAX_MS = 10_000;
const AI_QUEUE_BETWEEN_MIN_MS = 8_000;
const AI_QUEUE_BETWEEN_MAX_MS = 20_000;
const AI_MAX_PER_HOUR = 60;
const AI_MAX_QUEUE_SIZE = 100;

interface AiQueueItem { jid: string; userText: string; }
const aiQueues = new Map<string, AiQueueItem[]>();
const aiQueueWorking = new Set<string>();
const aiHourlyBucket = new Map<string, { count: number; windowStart: number }>();

function aiHourlyOk(instance: string): boolean {
  const now = Date.now();
  const b = aiHourlyBucket.get(instance);
  if (!b || now - b.windowStart >= 3_600_000) {
    aiHourlyBucket.set(instance, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= AI_MAX_PER_HOUR) return false;
  b.count++;
  return true;
}

function aiQueueDelay(isFirst: boolean): number {
  if (isFirst) return AI_QUEUE_INIT_MIN_MS + Math.floor(Math.random() * (AI_QUEUE_INIT_MAX_MS - AI_QUEUE_INIT_MIN_MS));
  return AI_QUEUE_BETWEEN_MIN_MS + Math.floor(Math.random() * (AI_QUEUE_BETWEEN_MAX_MS - AI_QUEUE_BETWEEN_MIN_MS));
}

function enqueueAiReply(instance: string, jid: string, userText: string): void {
  if (!aiQueues.has(instance)) aiQueues.set(instance, []);
  const q = aiQueues.get(instance)!;
  if (q.length >= AI_MAX_QUEUE_SIZE) {
    console.log(`[AI-queue] ${instance} full (${AI_MAX_QUEUE_SIZE}) — dropping ${jid.slice(0, 20)}`);
    return;
  }
  q.push({ jid, userText });
  console.log(`[AI-queue] ${instance} enqueued ${jid.slice(0, 20)} queue=${q.length}`);
  runQueueWorker(instance);
}

async function runQueueWorker(instance: string): Promise<void> {
  if (aiQueueWorking.has(instance)) return;
  aiQueueWorking.add(instance);
  console.log(`[AI-queue] ${instance} worker started`);
  try {
    const q = aiQueues.get(instance) ?? [];
    let first = true;
    while (q.length > 0) {
      const delay = aiQueueDelay(first);
      first = false;
      console.log(`[AI-queue] ${instance} delay ${delay}ms (${q.length} pending)`);
      await new Promise<void>(r => setTimeout(r, delay));

      if (!aiHourlyOk(instance)) {
        console.log(`[AI-queue] ${instance} hourly cap (${AI_MAX_PER_HOUR}/h) — sleeping 60s`);
        await new Promise<void>(r => setTimeout(r, 60_000));
        continue;
      }

      const item = q.shift();
      if (!item) break;

      if (aiInFlight >= AI_MAX_CONCURRENT) {
        q.unshift(item);
        console.log(`[AI-queue] ${instance} concurrency cap — re-queuing`);
        await new Promise<void>(r => setTimeout(r, 2_000));
        continue;
      }

      aiInFlight++;
      _doAiReply(instance, item.jid, item.userText).catch(err => {
        console.error(`[AI-queue] ${instance}:${item.jid} error:`, String(err));
      }).finally(() => { aiInFlight--; });
    }
  } finally {
    aiQueueWorking.delete(instance);
    console.log(`[AI-queue] ${instance} worker done`);
  }
}

// ── userId → email cache — used to build Bunny storage paths ─────────────────
const userEmailCache = new Map<number, string>();
async function getUserEmail(userId: number): Promise<string | null> {
  if (userEmailCache.has(userId)) return userEmailCache.get(userId)!;
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (u) { userEmailCache.set(userId, u.email); return u.email; }
  return null;
}

// ── instanceName → userId reverse-lookup cache ───────────────────────────────
// instanceNames are SHA256 hashes — stable for the lifetime of the process.
const instanceUserCache = new Map<string, number>();

async function getInstanceUserId(inst: string): Promise<number | null> {
  if (instanceUserCache.has(inst)) return instanceUserCache.get(inst)!;
  const [m] = await db.select({ userId: sdrInstanceMapTable.userId })
    .from(sdrInstanceMapTable).where(eq(sdrInstanceMapTable.instanceName, inst)).limit(1);
  if (m) { instanceUserCache.set(inst, m.userId); return m.userId; }
  return null;
}

/** instanceName → { userId, slotNumber } — cached, used for DB persistence */
const instanceInfoCache = new Map<string, { userId: number; slotNumber: number }>();
async function getInstanceInfo(inst: string): Promise<{ userId: number; slotNumber: number } | null> {
  if (instanceInfoCache.has(inst)) return instanceInfoCache.get(inst)!;
  const [m] = await db.select({ userId: sdrInstanceMapTable.userId, slotNumber: sdrInstanceMapTable.slotNumber })
    .from(sdrInstanceMapTable).where(eq(sdrInstanceMapTable.instanceName, inst)).limit(1);
  if (!m) return null;
  const info = { userId: m.userId, slotNumber: m.slotNumber };
  instanceInfoCache.set(inst, info);
  instanceUserCache.set(inst, m.userId); // keep both caches in sync
  return info;
}

/** Max base64 size (~75 KB decoded) to save as media_data in DB — keeps DB lean */
const MAX_MEDIA_DB_SIZE = 100_000;

/** Retry a DB operation up to maxAttempts with exponential backoff — never throws */
async function withDbRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); }
    catch { if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 800 * Math.pow(2, i))); }
  }
  return undefined;
}

/** Persist a single message to DB (fire-and-forget — never throws) */
async function saveMessageToDb(instance: string, jid: string, msg: HistoryMsg): Promise<void> {
  const info = await getInstanceInfo(instance);
  if (!info) return;

  // Upload media to Bunny CDN — store URL instead of base64 in DB
  let mediaUrl: string | null = null;
  let mediaDataForDb: string | null = null;
  if (msg.mediaData && msg.mediaMime && msg.mediaType) {
    const userEmail = await getUserEmail(info.userId);
    if (userEmail) {
      const storagePath = buildMediaPath(userEmail, info.slotNumber, msg.id, msg.mediaMime);
      mediaUrl = await uploadMediaToBunny(storagePath, msg.mediaData, msg.mediaMime);
    }
    // Only fall back to DB storage if Bunny upload failed and size is within limit
    if (!mediaUrl && msg.mediaData.length <= MAX_MEDIA_DB_SIZE) {
      mediaDataForDb = msg.mediaData;
    }
  }

  await withDbRetry(() => db.insert(sdrMessagesTable).values({
    userId: info.userId, slotNumber: info.slotNumber, jid,
    messageId: msg.id, fromMe: msg.fromMe, text: msg.text,
    timestamp: msg.timestamp,
    mediaType: msg.mediaType ?? null,
    mediaData: mediaDataForDb,
    mediaMime: msg.mediaMime ?? null,
    mediaName: msg.mediaName ?? null,
    mediaUrl,
  }).onConflictDoNothing());
}

/** Persist or update a chat entry in DB (fire-and-forget — never throws) */
async function saveChatToDb(instance: string, jid: string, entry: LiveChatEntry): Promise<void> {
  if (!isPersonJid(jid)) return; // never persist group chats
  const info = await getInstanceInfo(instance);
  if (!info) return;
  const phone = resolvePhone(instance, jid);
  await withDbRetry(() => db.insert(sdrChatsTable).values({
    userId: info.userId, slotNumber: info.slotNumber, jid,
    name: entry.name ?? null, phone,
    unread: 0, lastMessage: entry.text, lastTimestamp: entry.ts,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [sdrChatsTable.userId, sdrChatsTable.slotNumber, sdrChatsTable.jid],
    set: { name: entry.name ?? null, lastMessage: entry.text, lastTimestamp: entry.ts, updatedAt: new Date() },
  }));
}

/** Delete all messages + chats for an instance from DB (called on clearHistory) */
async function clearHistoryInDb(instance: string): Promise<void> {
  const info = await getInstanceInfo(instance);
  if (!info) return;
  await db.delete(sdrMessagesTable).where(
    and(eq(sdrMessagesTable.userId, info.userId), eq(sdrMessagesTable.slotNumber, info.slotNumber)),
  );
  await db.delete(sdrChatsTable).where(
    and(eq(sdrChatsTable.userId, info.userId), eq(sdrChatsTable.slotNumber, info.slotNumber)),
  );
}

/**
 * Cache for @lid → resolved real JID (phone@s.whatsapp.net or bare phone).
 * @lid JIDs are WhatsApp internal IDs — can't send to them directly.
 * We resolve them once via fetchProfile and cache the result.
 */
const lidPhoneCache = new Map<string, string>(); // key: "instance:@lid" → resolved JID or phone

// Tracks jids with an avatar fetch already in-flight to avoid duplicate API calls
const avatarFetchInFlight = new Set<string>();

/** Fetch WhatsApp profile picture via Evolution API, upload to Bunny, persist URL in DB */
async function fetchAndStoreAvatar(instance: string, jid: string, uid: number): Promise<void> {
  const key = `${instance}:${jid}`;
  if (avatarFetchInFlight.has(key)) return;
  avatarFetchInFlight.add(key);
  try {
    const r = await evoFetch(`/chat/fetchProfilePicture/${instance}`, {
      method: "POST",
      body: JSON.stringify({ number: jid }),
    });
    const data = r.data as Record<string, unknown> | null;
    const picUrl = (data?.profilePictureUrl ?? data?.picture ?? data?.url) as string | undefined;
    if (!picUrl || typeof picUrl !== "string") return;
    const cdnUrl = await uploadAvatarToBunny(jid, picUrl);
    if (!cdnUrl) return;
    await db.update(sdrContactsTable)
      .set({ avatarUrl: cdnUrl })
      .where(and(
        eq(sdrContactsTable.userId, uid),
        eq(sdrContactsTable.instanceName, instance),
        eq(sdrContactsTable.jid, jid),
      ));
    console.log(`[avatar] stored for ${jid} → ${cdnUrl}`);
  } catch (err) {
    console.error(`[avatar] fetchAndStoreAvatar failed for ${jid}:`, String(err));
  } finally {
    avatarFetchInFlight.delete(key);
  }
}

async function resolveLidPhone(instance: string, lidJid: string): Promise<string | null> {
  const cacheKey = `${instance}:${lidJid}`;
  if (lidPhoneCache.has(cacheKey)) return lidPhoneCache.get(cacheKey)!;

  // Try fetchProfile — some Evolution API versions return the real phone JID
  try {
    const r = await evoFetch(`/chat/fetchProfile/${instance}`, {
      method: "POST",
      body: JSON.stringify({ number: lidJid }),
    });
    console.log(`[lid-resolve] fetchProfile ${lidJid}: status=${r.status}`, JSON.stringify(r.data).slice(0, 200));
    if (r.ok && r.data) {
      const d = r.data as Record<string, unknown>;
      // id or jid field with @s.whatsapp.net = real phone
      const resolved = String(d.id ?? d.jid ?? d.number ?? "");
      if (resolved && resolved.includes("@s.whatsapp.net")) {
        const phone = jidToPhone(resolved);
        lidPhoneCache.set(cacheKey, phone);
        console.log(`[lid-resolve] ${lidJid} → ${phone}`);
        return phone;
      }
    }
  } catch (err) {
    console.error(`[lid-resolve] fetchProfile failed for ${lidJid}:`, String(err));
  }

  // Fallback: try whatsappNumbers endpoint with the lid numeric part
  try {
    const lidNum = jidToPhone(lidJid); // strip @lid suffix
    const r2 = await evoFetch(`/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      body: JSON.stringify({ numbers: [lidNum] }),
    });
    console.log(`[lid-resolve] whatsappNumbers ${lidNum}: status=${r2.status}`, JSON.stringify(r2.data).slice(0, 200));
    if (r2.ok && Array.isArray(r2.data)) {
      for (const entry of r2.data as Record<string, unknown>[]) {
        if (entry.exists !== true) continue; // only use confirmed existing numbers
        const resolvedJid = String(entry.jid ?? entry.id ?? "");
        if (resolvedJid.endsWith("@s.whatsapp.net")) {
          const phone = jidToPhone(resolvedJid);
          lidPhoneCache.set(cacheKey, phone);
          console.log(`[lid-resolve] whatsappNumbers ${lidJid} → ${phone}`);
          return phone;
        }
      }
    }
  } catch (err) {
    console.error(`[lid-resolve] whatsappNumbers failed for ${lidJid}:`, String(err));
  }

  console.error(`[lid-resolve] could not resolve ${lidJid} — @lid contact cannot be reached with this Evolution API version`);
  return null;
}

// ── Auto-reconnect on unexpected disconnection ────────────────────────────────
// When Evolution API fires connection.update with state != "open", we schedule
// up to 3 reconnect attempts (8 s → 30 s → 120 s).  Evolution API will use
// the saved Baileys session file and reconnect silently — no new QR needed
// unless the session has truly expired, in which case the user must re-scan.
const reconnectAttempts = new Map<string, number>(); // instance → attempt count
const reconnectTimers  = new Map<string, ReturnType<typeof setTimeout>>();
const RECONNECT_DELAYS = [8_000, 30_000, 120_000, 300_000, 900_000]; // 8s→30s→2min→5min→15min

function scheduleReconnect(instance: string): void {
  // Clear any pending timer for this instance
  const existing = reconnectTimers.get(instance);
  if (existing) clearTimeout(existing);

  const attempt = reconnectAttempts.get(instance) ?? 0;
  if (attempt >= RECONNECT_DELAYS.length) {
    // All attempts exhausted — user must re-scan QR
    reconnectAttempts.delete(instance);
    console.error(`[reconnect] ${instance}: all ${RECONNECT_DELAYS.length} attempts failed — session expired`);
    return;
  }

  const delay = RECONNECT_DELAYS[attempt];
  console.log(`[reconnect] ${instance}: attempt ${attempt + 1} in ${delay / 1000}s`);

  const timer = setTimeout(async () => {
    reconnectTimers.delete(instance);
    try {
      // If already reconnected (e.g. by another path), skip
      const state = await fetchInstanceState(instance);
      if (state.connected) {
        reconnectAttempts.delete(instance);
        console.log(`[reconnect] ${instance}: already connected — cancelling`);
        return;
      }
      // Ask Evolution API to reconnect using saved session file
      await evoFetch(`/instance/connect/${instance}`);
      reconnectAttempts.set(instance, attempt + 1);
      // Wait 6 s then check if it worked; if not, next attempt will be scheduled
      // via the next connection.update webhook event (state != "open")
    } catch (err) {
      console.error(`[reconnect] ${instance}: error on attempt ${attempt + 1}:`, String(err));
      reconnectAttempts.set(instance, attempt + 1);
      scheduleReconnect(instance); // jump straight to next delay
    }
  }, delay);

  reconnectTimers.set(instance, timer);
  reconnectAttempts.set(instance, attempt + 1);
}

function aiRateLimitOk(instance: string, jid: string, cooldownMs = 4000): boolean {
  const key = `${instance}:${jid}`;
  const last = lastAiReplyAt.get(key) ?? 0;
  if (Date.now() - last < cooldownMs) return false;
  lastAiReplyAt.set(key, Date.now());
  return true;
}

// ── Evolution API helpers ─────────────────────────────────────────────────────
const EVO_URL = process.env.EVO_URL ?? "http://2.25.180.138:8080";
const EVO_KEY = process.env.EVO_KEY ?? "katrivo-evolution-secret-2025";

function instanceName(userId: number, slot: number = 1): string {
  const hash = createHash("sha256")
    .update(`${userId}:${slot}`)
    .digest("hex")
    .slice(0, 7)
    .toUpperCase();
  return `sdr-${hash}`;
}

/** On startup: pre-populate liveChats from DB so chats survive PM2 restarts */
async function warmupLiveChats(): Promise<void> {
  try {
    const rows = (await db.select().from(sdrChatsTable)
      .orderBy(desc(sdrChatsTable.lastTimestamp))
      .limit(2000)).filter(r => isPersonJid(r.jid));
    let count = 0;
    for (const r of rows) {
      const inst = instanceName(r.userId, r.slotNumber);
      const m = getLive(inst);
      if (!m.has(r.jid)) {
        m.set(r.jid, {
          name: r.name ?? null,
          text: r.lastMessage ?? "",
          ts: r.lastTimestamp ?? 0,
          fromMe: false,
        });
        count++;
      }
    }
    console.log(`[warmup] liveChats loaded ${count} chats from DB`);
  } catch (err) {
    console.error("[warmup] liveChats failed — starting empty:", String(err));
  }
}
warmupLiveChats().catch(() => {});

function getSlot(query: Record<string, unknown>): number {
  const s = parseInt(String(query.slot ?? "1"), 10);
  return isNaN(s) || s < 1 || s > 5 ? 1 : s;
}

type EvoResult = { ok: boolean; status: number; data: unknown };

/** In-flight GET dedup: if the same URL is already in-flight, reuse the same promise.
 *  Prevents thundering-herd (15 users × same instance = 1 Evo API call, not 15). */
const evoInflight = new Map<string, Promise<EvoResult>>();

async function evoFetch(path: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<EvoResult> {
  const isGet = !options.method || options.method.toUpperCase() === "GET";
  const dedupKey = isGet ? `${path}` : null;

  if (dedupKey && evoInflight.has(dedupKey)) {
    return evoInflight.get(dedupKey)!;
  }

  const execute = async (): Promise<EvoResult> => {
    try {
      const res = await fetch(`${EVO_URL}${path.replace(/#/g, "%23")}`, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json", apikey: EVO_KEY, ...(options.headers ?? {}) },
      });
      const text = await res.text();
      try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
      catch { return { ok: res.ok, status: res.status, data: { message: text } }; }
    } catch (err: unknown) {
      return { ok: false, status: 503, data: { message: String(err) } };
    } finally {
      if (dedupKey) evoInflight.delete(dedupKey);
    }
  };

  const promise = execute();
  if (dedupKey) evoInflight.set(dedupKey, promise);
  return promise;
}

function extractText(message: unknown): string {
  if (!message) return "";
  const m = message as Record<string, unknown>;
  return (
    (m.conversation as string) ??
    ((m.extendedTextMessage as Record<string, unknown>)?.text as string) ??
    ((m.imageMessage as Record<string, unknown>)?.caption as string) ??
    ((m.videoMessage as Record<string, unknown>)?.caption as string) ??
    ((m.documentMessage as Record<string, unknown>)?.caption as string) ??
    ""
  );
}

/** Detect media type from a WhatsApp message object */
function detectMediaType(message: unknown): string | null {
  if (!message) return null;
  const m = message as Record<string, unknown>;
  if (m.imageMessage)    return "image";
  if (m.pttMessage)      return "audio";   // voice note (push-to-talk)
  if (m.audioMessage)    return "audio";
  if (m.videoMessage)    return "video";
  if (m.stickerMessage)  return "sticker";
  if (m.documentMessage) return "document";
  return null;
}

/**
 * Fetch base64-encoded media from Evolution API.
 * Only called for displayable types (image, audio, sticker) — skip large video/docs.
 */
async function fetchMediaBase64(
  instance: string,
  rawMsg: Record<string, unknown>,
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const r = await evoFetch(`/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      body: JSON.stringify({ message: rawMsg, convertToMp4: false }),
    });
    if (r.ok && r.data) {
      const d = r.data as Record<string, unknown>;
      const b64 = String(d.base64 ?? "");
      const mime = String(d.mimetype ?? "application/octet-stream");
      if (b64) return { base64: b64, mimetype: mime };
    }
    console.log(`[media] getBase64 returned status=${r.status}`, JSON.stringify(r.data).slice(0, 100));
  } catch (err) {
    console.error(`[media] getBase64FromMediaMessage failed:`, String(err));
  }
  return null;
}

/** Extract best display name from Evolution API chat/contact object */
/** Returns true if the string is a phone/ID number masquerading as a name (no letters) */
function isNumericId(s: string): boolean {
  return /^[+\d\s\-().]+$/.test(s);
}

function extractName(obj: Record<string, unknown>): string | null {
  const candidates = [
    obj.name, obj.pushName, obj.verifiedName, obj.notify,
    (obj.lastMessage as Record<string, unknown>)?.pushName,
  ];
  for (const c of candidates) {
    const s = (c as string | undefined)?.trim();
    if (s && !isNumericId(s)) return s; // rejeita nomes puramente numéricos (ex: +1669547237581231)
  }
  return null;
}

/** Strip JID suffix to get a phone number string */
function jidToPhone(jid: string): string {
  return jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@g.us", "").replace("@lid", "");
}

/**
 * Resolve the best displayable phone for a JID.
 * For @lid JIDs uses the lidPhoneCache (real number with DDD).
 * Falls back to jidToPhone for regular JIDs.
 */
function resolvePhone(instance: string, jid: string): string {
  if (jid.endsWith("@lid")) {
    const cached = lidPhoneCache.get(`${instance}:${jid}`);
    if (cached) return cached.startsWith("+") ? cached : `+${cached}`;
    return ""; // unresolved @lid — sem número real, retorna vazio (não exibe JID interno)
  }
  return `+${jidToPhone(jid)}`;
}

/** True for 1:1 person JIDs — covers all known formats */
function isPersonJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us") || jid.endsWith("@lid");
}

/**
 * Build the ordered list of `number` values to try when calling sendText.
 *
 * @lid contacts:
 *   The numeric part of a @lid JID is NOT a phone number — it is a WhatsApp
 *   internal LID. Sending bare digits returns {"exists":false}. The only
 *   working format is the full "@lid" JID passed verbatim.
 *
 * @s.whatsapp.net / @c.us contacts:
 *   Full JID (@s.whatsapp.net) first — bypasses existence check. Bare phone fallback.
 */
function buildSendCandidates(jid: string): string[] {
  if (jid.endsWith("@lid")) return [jid];
  const phone = jidToPhone(jid);
  // Full JID first: Evolution API v2 sends directly without existence check.
  // Bare phone triggers existence check which fails for non-standard number formats.
  return [`${phone}@s.whatsapp.net`, phone];
}

async function fetchInstanceState(name: string): Promise<{
  state: string; connected: boolean; phone: { number: string; name?: string } | null;
}> {
  const cs = await evoFetch(`/instance/connectionState/${name}`);
  const stateVal =
    ((cs.data as Record<string, unknown>)?.instance as Record<string, unknown>)?.state ??
    (cs.data as Record<string, unknown>)?.state;
  const state: string = (stateVal as string) ?? "close";
  const connected = state === "open";
  if (connected) {
    const phone = await fetchPhone(name);
    return { state, connected, phone };
  }
  return { state, connected, phone: null };
}

async function fetchPhone(name: string): Promise<{ number: string; name?: string } | null> {
  // Return cached value immediately — avoids full fetchInstances on every status poll
  if (instancePhoneCache.has(name)) return instancePhoneCache.get(name)!;

  const all = await evoFetch("/instance/fetchInstances");
  if (!all.ok) return null;
  const instances: unknown[] = Array.isArray(all.data) ? all.data : [];
  const found = instances.find((i: unknown) => {
    const inst = ((i as Record<string, unknown>).instance ?? i) as Record<string, unknown>;
    // v1: inst.instanceName  |  v2: inst.name (flat response)
    return (inst.instanceName ?? inst.name) === name;
  });
  if (!found) return null;
  const inst = ((found as Record<string, unknown>).instance ?? found) as Record<string, unknown>;
  const ownerJid: string = ((inst?.ownerJid ?? inst?.owner ?? "") as string);
  const raw = jidToPhone(ownerJid);
  if (!raw) return null;
  const result = { number: `+${raw}`, name: inst?.profileName as string | undefined };
  instancePhoneCache.set(name, result);
  return result;
}

// ── AI auto-response (runs detached, never blocks webhook) ───────────────────
function tryAiReply(instance: string, msgId: string, jid: string, userText: string): void {
  // 1. Deduplication — same message ID may arrive multiple times via webhook retries
  if (!markAiProcessed(msgId)) { console.log(`[AI] dup skip ${msgId}`); return; }

  // 2. Skip groups/broadcast — accept both @s.whatsapp.net (legacy) and @lid (new WA protocol)
  if (!isPersonJid(jid)) { console.log(`[AI] skip non-person jid: ${jid}`); return; }

  // 3. Per-contact cooldown — don't queue more than once per 10 s for same JID
  if (!aiRateLimitOk(instance, jid, 10_000)) { console.log(`[AI] rate-limited ${instance}:${jid}`); return; }

  // 4. Enqueue — worker fires with humanized delay (5–10 s first, 8–20 s between)
  enqueueAiReply(instance, jid, userText);
}

async function _doAiReply(instance: string, jid: string, userText: string): Promise<void> {
  console.log(`[AI] processing jid=${jid} on ${instance} inFlight=${aiInFlight}: "${userText.slice(0,60)}"`);

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    console.error("[AI] OPENAI_API_KEY not set — agent cannot reply");
    return;
  }

  // DB lookups — wrapped in try/catch so a DB hiccup doesn't crash the process
  // 5. Reverse-lookup: instanceName → userId + slotNumber
  const [mapping] = await db.select()
    .from(sdrInstanceMapTable)
    .where(eq(sdrInstanceMapTable.instanceName, instance))
    .limit(1);
  if (!mapping) {
    console.error(`[AI] no instance map for "${instance}" — slot was never registered. Run connect flow again.`);
    return;
  }
  console.log(`[AI] mapped ${instance} → userId=${mapping.userId} slot=${mapping.slotNumber}`);

  // 5b. Check if AI is paused for this specific conversation
  const [paused] = await db.select()
    .from(sdrAiPausedTable)
    .where(and(
      eq(sdrAiPausedTable.userId, mapping.userId),
      eq(sdrAiPausedTable.slotNumber, mapping.slotNumber),
      eq(sdrAiPausedTable.jid, jid),
    ))
    .limit(1);
  if (paused) {
    console.log(`[AI] paused for jid=${jid} — skipping auto-reply`);
    return;
  }

  // 5. Find agent attached to this slot
  const [agentSlot] = await db.select({ agentId: sdrAgentSlotsTable.agentId })
    .from(sdrAgentSlotsTable)
    .where(and(
      eq(sdrAgentSlotsTable.userId, mapping.userId),
      eq(sdrAgentSlotsTable.slotNumber, mapping.slotNumber),
    ))
    .limit(1);
  if (!agentSlot) {
    console.error(`[AI] no agent assigned to userId=${mapping.userId} slot=${mapping.slotNumber}`);
    return;
  }
  console.log(`[AI] agentSlot found: agentId=${agentSlot.agentId}`);

  // 6. Load agent — only respond when active
  const [agent] = await db.select()
    .from(sdrAgentsTable)
    .where(and(eq(sdrAgentsTable.id, agentSlot.agentId), eq(sdrAgentsTable.active, true)))
    .limit(1);
  if (!agent) {
    console.error(`[AI] agent ${agentSlot.agentId} not found or inactive`);
    return;
  }
  console.log(`[AI] agent "${agent.name}" active — building reply`);

  // 7. Build system prompt
  //    Payment links: injected with explicit mandatory rule so GPT always shares them
  //    when client asks about price/payment/purchase — links must appear verbatim.
  const payLinks: { label: string; url: string }[] = (() => {
    try { return JSON.parse(agent.paymentLinks || "[]"); } catch { return []; }
  })();
  const linksSection = payLinks.length > 0
    ? `\n\n---\nREGRA OBRIGATÓRIA — LINKS DE PAGAMENTO:\nSempre que o cliente perguntar sobre valor, preço, quanto custa, como pagar, formas de pagamento, quero comprar, quero contratar ou demonstrar interesse em fechar negócio, você DEVE incluir na resposta os links abaixo. Cole o link completo, sem encurtar, sem parafrasear:\n${payLinks.map(l => `• ${l.label}: ${l.url}`).join("\n")}`
    : "";

  const activeGateway = agent.pixGateway || (agent.wooviEnabled ? "woovi" : "");
  const gatewayLabels: Record<string, string> = { woovi: "Woovi", asaas: "Asaas", mercadopago: "Mercado Pago", pagarme: "Pagar.me" };
  const pixSection = activeGateway
    ? (() => {
        const minR = agent.pixMinCents > 0 ? `R$ ${(agent.pixMinCents / 100).toFixed(2).replace(".", ",")}` : null;
        const maxR = agent.pixMaxCents > 0 ? `R$ ${(agent.pixMaxCents / 100).toFixed(2).replace(".", ",")}` : null;
        const faixa = minR && maxR ? `entre ${minR} e ${maxR}` : minR ? `a partir de ${minR}` : maxR ? `até ${maxR}` : null;
        const gwLabel = gatewayLabels[activeGateway] ?? activeGateway;
        return `\n\n---\nPAGAMENTO PIX (${gwLabel}):\nVocê pode gerar cobranças PIX diretamente no chat. Quando o cliente confirmar que deseja pagar e você chegar no valor final:
1. Inclua EXATAMENTE esta tag no final da sua mensagem, substituindo VALOR pelo valor em reais: [GERAR_PIX:VALOR]
   Exemplos: [GERAR_PIX:150] ou [GERAR_PIX:89.90]
2. A tag NÃO aparece para o cliente — o sistema envia QR Code + link automaticamente
3. Só gere o PIX quando o cliente CONFIRMAR que quer pagar
4. Negocie o valor livremente${faixa ? `, mas o valor final deve ser ${faixa}` : ""}
5. Inclua a tag apenas UMA vez por mensagem
6. CRÍTICO: Quando usar [GERAR_PIX:VALOR], NÃO mencione QR Code, link de pagamento, código PIX ou qualquer detalhe de pagamento no texto — apenas confirme naturalmente (ex: "Perfeito! Gerando seu pagamento agora..."). Os links de pagamento cadastrados NÃO devem aparecer na mesma mensagem que gera PIX.`;
      })()
    : "";

  // Resolve real contact name and phone (needed for variable substitution and context)
  const contactName = getCachedName(instance, jid) ?? null;
  const contactPhone = resolvePhone(instance, jid);
  const contactPhoneClean = contactPhone.includes("@") ? null : contactPhone; // hide unresolved @lid placeholders

  // Support {{nome}}, {{name}}, {{telefone}}, {{phone}} variable substitution in the prompt
  const rawPrompt = agent.prompt?.trim()
    || "Você é um assistente prestativo. Responda sempre em português de forma clara e concisa.";
  const basePrompt = rawPrompt
    .replace(/\{\{nome\}\}/gi, contactName ?? "cliente")
    .replace(/\{\{name\}\}/gi, contactName ?? "cliente")
    .replace(/\{\{telefone\}\}/gi, contactPhoneClean ?? "")
    .replace(/\{\{phone\}\}/gi, contactPhoneClean ?? "");

  // Inject contact context so the agent always knows who it's talking to
  const ctxParts: string[] = [];
  if (contactName) ctxParts.push(`Nome: ${contactName}`);
  if (contactPhoneClean) ctxParts.push(`Telefone: ${contactPhoneClean}`);
  const contactCtx = ctxParts.length > 0
    ? `[Contato atual — ${ctxParts.join(" | ")}]\n\n`
    : "";

  const callSection = agent.callEnabled
    ? `\n\n---\nAGENDAMENTO DE CALL DE VÍDEO:\nVocê pode agendar chamadas de vídeo diretamente no chat. Quando o cliente confirmar data e horário:\n1. Inclua EXATAMENTE esta tag no final da sua mensagem: [AGENDAR_CALL:YYYY-MM-DDTHH:MM]\n   Exemplos: [AGENDAR_CALL:2024-06-20T14:00] ou [AGENDAR_CALL:2024-06-21T09:30]\n2. A tag NÃO aparece para o cliente — o sistema cria a sala e envia o link automaticamente\n3. Confirme data e horário com o cliente ANTES de incluir a tag\n4. Use sempre o formato ISO: ano-mês-diaThora:minuto (ex: 2024-06-20T14:00)\n5. Inclua a tag apenas UMA vez por mensagem\n6. CRÍTICO: Quando usar [AGENDAR_CALL:...], NÃO mencione o link — o sistema envia automaticamente. Confirme de forma natural (ex: "Perfeito! Sua call está agendada.")\nCANCELAMENTO: Se o cliente pedir para cancelar uma call, inclua: [CANCELAR_CALL:YYYY-MM-DDTHH:MM] com a data/hora exata do agendamento a cancelar.`
    : "";

  const systemPrompt = contactCtx + basePrompt + linksSection + pixSection + callSection
    + "\n\n---\nINSTRUÇÃO DO SISTEMA: Siga SEMPRE todas as regras e o tom definido acima em cada resposta. Nunca ignore as instruções. Responda somente com o conteúdo da mensagem, sem prefixos ou metadados.";

  // 8. Build conversation history (up to last 14 messages)
  const recentMsgs = getHistory(instance, jid).slice(-14);
  const histMessages: { role: "user" | "assistant"; content: string }[] = recentMsgs
    .filter(m => m.text && m.text !== "[mídia]")
    .map(m => ({ role: m.fromMe ? "assistant" as const : "user" as const, content: m.text }));
  // Avoid duplicating the incoming message (it was just pushed to history)
  if (histMessages.length > 0) {
    const last = histMessages[histMessages.length - 1];
    if (last.role === "user" && last.content === userText) histMessages.pop();
  }

  // 9. Call OpenAI
  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...histMessages,
          { role: "user", content: userText },
        ],
        max_tokens: 700,
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error(`[AI] fetch to OpenAI failed for ${instance}:${jid}:`, String(err));
    return;
  }

  if (!aiRes.ok) {
    const errBody = await aiRes.text().catch(() => "");
    console.error(`[AI] OpenAI ${aiRes.status} for ${instance}:${jid}:`, errBody.slice(0, 300));
    return;
  }

  const aiData = await aiRes.json() as Record<string, unknown>;
  const rawReplyText = (
    ((aiData?.choices as unknown[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown>
  )?.content as string;
  if (!rawReplyText?.trim()) return;

  // Detect PIX generation tag before sending
  const pixMatch = rawReplyText.match(/\[GERAR_PIX:([\d.,]+)\]/i);
  // Detect call scheduling / cancel tags before sending
  const callMatch   = rawReplyText.match(/\[AGENDAR_CALL:([^\]]+)\]/i);
  const cancelMatch = rawReplyText.match(/\[CANCELAR_CALL:([^\]]+)\]/i);
  const replyText = rawReplyText
    .replace(/\[GERAR_PIX:[\d.,]+\]/ig, "")
    .replace(/\[AGENDAR_CALL:[^\]]+\]/ig, "")
    .replace(/\[CANCELAR_CALL:[^\]]+\]/ig, "")
    .trim();

  // 10. Send reply via Evolution API
  //     @lid JIDs: send with the @lid JID directly first (Evolution API Baileys handles it).
  //     Fallback: resolve to phone and try phone candidates.
  //     @s.whatsapp.net: full JID first (bypasses existence check), bare phone as fallback.
  let sendCandidatesAi: string[];
  if (jid.endsWith("@lid")) {
    sendCandidatesAi = [jid]; // try @lid directly first
    const resolved = await resolveLidPhone(instance, jid).catch(() => null);
    if (resolved) {
      const phone = resolved.replace(/@.*/, "");
      sendCandidatesAi.push(`${phone}@s.whatsapp.net`, phone);
    }
    console.log(`[AI] @lid send candidates: ${sendCandidatesAi.join(", ")}`);
  } else {
    sendCandidatesAi = buildSendCandidates(jid);
  }

  let aiSendOk = false;
  if (replyText) {
    for (const candidate of sendCandidatesAi) {
      const sr = await evoFetch(`/message/sendText/${instance}`, {
        method: "POST",
        body: JSON.stringify({ number: candidate, textMessage: { text: replyText } }),
      });
      console.log(`[AI] sendText ${instance} → ${candidate}: ${sr.status}`, JSON.stringify(sr.data).slice(0, 120));
      if (sr.ok) { aiSendOk = true; break; }
    }
    if (!aiSendOk) {
      console.error(`[AI] All sendText attempts failed for ${instance}:${jid}`);
      return;
    }
  } else {
    aiSendOk = true; // PIX-only reply — no text needed
  }

  // 10b. Multi-gateway PIX — generate charge and send payment link / copia e cola
  if (pixMatch && activeGateway) {
    const valueReais = parsePixValue(pixMatch[1]);
    if (valueReais !== null) {
      const valueCents = Math.round(valueReais * 100);
      const corrID = `sdr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        // Look up the user's API key for this gateway
        const [acquirer] = await db.select()
          .from(userAcquirersTable)
          .where(and(eq(userAcquirersTable.userId, agent.userId), eq(userAcquirersTable.gateway, activeGateway)))
          .limit(1);
        const userApiKey = acquirer?.apiKey?.trim() ?? "";

        // Woovi can fall back to env key; all others require user key
        const canProceed = activeGateway === "woovi"
          ? (userApiKey || process.env.WOOVI_API_KEY)
          : userApiKey;

        if (!canProceed) {
          console.log(`[PIX] No API key configured for gateway ${activeGateway}, skipping`);
        } else {
          console.log(`[PIX] Generating ${activeGateway} charge R$ ${valueReais.toFixed(2)} for ${instance}:${jid}`);
          const desc = agent.pixDescription?.trim() || agent.name || "Pagamento";
          let pixLink: string | null = null;
          let pixCopiaECola: string | null = null;
          let pixQrImage: string | null = null;

          if (activeGateway === "woovi") {
            if (userApiKey) {
              const wRes = await fetch("https://api.woovi.com/api/v1/charge", {
                method: "POST",
                headers: { "Authorization": userApiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ value: valueCents, comment: desc, correlationID: corrID }),
                signal: AbortSignal.timeout(15_000),
              });
              if (wRes.ok) {
                const wData = await wRes.json() as Record<string, unknown>;
                const ch = wData.charge as Record<string, unknown> | undefined;
                const brCode = ch?.brCode as string | undefined;
                const qrImg = ch?.qrCodeImage as string | undefined;
                pixLink = `https://app.combozap.com/pix/${corrID}`;
                if (brCode) pixCopiaECola = brCode;
                if (qrImg) pixQrImage = qrImg;
              }
            } else {
              const charge = await createWooviCharge({ valueCents, description: desc, correlationID: corrID });
              pixLink = `https://app.combozap.com/pix/${charge.correlationID}`;
              const chData = charge as unknown as Record<string, unknown>;
              if (chData.brCode) pixCopiaECola = String(chData.brCode);
              if (chData.qrCodeImage) pixQrImage = String(chData.qrCodeImage);
            }

          } else if (activeGateway === "asaas") {
            const dueDate = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
            const custRes = await fetch("https://api.asaas.com/api/v3/customers", {
              method: "POST",
              headers: { "access_token": userApiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Cliente WhatsApp", externalReference: corrID }),
              signal: AbortSignal.timeout(10_000),
            });
            if (custRes.ok) {
              const custData = await custRes.json() as Record<string, unknown>;
              const custId = custData.id as string | undefined;
              if (custId) {
                const payRes = await fetch("https://api.asaas.com/api/v3/payments", {
                  method: "POST",
                  headers: { "access_token": userApiKey, "Content-Type": "application/json" },
                  body: JSON.stringify({ customer: custId, billingType: "PIX", value: valueReais, dueDate, description: desc, externalReference: corrID }),
                  signal: AbortSignal.timeout(10_000),
                });
                if (payRes.ok) {
                  const payData = await payRes.json() as Record<string, unknown>;
                  const payId = payData.id as string | undefined;
                  if (payId) {
                    await new Promise(r => setTimeout(r, 2000));
                    const qrRes = await fetch(`https://api.asaas.com/api/v3/payments/${payId}/pixQrCode`, {
                      headers: { "access_token": userApiKey },
                      signal: AbortSignal.timeout(10_000),
                    });
                    if (qrRes.ok) {
                      const qrData = await qrRes.json() as Record<string, unknown>;
                      pixCopiaECola = qrData.payload as string | undefined ?? null;
                      const enc = qrData.encodedImage as string | undefined;
                      if (enc) pixQrImage = enc.startsWith("data:") ? enc : `data:image/png;base64,${enc}`;
                    }
                  }
                }
              }
            }

          } else if (activeGateway === "mercadopago") {
            const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
              method: "POST",
              headers: { "Authorization": `Bearer ${userApiKey}`, "Content-Type": "application/json", "X-Idempotency-Key": corrID },
              body: JSON.stringify({ transaction_amount: valueReais, description: desc, payment_method_id: "pix", payer: { email: "cliente@combozap.com" }, external_reference: corrID }),
              signal: AbortSignal.timeout(15_000),
            });
            if (mpRes.ok) {
              const mpData = await mpRes.json() as Record<string, unknown>;
              const txData = (mpData.point_of_interaction as Record<string, unknown>)?.transaction_data as Record<string, unknown> | undefined;
              pixCopiaECola = txData?.qr_code as string | undefined ?? null;
              const qrB64 = txData?.qr_code_base64 as string | undefined;
              if (qrB64) pixQrImage = `data:image/png;base64,${qrB64}`;
            }

          } else if (activeGateway === "pagarme") {
            const pmRes = await fetch("https://api.pagar.me/core/v5/orders", {
              method: "POST",
              headers: { "Authorization": `Basic ${Buffer.from(userApiKey + ":").toString("base64")}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                items: [{ amount: valueCents, description: desc, quantity: 1, code: corrID }],
                customer: { name: "Cliente WhatsApp", type: "individual", email: "cliente@combozap.com", document: "00000000000", document_type: "CPF" },
                payments: [{ payment_method: "pix", pix: { expires_in: 3600 } }],
              }),
              signal: AbortSignal.timeout(15_000),
            });
            if (pmRes.ok) {
              const pmData = await pmRes.json() as Record<string, unknown>;
              const charges = pmData.charges as Record<string, unknown>[] | undefined;
              const lastTx = charges?.[0]?.last_transaction as Record<string, unknown> | undefined;
              pixCopiaECola = lastTx?.qr_code as string | undefined ?? null;
              const qrUrl = lastTx?.qr_code_url as string | undefined;
              if (qrUrl) pixQrImage = qrUrl;
            }
          }

          if (pixLink || pixCopiaECola || pixQrImage) {
            const valorFmt = `R$ ${valueReais.toFixed(2).replace(".", ",")}`;

            if (pixQrImage) {
              // Send QR code image + link/brCode as caption (one clean message)
              const caption = pixLink
                ? `💳 *Pagamento PIX — ${valorFmt}*\n\n🔗 Abra o link para pagar:\n${pixLink}\n\n_No link você preenche seus dados e escaneia o QR Code para confirmar._`
                : `💳 *Pagamento PIX — ${valorFmt}*\n\nCopie o código:\n\`\`\`${pixCopiaECola}\`\`\`\n\n_Cole no app do seu banco para pagar._`;
              for (const candidate of sendCandidatesAi) {
                const imgRes = await evoFetch(`/message/sendMedia/${instance}`, {
                  method: "POST",
                  body: JSON.stringify({
                    number: candidate,
                    mediaMessage: { mediatype: "image", media: pixQrImage, caption },
                  }),
                });
                if (imgRes.ok) break;
              }
            } else {
              // Fallback: text only (no QR image from this gateway)
              const msgText = pixLink
                ? `💳 *Pagamento PIX — ${valorFmt}*\n\n🔗 Link para pagar:\n${pixLink}\n\n_Acesse o link, preencha seus dados e escaneie o QR Code ou copie o código PIX._`
                : `💳 *Pagamento PIX — ${valorFmt}*\n\n\`\`\`${pixCopiaECola}\`\`\`\n\n_Copie o código acima e cole no app do seu banco._`;
              for (const candidate of sendCandidatesAi) {
                const brRes = await evoFetch(`/message/sendText/${instance}`, {
                  method: "POST",
                  body: JSON.stringify({ number: candidate, textMessage: { text: msgText } }),
                });
                if (brRes.ok) break;
              }
            }
            console.log(`[PIX] Charge sent successfully for ${instance}:${jid} — ${valorFmt}`);

            try {
              await db.insert(sdrPixChargesTable).values({
                userId: agent.userId,
                agentId: agent.id,
                instance,
                jid,
                contactName: contactName ?? "",
                correlationId: corrID,
                valueCents,
                description: desc,
                status: "PENDING",
                brCode: pixCopiaECola ?? "",
                qrCodeImage: pixQrImage ?? "",
              });
            } catch (dbErr) {
              console.error(`[PIX] Failed to record charge in DB:`, String(dbErr));
            }
          } else {
            console.error(`[PIX] Gateway ${activeGateway} returned no PIX code for ${instance}:${jid}`);
          }
        }
      } catch (err) {
        console.error(`[PIX] Error generating ${activeGateway} charge for ${instance}:${jid}:`, String(err));
      }
    }
  }

  // 10c. Call scheduling — availability + conflict check + create room/appointment + send link
  if (callMatch && agent.callEnabled) {
    const dateStr = callMatch[1].trim();
    const scheduledAt = new Date(dateStr);
    if (!isNaN(scheduledAt.getTime())) {
      try {
        // Load availability settings for this user
        const [settingsRow] = await db.select()
          .from(callScheduleSettingsTable)
          .where(eq(callScheduleSettingsTable.userId, agent.userId))
          .limit(1);
        const avail = settingsRow
          ? JSON.parse(settingsRow.settings) as { days: number[]; startHour: number; endHour: number }
          : { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 };

        const dayOfWeek = scheduledAt.getDay();
        const hour = scheduledAt.getHours();
        const isAvailable = avail.days.includes(dayOfWeek)
          && hour >= avail.startHour
          && hour < avail.endHour;

        if (!isAvailable) {
          const unavailMsg = `⚠️ Esse horário está fora da minha disponibilidade. Por favor, escolha um horário entre ${avail.startHour}h e ${avail.endHour}h nos dias disponíveis.`;
          for (const candidate of sendCandidatesAi) {
            const ur = await evoFetch(`/message/sendText/${instance}`, {
              method: "POST",
              body: JSON.stringify({ number: candidate, textMessage: { text: unavailMsg } }),
            });
            if (ur.ok) break;
          }
          console.log(`[CALL] Slot outside availability for ${instance}:${jid} — ${dateStr}`);
        } else {
          // Conflict check: any appointment within ±30min?
          const winStart = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
          const winEnd   = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
          const conflicts = await db.select({ id: callAppointmentsTable.id })
            .from(callAppointmentsTable)
            .where(and(
              eq(callAppointmentsTable.userId, agent.userId),
              gte(callAppointmentsTable.scheduledAt, winStart),
              lte(callAppointmentsTable.scheduledAt, winEnd),
            ))
            .limit(1);

          if (conflicts.length > 0) {
            const conflictMsg = `⚠️ Já tenho um compromisso nesse horário. Por favor, escolha outro horário disponível.`;
            for (const candidate of sendCandidatesAi) {
              const cr2 = await evoFetch(`/message/sendText/${instance}`, {
                method: "POST",
                body: JSON.stringify({ number: candidate, textMessage: { text: conflictMsg } }),
              });
              if (cr2.ok) break;
            }
            console.log(`[CALL] Conflict detected for ${instance}:${jid} at ${dateStr}`);
          } else {
            const slug = Math.random().toString(36).slice(2, 10);
            const expiresAt = new Date(scheduledAt.getTime() + 7 * 24 * 60 * 60 * 1000);
            await db.insert(callRoomsTable).values({
              slug,
              title: `Call com ${contactName ?? "Lead"} — ${scheduledAt.toLocaleDateString("pt-BR")}`,
              createdBy: agent.userId,
              expiresAt,
            });
            await db.insert(callAppointmentsTable).values({
              userId: agent.userId,
              guestName: contactName ?? "Lead",
              guestPhone: contactPhoneClean ?? "",
              scheduledAt,
              durationMinutes: 60,
              notes: `Agendado via WhatsApp pelo agente ${agent.name}`,
              roomSlug: slug,
              source: "agent",
              instance,
              jid,
            });
            const callLink = `https://app.combozap.com/call/${slug}`;
            const dateFmt = scheduledAt.toLocaleString("pt-BR", {
              weekday: "long", day: "2-digit", month: "long",
              year: "numeric", hour: "2-digit", minute: "2-digit",
            });
            const confirmMsg = `📅 *Call agendada!*\n\n*Data:* ${dateFmt}\n\n🔗 *Link para entrar:*\n${callLink}\n\n_No horário combinado, clique no link acima para entrar na sala de vídeo._`;
            for (const candidate of sendCandidatesAi) {
              const cr = await evoFetch(`/message/sendText/${instance}`, {
                method: "POST",
                body: JSON.stringify({ number: candidate, textMessage: { text: confirmMsg } }),
              });
              if (cr.ok) { console.log(`[CALL] Room link sent for ${instance}:${jid} → ${callLink}`); break; }
            }
          }
        }
      } catch (err) {
        console.error(`[CALL] Error scheduling call for ${instance}:${jid}:`, String(err));
      }
    } else {
      console.warn(`[CALL] Invalid date in tag: "${callMatch[1]}" for ${instance}:${jid}`);
    }
  }

  // 10d. Cancel call — mark the appointment at the specified time as cancelled
  if (cancelMatch && agent.callEnabled) {
    const dateStr = cancelMatch[1].trim();
    const targetAt = new Date(dateStr);
    if (!isNaN(targetAt.getTime())) {
      try {
        const winStart = new Date(targetAt.getTime() - 30 * 60 * 1000);
        const winEnd   = new Date(targetAt.getTime() + 30 * 60 * 1000);
        await db.update(callAppointmentsTable)
          .set({ status: "cancelled" })
          .where(and(
            eq(callAppointmentsTable.userId, agent.userId),
            gte(callAppointmentsTable.scheduledAt, winStart),
            lte(callAppointmentsTable.scheduledAt, winEnd),
          ));
        console.log(`[CALL] Appointment cancelled for ${instance}:${jid} around ${dateStr}`);
      } catch (err) {
        console.error(`[CALL] Error cancelling appointment for ${instance}:${jid}:`, String(err));
      }
    }
  }

  // 11. Store AI reply in memory ONLY after confirmed send.
  //     This prevents the message from appearing in the Central when Evolution API rejected it.
  const sentTs = Math.floor(Date.now() / 1000);
  pushHistory(instance, jid, {
    id: `ai-${sentTs}-${Math.random().toString(36).slice(2)}`,
    fromMe: true,
    text: replyText.trim(),
    timestamp: sentTs,
    senderName: null,
  });
  const live = getLive(instance);
  const existing = live.get(jid);
  if (!existing || sentTs >= existing.ts) {
    addLiveEntry(instance, jid, { name: getCachedName(instance, jid), text: replyText.trim(), ts: sentTs, fromMe: true });
  }
}

// ── Webhook — receives events from Evolution API ──────────────────────────────
router.post("/sdr/webhook", async (req, res) => {
  // Respond immediately — never make Evolution API wait for AI processing
  res.json({ ok: true });

  // Guard: ignore oversized or structurally invalid payloads
  const body = req.body ?? {};
  if (typeof body !== "object" || Array.isArray(body)) return;

  const instance: string = String(body.instance ?? body.instanceName ?? "");
  const event: string = String(body.event ?? "");
  if (!instance || instance.length > 64) return;

  const clearedAt = chatClearedAt.get(instance) ?? 0;
  const live = getLive(instance);

  // Normalize event name: "MESSAGES_UPSERT" → "messages.upsert"
  const eventNorm = event.toLowerCase().replace(/_/g, ".");

  if (eventNorm === "messages.upsert") {
    const msgs: unknown[] = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];

    for (const msg of msgs) {
      if (!msg) continue;
      const m = msg as Record<string, unknown>;
      const key = m.key as Record<string, unknown>;
      const jid: string = String(key?.remoteJid ?? "");

      // Accept @s.whatsapp.net (legacy) and @lid (newer WhatsApp protocol) — skip groups/broadcast
      if (!jid || !isPersonJid(jid)) continue;

      const ts: number = Number(m.messageTimestamp ?? 0);
      if (ts <= clearedAt) continue;

      const fromMe: boolean = key?.fromMe === true;
      const msgId: string = String(key?.id ?? "");
      const text = extractText(m.message);
      const pushName = (m.pushName as string | undefined) ?? null;

      // Cache real contact name from webhook pushName (always accurate)
      if (!fromMe && pushName) cacheContactName(instance, jid, pushName);

      // Persist contact to DB — creates on first message, updates name + lastSeen on repeat
      if (!fromMe) {
        const resolvedRaw = jid.endsWith("@lid")
          ? lidPhoneCache.get(`${instance}:${jid}`) ?? null
          : jidToPhone(jid);
        // Use "" for unresolved @lid — never store the internal hash as phone
        const phone = resolvedRaw
          ? (resolvedRaw.startsWith("+") ? resolvedRaw : `+${resolvedRaw}`)
          : "";
        const now = new Date();
        getInstanceUserId(instance).then(async uid => {
          if (uid == null) return;
          const updateSet: Partial<typeof sdrContactsTable.$inferInsert> = { lastSeenAt: now };
          if (pushName) updateSet.name = pushName;
          if (phone) updateSet.phone = phone; // only update phone when we have a real number
          const result = await db.insert(sdrContactsTable).values({
            userId: uid, instanceName: instance, jid,
            name: pushName ?? null, phone, firstSeenAt: now, lastSeenAt: now,
          }).onConflictDoUpdate({
            target: [sdrContactsTable.userId, sdrContactsTable.instanceName, sdrContactsTable.jid],
            set: updateSet,
          }).returning({ id: sdrContactsTable.id, avatarUrl: sdrContactsTable.avatarUrl });
          // Fetch avatar in background only on first seen (no avatarUrl yet)
          const row = result[0];
          if (row && !row.avatarUrl) {
            fetchAndStoreAvatar(instance, jid, uid).catch(() => {});
          }
        }).catch(() => {});
      }

      // @lid contacts: try to extract real phone from webhook fields, then update DB
      if (!fromMe && jid.endsWith("@lid")) {
        const cacheKey = `${instance}:${jid}`;
        const candidateFields = [m.sender, m.participant, m.senderPn, m.actualJid];
        const realJid = candidateFields
          .map(f => String(f ?? ""))
          .find(f => f.endsWith("@s.whatsapp.net") || f.endsWith("@c.us"));
        if (realJid && !lidPhoneCache.has(cacheKey)) {
          const resolvedPhone = jidToPhone(realJid);
          lidPhoneCache.set(cacheKey, resolvedPhone);
          console.log(`[lid-webhook] ${jid} → ${resolvedPhone} (from webhook field)`);
          // Backfill the real phone into DB immediately
          getInstanceUserId(instance).then(uid => {
            if (!uid) return;
            const formattedPhone = resolvedPhone.startsWith("+") ? resolvedPhone : `+${resolvedPhone}`;
            return db.update(sdrContactsTable)
              .set({ phone: formattedPhone })
              .where(and(
                eq(sdrContactsTable.userId, uid),
                eq(sdrContactsTable.instanceName, instance),
                eq(sdrContactsTable.jid, jid),
              ));
          }).catch(() => {});
        }
        if (!lidPhoneCache.has(cacheKey)) {
          console.log(`[lid-debug] @lid ${jid} — raw fields:`, JSON.stringify({
            key, pushName, sender: m.sender, participant: m.participant,
            senderPn: m.senderPn, actualJid: m.actualJid, source: m.source,
          }).slice(0, 500));
          // Resolve in background — when done, backfill phone in DB
          resolveLidPhone(instance, jid).then(resolved => {
            if (!resolved) return;
            const formattedPhone = resolved.startsWith("+") ? resolved : `+${resolved}`;
            return getInstanceUserId(instance).then(uid => {
              if (!uid) return;
              return db.update(sdrContactsTable)
                .set({ phone: formattedPhone })
                .where(and(
                  eq(sdrContactsTable.userId, uid),
                  eq(sdrContactsTable.instanceName, instance),
                  eq(sdrContactsTable.jid, jid),
                ));
            });
          }).catch(() => {});
        }
      }

      // Update live chat snapshot (most recent message per JID, for chat list)
      const existing = live.get(jid);
      const name = (!fromMe ? pushName : null) ?? getCachedName(instance, jid);
      if (!existing || ts >= existing.ts) {
        addLiveEntry(instance, jid, { name, text, ts, fromMe });
      }

      // ── Detect and fetch media (images, audio, stickers) ────────────────────
      const mediaType = detectMediaType(m.message) ?? undefined;
      let mediaData: string | undefined;
      let mediaMime: string | undefined;
      let mediaName: string | undefined;

      if (mediaType === "image" || mediaType === "audio" || mediaType === "sticker") {
        // Fetch base64 synchronously here — res was already sent, so it's safe to await
        const media = await fetchMediaBase64(instance, m as Record<string, unknown>);
        if (media) { mediaData = media.base64; mediaMime = media.mimetype; }
      }
      if (mediaType === "document") {
        const doc = (m.message as Record<string, unknown>)?.documentMessage as Record<string, unknown> | undefined;
        mediaName = String(doc?.fileName ?? doc?.title ?? "documento");
      }

      const displayText = text || (mediaType ? `[${mediaType === "audio" ? "áudio" : mediaType === "image" ? "imagem" : mediaType === "video" ? "vídeo" : mediaType === "sticker" ? "figurinha" : "arquivo"}]` : "[mídia]");

      // Append to per-JID message history (source of truth for chat panel)
      pushHistory(instance, jid, {
        id: msgId || `wh-${ts}-${jid}`,
        fromMe,
        text: displayText,
        timestamp: ts,
        senderName: fromMe ? null : (pushName ?? getCachedName(instance, jid)),
        mediaType,
        mediaData,
        mediaMime,
        mediaName,
      });

      // AI reply on inbound messages
      if (!fromMe && text && msgId) {
        tryAiReply(instance, msgId, jid, text);
      }

      // Cancel pending follow-ups the moment contact replies
      if (!fromMe) {
        db.update(sdrFollowupQueueTable)
          .set({ cancelledAt: new Date(), cancelReason: "contact_replied" })
          .where(and(
            eq(sdrFollowupQueueTable.instanceName, instance),
            eq(sdrFollowupQueueTable.jid, jid),
            isNull(sdrFollowupQueueTable.sentAt),
            isNull(sdrFollowupQueueTable.cancelledAt),
          ))
          .catch(() => {});
      }
    }
  }

  if (eventNorm === "connection.update") {
    const data = body.data as Record<string, unknown>;
    const inner = data?.instance as Record<string, unknown> | undefined;
    const state = String(data?.state ?? inner?.state ?? "");

    if (state === "open") {
      // Successfully connected / reconnected — cancel any pending reconnect timers
      const timer = reconnectTimers.get(instance);
      if (timer) { clearTimeout(timer); reconnectTimers.delete(instance); }
      reconnectAttempts.delete(instance);
      console.log(`[connection] ${instance}: connected`);
    } else {
      // Disconnected or connecting — clear stale phone cache
      instancePhoneCache.delete(instance);
      // Only auto-reconnect for definitive "close" / "refused" states, not transient "connecting"
      if (state === "close" || state === "refused" || state === "disconnected") {
        console.log(`[connection] ${instance}: ${state} — scheduling auto-reconnect`);
        scheduleReconnect(instance);
      }
    }
  }
});

// ── WhatsApp connection management ────────────────────────────────────────────

/** Resolve the public domain for webhook registration.
 *  Priority: APP_DOMAIN env var → REPLIT_DOMAINS (dev) → volatusnet.com (prod fallback) */
function resolveAppDomain(): string {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN;
  const replitDomain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  return replitDomain || "volatusnet.com";
}

/** Normalize an Evolution API base64 QR to a proper data URI */
function normalizeQrBase64(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (!s) return null;
  return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
}

router.post("/sdr/whatsapp/connect", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);

  const planCheck = await requireActivePlan(userId, slot);
  if (!planCheck.ok) { res.status(403).json({ error: planCheck.error }); return; }

  const name = instanceName(userId, slot);

  // Already connected → refresh mapping and return immediately
  const current = await fetchInstanceState(name);
  if (current.connected) {
    await db.insert(sdrInstanceMapTable).values({ instanceName: name, userId, slotNumber: slot })
      .onConflictDoUpdate({ target: sdrInstanceMapTable.instanceName, set: { userId, slotNumber: slot } });
    res.json({ instanceName: name, connected: true, phone: current.phone });
    return;
  }

  // Only create the instance if it doesn't already exist in Evolution API
  let _createQrcode: string | null = null;
  let _createQrCode: string | null = null;
  const stateCheck = await evoFetch(`/instance/connectionState/${name}`);
  if (!stateCheck.ok) {
    const createRes = await evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: name,
        qrcode: true,
        syncFullHistory: false,
        rejectCall: false,
        groupsIgnore: true,
      }),
    });
    // v1.x returns QR immediately in the create response
    if (createRes.ok) {
      const createData = createRes.data as Record<string, unknown>;
      const createQr = createData.qrcode as Record<string, unknown> | undefined;
      if (createQr?.base64) {
        _createQrcode = normalizeQrBase64(createQr.base64);
        _createQrCode = String(createQr.code ?? "");
      }
    }
  }

  // Save mapping so webhook can resolve user/slot from instance name
  await db.insert(sdrInstanceMapTable).values({ instanceName: name, userId, slotNumber: slot })
    .onConflictDoUpdate({ target: sdrInstanceMapTable.instanceName, set: { userId, slotNumber: slot } });

  // Start fresh — any chat synced before this QR scan is hidden; only new msgs appear
  chatClearedAt.set(name, Math.floor(Date.now() / 1000));
  getLive(name).clear();
  saveClearedAt().catch(() => {});
  clearHistoryInDb(name).catch(() => {}); // wipe DB history so old chats don't bleed into new session

  // Always configure webhook — works in both dev (Replit) and production (VPS)
  const domain = resolveAppDomain();
  await evoFetch(`/webhook/set/${name}`, {
    method: "POST",
    body: JSON.stringify({
      url: `https://${domain}/api/sdr/webhook`,
      enabled: true,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      webhookByEvents: false,
      webhookBase64: false,
    }),
  });

  // If QR already came from the create response (v1 behaviour), use it directly
  let qrcode: string | null = _createQrcode ?? null;
  let qrCode: string | null = _createQrCode ?? null;

  // Fallback: poll /instance/connect (needed when instance already existed pre-create)
  if (!qrcode) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, attempt === 0 ? 1000 : 2000));
      // Check if already connected (e.g. restored session)
      const rechk = await fetchInstanceState(name);
      if (rechk.connected) {
        res.json({ instanceName: name, connected: true, phone: rechk.phone });
        return;
      }
      const qr = await evoFetch(`/instance/connect/${name}`);
      if (qr.ok) {
        const qrData = qr.data as Record<string, unknown>;
        const raw = normalizeQrBase64(qrData.base64);
        if (raw) { qrcode = raw; qrCode = String(qrData.code ?? ""); break; }
      }
    }
  }

  if (!qrcode) {
    const rechk = await fetchInstanceState(name);
    if (rechk.connected) {
      res.json({ instanceName: name, connected: true, phone: rechk.phone });
      return;
    }
    res.status(502).json({ error: "QR não disponível. Aguarde alguns segundos e tente novamente." });
    return;
  }

  res.json({ instanceName: name, connected: false, qrcode, code: qrCode });
});

router.get("/sdr/whatsapp/instances", requireAuth, (req, res) => {
  const userId = req.session.userId!;
  const instances: Record<number, string> = {};
  for (let slot = 1; slot <= 5; slot++) instances[slot] = instanceName(userId, slot);
  res.json({ instances });
});

router.get("/sdr/whatsapp/status", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);

  const ck = `status:${name}`;
  const hit = rcGet<{ connected: boolean; instanceName: string; phone: unknown }>(ck);
  if (hit) { res.json(hit); return; }

  const state = await fetchInstanceState(name);
  if (state.connected) {
    await db.insert(sdrInstanceMapTable).values({ instanceName: name, userId, slotNumber: slot })
      .onConflictDoUpdate({ target: sdrInstanceMapTable.instanceName, set: { userId, slotNumber: slot } });
  }
  const result = { connected: state.connected, instanceName: name, phone: state.phone };
  rcSet(ck, result, 8_000); // 8s TTL — status rarely flips in < 8s
  res.json(result);
});

router.get("/sdr/whatsapp/qr", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);

  const planCheck = await requireActivePlan(userId, slot);
  if (!planCheck.ok) { res.status(403).json({ error: planCheck.error }); return; }

  const name = instanceName(userId, slot);

  // Guard: never generate a new QR while the instance is already connected — would disconnect the active session
  const state = await fetchInstanceState(name);
  if (state.connected) {
    res.json({ connected: true, phone: state.phone });
    return;
  }

  const qr = await evoFetch(`/instance/connect/${name}`);
  if (!qr.ok) { res.status(502).json({ error: "QR não disponível" }); return; }

  // Auto-clear central when user generates a new QR — fresh start from this point
  const now = Math.floor(Date.now() / 1000);
  chatClearedAt.set(name, now);
  getLive(name).clear();
  saveClearedAt().catch(() => {});

  const qrData = qr.data as Record<string, unknown>;
  res.json({ qrcode: normalizeQrBase64(qrData.base64), code: qrData.code ?? null });
});

router.delete("/sdr/whatsapp/disconnect", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);
  await evoFetch(`/instance/logout/${name}`, { method: "DELETE" });
  res.json({ ok: true });
});

router.delete("/sdr/whatsapp/clearHistory", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);
  chatClearedAt.set(name, Math.floor(Date.now() / 1000));
  clearHistory(name);
  saveClearedAt().catch(() => {});
  clearHistoryInDb(name).catch(() => {}); // also wipe from DB
  res.json({ ok: true, clearedAt: chatClearedAt.get(name) });
});

// ── Chat list — real contact names, merged from multiple sources ──────────────
router.get("/sdr/chats", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);
  const clearedAt = chatClearedAt.get(name) ?? 0;

  // Serve from cache when available — EvoAPI /chat/findChats is the slowest call
  const chatCk = `chats:${name}`;
  const chatHit = rcGet<{ chats: unknown[] }>(chatCk);
  if (chatHit) { res.setHeader("Cache-Control", "no-store"); res.json(chatHit); return; }

  // Primary: Evolution API — always fresh
  const result = await evoFetch(`/chat/findChats/${name}`);

  /** Normalise Evolution API response into a flat array regardless of version shape */
  function extractChatArray(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      // Some versions: { data: [...] } or { chats: [...] } or { records: [...] }
      for (const key of ["data", "chats", "records", "items"]) {
        if (Array.isArray(d[key])) return d[key] as unknown[];
      }
    }
    return [];
  }

  const rawChats = extractChatArray(result.data);

  if (result.ok && rawChats.length >= 0) {
    // Also try to pre-load contacts for name enrichment (best-effort, parallel)
    evoFetch(`/chat/findContacts/${name}`).then(cr => {
      const contacts = extractChatArray(cr.data);
      for (const c of contacts) {
        const contact = c as Record<string, unknown>;
        const cJid = String(contact.id ?? contact.remoteJid ?? "");
        if (isPersonJid(cJid)) {
          cacheContactName(name, cJid, extractName(contact));
        }
      }
    }).catch(() => {});

    const raw = rawChats;
    const live = getLive(name);

    const chatMap = new Map<string, { jid: string; name: string | null; phone: string; unread: number; lastMessage: string; lastTimestamp: number }>();

    for (const c of raw) {
      const chat = c as Record<string, unknown>;
      // Support multiple JID field names across Evolution API versions
      const jid = String(chat.id ?? chat.remoteJid ?? (chat.key as Record<string,unknown>)?.remoteJid ?? "");
      if (!jid || !isPersonJid(jid)) continue;

      const lastMsg = chat.lastMessage as Record<string, unknown> | null;
      // Evolution API v1.8.x stores the last message timestamp as "lastMsgTimestamp"
      // at the chat level (not inside lastMessage). Fall back chain covers all versions.
      const ts: number =
        (lastMsg?.messageTimestamp as number) ??
        (chat.lastMsgTimestamp as number) ??
        (chat.timestamp as number) ??
        (chat.updatedAt ? Math.floor(new Date(String(chat.updatedAt)).getTime() / 1000) : 0);

      // Hide pure contacts with no message history at all (ts=0) — unless a live
      // webhook entry just arrived for them (new message on a first-ever conversation).
      if (ts === 0) {
        if (!live.has(jid)) continue;
      }

      const apiName = extractName(chat);
      const cachedName = getCachedName(name, jid);
      const liveEntry = live.get(jid);
      const resolvedName = apiName ?? cachedName ?? liveEntry?.name ?? null;
      if (resolvedName) cacheContactName(name, jid, resolvedName);

      const liveTs = liveEntry?.ts ?? 0;
      const effectiveTs = Math.max(ts, liveTs);
      const effectiveMsg = liveTs > ts
        ? (liveEntry?.text ?? "")
        : (extractText(lastMsg?.message) || String(lastMsg?.conversation ?? "") || "");

      // Skip "ghost" contacts: Evolution API dumps the full WhatsApp history on
      // first connection. Any chat with no readable last message text AND no
      // live webhook event is just an address-book import with no real conversation.
      if (!effectiveMsg && !liveEntry) continue;

      chatMap.set(jid, {
        jid,
        name: resolvedName,
        phone: resolvePhone(name, jid),
        unread: (chat.unreadCount as number) ?? 0,
        lastMessage: effectiveMsg,
        lastTimestamp: effectiveTs,
      });
    }

    // Merge webhook-only chats that Evolution API didn't return yet
    for (const [jid, e] of live.entries()) {
      if (!isPersonJid(jid)) continue;
      if (clearedAt > 0 && e.ts > 0 && e.ts < clearedAt) continue;
      if (!chatMap.has(jid)) {
        chatMap.set(jid, {
          jid,
          name: e.name ?? getCachedName(name, jid),
          phone: resolvePhone(name, jid),
          unread: 0,
          lastMessage: e.text,
          lastTimestamp: e.ts,
        });
      }
    }

    const chats = Array.from(chatMap.values())
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    rcSet(chatCk, { chats }, 10_000); // 10s TTL — poll is 20s; saves ~2 Evo API calls per poll cycle
    res.setHeader("Cache-Control", "no-store");
    res.json({ chats });
    return;
  }

  // Fallback: in-memory live map (populated by webhook)
  const liveFallback = getLive(name);
  const chats = Array.from(liveFallback.entries())
    .filter(([, e]) => clearedAt === 0 || e.ts >= clearedAt)
    .map(([jid, e]) => ({
      jid,
      name: e.name ?? getCachedName(name, jid),
      phone: resolvePhone(name, jid),
      unread: 0,
      lastMessage: e.text,
      lastTimestamp: e.ts,
    }))
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  res.setHeader("Cache-Control", "no-store");
  res.json({ chats });
});

// ── Messages for a specific conversation ─────────────────────────────────────
router.get("/sdr/messages", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);
  const { jid, count = "60" } = req.query as Record<string, string>;
  if (!jid) { res.status(400).json({ error: "jid obrigatório" }); return; }
  const countNum = Math.min(Math.max(parseInt(count, 10) || 60, 1), 200);

  // Primary source: DB (survives server restarts and relogs)
  let dbMessages: HistoryMsg[] = [];
  try {
    const dbRows = await db.select()
      .from(sdrMessagesTable)
      .where(and(
        eq(sdrMessagesTable.userId, userId),
        eq(sdrMessagesTable.slotNumber, slot),
        eq(sdrMessagesTable.jid, jid),
      ))
      .orderBy(desc(sdrMessagesTable.timestamp))
      .limit(countNum);

    dbMessages = dbRows.reverse().map(r => ({
      id: r.messageId, fromMe: r.fromMe, text: r.text, timestamp: r.timestamp,
      senderName: null,
      mediaType: r.mediaType ?? undefined,
      mediaData: r.mediaUrl ? undefined : (r.mediaData ?? undefined),
      mediaMime: r.mediaMime ?? undefined,
      mediaName: r.mediaName ?? undefined,
      mediaUrl: r.mediaUrl ?? undefined,
    }));
  } catch { /* DB unavailable — fall back to memory only */ }

  // Supplement with in-memory history (includes messages not yet flushed to DB)
  const memMsgs = getHistory(name, jid);

  // Merge: DB + memory, dedup by message id, memory wins (more up-to-date)
  const merged = new Map<string, HistoryMsg>();
  for (const m of dbMessages) merged.set(m.id, m);
  for (const m of memMsgs) merged.set(m.id, m);

  const messages = Array.from(merged.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-countNum);

  res.setHeader("Cache-Control", "no-store");
  res.json({ messages });
});

// ── Persistent chat list (DB-backed, for instant load on relogin/restart) ────
// ── GET /sdr/contact-pic — fetch WhatsApp profile picture URL ─────────────────
router.get("/sdr/contact-pic", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = Number(req.query.slot ?? 1);
  const jid  = String(req.query.jid ?? "").trim();
  if (!jid) { res.status(400).json({ url: null }); return; }

  const instance = instanceName(userId, slot);
  const isLid = jid.endsWith("@lid");
  const num = jid.replace("@s.whatsapp.net", "").replace("@g.us", "").replace("@lid", "");

  function extractPicUrl(data: unknown): string | null {
    if (typeof data === "string" && data.startsWith("http")) return data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      return (d.profilePictureUrl ?? d.picture ?? d.url ?? d.imgUrl ?? null) as string | null;
    }
    return null;
  }

  let url: string | null = null;

  // @lid contacts: Evolution API não resolve pelo número — vai direto para fetchProfile com o JID completo
  if (!isLid) {
    const r = await evoFetch(`/chat/fetchProfilePictureUrl/${instance}`, {
      method: "POST",
      body: JSON.stringify({ number: num }),
      signal: AbortSignal.timeout(5_000) as RequestInit["signal"],
    }).catch(() => null);
    if (r?.ok) url = extractPicUrl(r.data);
  }

  // Fallback (sempre para @lid, ou quando fetchProfilePictureUrl não retornou)
  if (!url) {
    // Para @lid usa o JID completo (ex: 166954723758123@lid) — Evolution API entende
    const profileNumber = isLid ? jid : num;
    const fp = await evoFetch(`/chat/fetchProfile/${instance}`, {
      method: "POST",
      body: JSON.stringify({ number: profileNumber }),
      signal: AbortSignal.timeout(6_000) as RequestInit["signal"],
    }).catch(() => null);
    if (fp?.ok) url = extractPicUrl(fp.data);
  }

  res.json({ url: url || null });
});

router.get("/sdr/db-chats", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  try {
    const rows = (await db.select()
      .from(sdrChatsTable)
      .where(and(eq(sdrChatsTable.userId, userId), eq(sdrChatsTable.slotNumber, slot)))
      .orderBy(desc(sdrChatsTable.lastTimestamp))
      .limit(500)).filter(r => isPersonJid(r.jid));
    const chats = rows.map(r => ({
      jid: r.jid, name: r.name, phone: r.phone,
      unread: r.unread, lastMessage: r.lastMessage, lastTimestamp: r.lastTimestamp,
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({ chats });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.json({ chats: [] });
  }
});

// ── DDD → Estado (Brasil) ─────────────────────────────────────────────────────
const DDD_ESTADO: Record<string, string> = {
  "11":"SP","12":"SP","13":"SP","14":"SP","15":"SP","16":"SP","17":"SP","18":"SP","19":"SP",
  "21":"RJ","22":"RJ","24":"RJ",
  "27":"ES","28":"ES",
  "31":"MG","32":"MG","33":"MG","34":"MG","35":"MG","37":"MG","38":"MG",
  "41":"PR","42":"PR","43":"PR","44":"PR","45":"PR","46":"PR",
  "47":"SC","48":"SC","49":"SC",
  "51":"RS","53":"RS","54":"RS","55":"RS",
  "61":"DF","62":"GO","63":"TO","64":"GO",
  "65":"MT","66":"MT","67":"MS","68":"AC","69":"RO",
  "71":"BA","73":"BA","74":"BA","75":"BA","77":"BA","79":"SE",
  "81":"PE","82":"AL","83":"PB","84":"RN","85":"CE","86":"PI","87":"PE","88":"CE","89":"PI",
  "91":"PA","92":"AM","93":"PA","94":"PA","95":"RR","96":"AP","97":"AM","98":"MA","99":"MA",
};
function dddToEstado(ddd: string): string { return DDD_ESTADO[ddd] ?? `(${ddd})`; }

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get("/sdr/stats", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const period = String(req.query.period ?? "24h") as "24h" | "7d" | "30d";

  const now = Math.floor(Date.now() / 1000);
  const periodSecs = period === "24h" ? 86_400 : period === "7d" ? 7 * 86_400 : 30 * 86_400;
  const cutoff = now - periodSecs;
  const todayCutoff = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  try {
  // ── Pull messages from DB (persistent, survives restarts) ─────────────────
  const msgs = await db.select()
    .from(sdrMessagesTable)
    .where(and(
      eq(sdrMessagesTable.userId, userId),
      eq(sdrMessagesTable.slotNumber, slot),
      gte(sdrMessagesTable.timestamp, cutoff),
    ));

  let totalReceived = 0, totalSent = 0;
  const hourlyBuckets: Record<number, number> = {};
  const dailyBuckets: Record<string, { recv: number; sent: number }> = {};
  const jidSet = new Set<string>();
  const newContactJids = new Set<string>();
  const msgsByJid = new Map<string, typeof msgs>();

  for (const m of msgs) {
    if (m.fromMe) { totalSent++; }
    else {
      totalReceived++;
      if (!m.fromMe && m.timestamp >= todayCutoff) newContactJids.add(m.jid);
      if (period === "24h") {
        const h = Math.floor(m.timestamp / 3600);
        hourlyBuckets[h] = (hourlyBuckets[h] ?? 0) + 1;
      }
    }
    // Daily buckets for 7d/30d (both directions)
    if (period !== "24h") {
      const d = new Date(m.timestamp * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!dailyBuckets[key]) dailyBuckets[key] = { recv: 0, sent: 0 };
      if (m.fromMe) dailyBuckets[key].sent++; else dailyBuckets[key].recv++;
    }
    jidSet.add(m.jid);
    const arr = msgsByJid.get(m.jid);
    if (arr) arr.push(m); else msgsByJid.set(m.jid, [m]);
  }

  // ── Response times ────────────────────────────────────────────────────────
  const responseTimes: number[] = [];
  for (const [, jidMsgs] of msgsByJid) {
    const sorted = [...jidMsgs].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (!sorted[i].fromMe && sorted[i + 1].fromMe) {
        const diff = sorted[i + 1].timestamp - sorted[i].timestamp;
        if (diff > 0 && diff < 3600) responseTimes.push(diff);
      }
    }
  }
  const avgResponseSeconds = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  const responseDist = [
    { label: "< 1 min", count: 0 }, { label: "1–5 min", count: 0 },
    { label: "5–15 min", count: 0 }, { label: "15–60 min", count: 0 }, { label: "> 1h", count: 0 },
  ];
  for (const t of responseTimes) {
    if (t < 60) responseDist[0].count++;
    else if (t < 300) responseDist[1].count++;
    else if (t < 900) responseDist[2].count++;
    else if (t < 3600) responseDist[3].count++;
    else responseDist[4].count++;
  }

  // ── Time series ───────────────────────────────────────────────────────────
  let timeSeries: { label: string; recv: number; sent: number }[];
  if (period === "24h") {
    timeSeries = [];
    for (let i = 23; i >= 0; i--) {
      const h = Math.floor((now - i * 3600) / 3600);
      const d = new Date(h * 3600 * 1000);
      timeSeries.push({ label: `${String(d.getHours()).padStart(2, "0")}h`, recv: hourlyBuckets[h] ?? 0, sent: 0 });
    }
  } else {
    const days = period === "7d" ? 7 : 30;
    timeSeries = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const bkt = dailyBuckets[key] ?? { recv: 0, sent: 0 };
      timeSeries.push({
        label: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`,
        recv: bkt.recv, sent: bkt.sent,
      });
    }
  }

  // ── DDD / Estado from chats ───────────────────────────────────────────────
  const allChats = await db
    .select({ phone: sdrChatsTable.phone })
    .from(sdrChatsTable)
    .where(and(eq(sdrChatsTable.userId, userId), eq(sdrChatsTable.slotNumber, slot)));

  const dddCount: Record<string, number> = {};
  for (const c of allChats) {
    const raw = c.phone.replace(/^\+/, "");
    if (raw.startsWith("55") && raw.length >= 4) {
      const ddd = raw.substring(2, 4);
      if (/^\d{2}$/.test(ddd)) dddCount[ddd] = (dddCount[ddd] ?? 0) + 1;
    }
  }
  const topDdds = Object.entries(dddCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ddd, count]) => ({ ddd, estado: dddToEstado(ddd), count }));

  res.setHeader("Cache-Control", "no-store");
  res.json({
    period,
    totalReceived,
    totalSent,
    totalContacts: jidSet.size,
    newContactsToday: newContactJids.size,
    avgResponseSeconds,
    timeSeries,
    topDdds,
    responseDist,
    // backward compat
    hourly: timeSeries.map(t => ({ label: t.label, count: t.recv })),
  });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      period, totalReceived: 0, totalSent: 0, totalContacts: 0,
      newContactsToday: 0, avgResponseSeconds: null,
      timeSeries: [], topDdds: [], responseDist: [], hourly: [],
    });
  }
});

// ── Send a message ────────────────────────────────────────────────────────────
// ── AI pause por conversa ─────────────────────────────────────────────────────

router.get("/sdr/ai-pause", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const rows = await db.select({ jid: sdrAiPausedTable.jid })
    .from(sdrAiPausedTable)
    .where(and(eq(sdrAiPausedTable.userId, userId), eq(sdrAiPausedTable.slotNumber, slot)));
  const paused: Record<string, true> = {};
  for (const r of rows) paused[r.jid] = true;
  res.json({ paused });
});

router.put("/sdr/ai-pause", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { jid, slot: rawSlot, paused } = req.body as { jid: string; slot: unknown; paused: boolean };
  const slot = typeof rawSlot === "number" ? rawSlot : 1;
  if (!jid) { res.status(400).json({ error: "jid obrigatório" }); return; }
  if (paused) {
    await db.insert(sdrAiPausedTable)
      .values({ userId, slotNumber: slot, jid })
      .onConflictDoNothing();
  } else {
    await db.delete(sdrAiPausedTable)
      .where(and(eq(sdrAiPausedTable.userId, userId), eq(sdrAiPausedTable.slotNumber, slot), eq(sdrAiPausedTable.jid, jid)));
  }
  res.json({ ok: true, jid, paused });
});

router.post("/sdr/send", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);
  const { jid, text } = req.body as { jid: string; text: string };
  if (!jid || !text?.trim()) { res.status(400).json({ error: "jid e text obrigatórios" }); return; }

  // @lid JIDs: try sending with the @lid JID directly first (Baileys handles it natively).
  // Fallback: resolve to phone and try phone@s.whatsapp.net + bare phone.
  // @s.whatsapp.net: full JID first (bypasses existence check), bare phone as fallback.
  let sendCandidates: string[];
  if (jid.endsWith("@lid")) {
    sendCandidates = [jid];
    const resolved = await resolveLidPhone(name, jid).catch(() => null);
    if (resolved) {
      const phone = resolved.replace(/@.*/, "");
      sendCandidates.push(`${phone}@s.whatsapp.net`, phone);
    }
    console.log(`[send] @lid candidates: ${sendCandidates.join(", ")}`);
  } else {
    sendCandidates = buildSendCandidates(jid);
  }

  let sendResult: { ok: boolean; status: number; data: unknown } | null = null;
  for (const number of sendCandidates) {
    sendResult = await evoFetch(`/message/sendText/${name}`, {
      method: "POST",
      body: JSON.stringify({ number, textMessage: { text: text.trim() } }),
    });
    console.log(`[send] slot=${slot} → ${number}: ${sendResult.status}`, JSON.stringify(sendResult.data).slice(0, 120));
    if (sendResult.ok) break;
  }
  if (!sendResult?.ok) {
    res.status(502).json({ error: "Erro ao enviar mensagem", detail: sendResult?.data });
    return;
  }

  // Store sent message in memory so it appears immediately in the chat panel
  const sentTs = Math.floor(Date.now() / 1000);
  pushHistory(name, jid, {
    id: `sent-${sentTs}-${Math.random().toString(36).slice(2)}`,
    fromMe: true,
    text: text.trim(),
    timestamp: sentTs,
    senderName: null,
  });

  res.json({ ok: true });
});

// ── Contacts ──────────────────────────────────────────────────────────────────
router.get("/sdr/contacts", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);

  const ck = `contacts:${name}`;
  const hit = rcGet<{ contacts: unknown[] }>(ck);
  if (hit) { res.json(hit); return; }

  try {
    const rows = await db.select()
      .from(sdrContactsTable)
      .where(and(eq(sdrContactsTable.userId, userId), eq(sdrContactsTable.instanceName, name)))
      .orderBy(desc(sdrContactsTable.lastSeenAt));

    const result = {
      contacts: rows.map(r => ({
        jid: r.jid, name: r.name, phone: r.phone,
        firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt,
      })),
    };
    rcSet(ck, result, 15_000);
    res.json(result);
  } catch {
    res.json({ contacts: [] });
  }
});

router.get("/sdr/contacts/export.csv", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const slot = getSlot(req.query as Record<string, unknown>);
  const name = instanceName(userId, slot);

  try {
    const rows = await db.select()
      .from(sdrContactsTable)
      .where(and(eq(sdrContactsTable.userId, userId), eq(sdrContactsTable.instanceName, name)))
      .orderBy(desc(sdrContactsTable.lastSeenAt));

    const esc = (s: string | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "Nome,Numero,WhatsApp_JID,Primeira_Mensagem,Ultima_Mensagem",
      ...rows.map(r => [
        esc(r.name), esc(r.phone), esc(r.jid),
        esc(r.firstSeenAt.toLocaleString("pt-BR")),
        esc(r.lastSeenAt.toLocaleString("pt-BR")),
      ].join(",")),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="contatos-slot${slot}.csv"`);
    res.send("\uFEFF" + lines.join("\r\n"));
  } catch {
    res.status(503).json({ error: "Falha temporária ao exportar contatos. Tente novamente." });
  }
});

// ── Tags ──────────────────────────────────────────────────────────────────────
router.get("/sdr/tags", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ck = `tags:${userId}`;
  const hit = rcGet<{ tags: unknown[] }>(ck);
  if (hit) { res.json(hit); return; }
  try {
    const tags = await db.select().from(sdrTagsTable).where(eq(sdrTagsTable.userId, userId));
    const result = { tags: tags.map(t => ({ id: String(t.id), name: t.name, desc: t.desc })) };
    rcSet(ck, result, 30_000);
    res.json(result);
  } catch {
    res.json({ tags: [] });
  }
});

router.post("/sdr/tags", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { name, desc } = req.body as { name: string; desc?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Nome da tag obrigatório" }); return; }
  try {
    const [tag] = await db.insert(sdrTagsTable).values({
      userId, name: name.trim(), desc: desc?.trim() ?? "",
    }).returning();
    rcDel(`tags:${userId}`);
    res.json({ tag: { id: String(tag.id), name: tag.name, desc: tag.desc } });
  } catch {
    res.status(503).json({ error: "Falha temporária ao criar tag. Tente novamente." });
  }
});

router.delete("/sdr/tags/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(sdrTagsTable).where(and(eq(sdrTagsTable.id, id), eq(sdrTagsTable.userId, userId)));
    rcDel(`tags:${userId}`); rcDel(`bulk-tags:${userId}`);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Falha temporária ao excluir tag. Tente novamente." });
  }
});

// ── Contact ↔ Tag associations ────────────────────────────────────────────────

/** Get all tags assigned to a specific JID */
router.get("/sdr/contact-tags", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const jid = String(req.query.jid ?? "");
  if (!jid) { res.status(400).json({ error: "jid obrigatório" }); return; }
  try {
    const rows = await db
      .select({ id: sdrTagsTable.id, name: sdrTagsTable.name, desc: sdrTagsTable.desc })
      .from(sdrContactTagsTable)
      .innerJoin(sdrTagsTable, eq(sdrContactTagsTable.tagId, sdrTagsTable.id))
      .where(and(eq(sdrContactTagsTable.userId, userId), eq(sdrContactTagsTable.jid, jid)));
    res.json({ tags: rows.map(t => ({ id: String(t.id), name: t.name, desc: t.desc })) });
  } catch {
    res.json({ tags: [] }); // falha silenciosa — tags simplesmente aparecem vazias
  }
});

/** Bulk: all contact→tag mappings for this user, keyed by JID */
router.get("/sdr/contact-tags/bulk", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const bck = `bulk-tags:${userId}`;
  const bhit = rcGet<{ contactTags: unknown }>(bck);
  if (bhit) { res.json(bhit); return; }
  try {
    const rows = await db
      .select({ jid: sdrContactTagsTable.jid, tagId: sdrTagsTable.id, tagName: sdrTagsTable.name })
      .from(sdrContactTagsTable)
      .innerJoin(sdrTagsTable, eq(sdrContactTagsTable.tagId, sdrTagsTable.id))
      .where(eq(sdrContactTagsTable.userId, userId));
    const contactTags: Record<string, { id: string; name: string }[]> = {};
    for (const r of rows) {
      if (!contactTags[r.jid]) contactTags[r.jid] = [];
      contactTags[r.jid].push({ id: String(r.tagId), name: r.tagName });
    }
    const bresult = { contactTags };
    rcSet(bck, bresult, 15_000);
    res.json(bresult);
  } catch {
    res.json({ contactTags: {} });
  }
});

/** Assign a tag to a contact JID */
router.post("/sdr/contact-tags", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { jid, tagId } = req.body as { jid: string; tagId: string | number };
  const tid = parseInt(String(tagId), 10);
  if (!jid || isNaN(tid)) { res.status(400).json({ error: "jid e tagId obrigatórios" }); return; }
  try {
    const [tag] = await db.select().from(sdrTagsTable)
      .where(and(eq(sdrTagsTable.id, tid), eq(sdrTagsTable.userId, userId))).limit(1);
    if (!tag) { res.status(404).json({ error: "Tag não encontrada" }); return; }
    await db.insert(sdrContactTagsTable).values({ userId, jid, tagId: tid }).onConflictDoNothing();
    rcDel(`bulk-tags:${userId}`);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Falha temporária ao salvar tag. Tente novamente." });
  }
});

/** Remove a tag from a contact JID */
router.delete("/sdr/contact-tags", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { jid, tagId } = req.body as { jid: string; tagId: string | number };
  const tid = parseInt(String(tagId), 10);
  if (!jid || isNaN(tid)) { res.status(400).json({ error: "jid e tagId obrigatórios" }); return; }
  try {
    await db.delete(sdrContactTagsTable).where(and(
      eq(sdrContactTagsTable.userId, userId),
      eq(sdrContactTagsTable.jid, jid),
      eq(sdrContactTagsTable.tagId, tid),
    ));
    rcDel(`bulk-tags:${userId}`);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Falha temporária ao remover tag. Tente novamente." });
  }
});

// ── Contact Notes ─────────────────────────────────────────────────────────────

router.get("/sdr/contact-notes", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const jid = String(req.query.jid ?? "");
  if (!jid) { res.status(400).json({ error: "jid obrigatório" }); return; }
  try {
    const notes = await db.select()
      .from(sdrContactNotesTable)
      .where(and(eq(sdrContactNotesTable.userId, userId), eq(sdrContactNotesTable.jid, jid)))
      .orderBy(desc(sdrContactNotesTable.createdAt));
    res.json({ notes: notes.map(n => ({ id: n.id, content: n.content, createdAt: n.createdAt })) });
  } catch {
    res.json({ notes: [] });
  }
});

router.post("/sdr/contact-notes", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { jid, content } = req.body as { jid: string; content: string };
  if (!jid || !content?.trim()) { res.status(400).json({ error: "jid e conteúdo obrigatórios" }); return; }
  try {
    const [note] = await db.insert(sdrContactNotesTable)
      .values({ userId, jid, content: content.trim() })
      .returning();
    res.json({ note: { id: note.id, content: note.content, createdAt: note.createdAt } });
  } catch {
    res.status(503).json({ error: "Falha temporária. Tente novamente." });
  }
});

router.delete("/sdr/contact-notes/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  try {
    await db.delete(sdrContactNotesTable)
      .where(and(eq(sdrContactNotesTable.id, id), eq(sdrContactNotesTable.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Falha temporária. Tente novamente." });
  }
});

// ── Memory cleanup — prevent unbounded growth in long-running processes ───────
// Runs every 10 min. Maps with hard caps (liveChats, contactNames, aiProcessed)
// self-evict; these maps have no cap and grow with each unique instance/user.
setInterval(() => {
  const MAX_CACHE_ENTRIES = 500;
  if (userEmailCache.size > MAX_CACHE_ENTRIES) userEmailCache.clear();
  if (instanceUserCache.size > MAX_CACHE_ENTRIES) instanceUserCache.clear();
  if (instanceInfoCache.size > MAX_CACHE_ENTRIES) instanceInfoCache.clear();
  if (lidPhoneCache.size > MAX_CACHE_ENTRIES * 4) lidPhoneCache.clear();
  if (evoInflight.size > 50) evoInflight.clear(); // shouldn't happen, but safety net
}, 10 * 60_000);

// ── Instance watchdog — reconnects dropped instances every 5 min ──────────────
// Catches disconnections that never fired a webhook (e.g. network split).
setInterval(async () => {
  try {
    const instances = await db.select({
      instanceName: sdrInstanceMapTable.instanceName,
    }).from(sdrInstanceMapTable);

    for (const { instanceName: inst } of instances) {
      // Skip if a reconnect is already scheduled
      if (reconnectTimers.has(inst)) continue;
      try {
        const state = await fetchInstanceState(inst);
        if (!state.connected) {
          console.log(`[watchdog] ${inst}: disconnected — scheduling reconnect`);
          reconnectAttempts.delete(inst); // reset attempt counter for watchdog-triggered reconnect
          scheduleReconnect(inst);
        }
      } catch { /* instance may not exist on Evo API — skip */ }
    }
  } catch { /* non-fatal */ }
}, 5 * 60_000);

// ── Agente de Follow-up ───────────────────────────────────────────────────────
// Detecta contatos que pararam de responder e envia mensagens contextuais
// com base no histórico completo (memória eterna via DB).

const FOLLOWUP_STAGE_LABELS: Record<number, string> = {
  1: "30 minutos", 2: "1 hora", 3: "4 horas", 4: "12 horas", 5: "1 dia", 6: "2 dias",
};

async function processFollowupItem(item: typeof sdrFollowupQueueTable.$inferSelect): Promise<void> {
  // Double-check settings still enabled
  const [settings] = await db.select()
    .from(sdrFollowupSettingsTable)
    .where(and(
      eq(sdrFollowupSettingsTable.userId, item.userId),
      eq(sdrFollowupSettingsTable.slotNumber, item.slotNumber),
      eq(sdrFollowupSettingsTable.enabled, true),
    ))
    .limit(1);

  if (!settings) {
    await db.update(sdrFollowupQueueTable)
      .set({ cancelledAt: new Date(), cancelReason: "disabled" })
      .where(eq(sdrFollowupQueueTable.id, item.id)).catch(() => {});
    return;
  }

  // Check liveChats: if last message was from us, contact already replied → cancel remaining
  const live = liveChats.get(item.instanceName);
  const entry = live?.get(item.jid);
  if (entry?.fromMe) {
    await db.update(sdrFollowupQueueTable)
      .set({ cancelledAt: new Date(), cancelReason: "already_replied" })
      .where(and(
        eq(sdrFollowupQueueTable.instanceName, item.instanceName),
        eq(sdrFollowupQueueTable.jid, item.jid),
        isNull(sdrFollowupQueueTable.sentAt),
        isNull(sdrFollowupQueueTable.cancelledAt),
      )).catch(() => {});
    return;
  }

  // Build context from DB message history — memória eterna (até 80 msgs)
  const recentMsgs = await db.select({
    fromMe: sdrMessagesTable.fromMe,
    text: sdrMessagesTable.text,
    ts: sdrMessagesTable.timestamp,
  })
    .from(sdrMessagesTable)
    .where(and(
      eq(sdrMessagesTable.userId, item.userId),
      eq(sdrMessagesTable.slotNumber, item.slotNumber),
      eq(sdrMessagesTable.jid, item.jid),
    ))
    .orderBy(desc(sdrMessagesTable.timestamp))
    .limit(80);

  recentMsgs.reverse();

  const contactName = getCachedName(item.instanceName, item.jid) ?? "cliente";
  const stageLabel = FOLLOWUP_STAGE_LABELS[item.stage] ?? `estágio ${item.stage}`;

  const histMessages = recentMsgs
    .filter(m => m.text && m.text !== "[mídia]" && m.text.trim())
    .map(m => ({ role: m.fromMe ? "assistant" as const : "user" as const, content: m.text as string }));

  // Instruções por estágio — calibram urgência e tom
  const stageGuidance: Record<number, string> = {
    1: "Tom leve e curioso. Pode ser um simples check-in, como se tivesse passado na memória. Sem pressão.",
    2: "Entregue um valor concreto relacionado ao que foi discutido — insight, dado, dica relevante para o nicho ou dor mencionada. Não peça resposta diretamente.",
    3: "Crie ancoragem emocional: relembre a dor principal que o cliente expressou. Mostre que você entendeu e que tem a solução. Breve e pontual.",
    4: "Use prova social ou escassez sutil relacionada ao contexto da conversa. Transmita que a janela de oportunidade existe mas não é infinita.",
    5: "Tom de cuidado genuíno. Pergunte diretamente se o cliente ainda tem interesse ou se algo mudou. Dê abertura para ele responder sem culpa.",
    6: "Mensagem de encerramento. Deixe a porta aberta com elegância. Mencione que não vai mais incomodar mas que está disponível quando quiser retomar.",
  };

  const defaultBasePrompt = `Você é um SDR especialista em vendas consultivas pelo WhatsApp. Você tem acesso ao histórico COMPLETO desta conversa.

ANTES de escrever qualquer mensagem, faça internamente uma auditoria rápida da conversa:
- Qual produto/serviço foi discutido?
- Qual a dor principal que o cliente expressou?
- Qual objeção ou ponto de hesitação ficou em aberto?
- Qual foi o último assunto tratado antes do silêncio?
- Qual o tom e vocabulário do cliente?

Com base nessa auditoria, escreva UMA mensagem de follow-up que:
- Referencia diretamente algo específico da conversa (nome, dor, produto, situação mencionada)
- Soa 100% humano e natural — nunca automatizado
- Usa o mesmo registro de linguagem do cliente (formal/informal)
- Aplica o gatilho adequado para este estágio: ${stageGuidance[item.stage] ?? stageGuidance[1]}
- Tem no máximo 2-3 frases curtas (padrão WhatsApp)
- NUNCA menciona follow-up, automação, "não respondeu", ou que é uma mensagem programada`;

  const basePrompt = settings.aiPrompt?.trim() || defaultBasePrompt;

  const systemPrompt = `CONTEXTO: ${contactName} | Estágio ${item.stage}/6 | Silêncio há ${stageLabel}

${basePrompt}

REGRA ABSOLUTA: Retorne APENAS o texto da mensagem WhatsApp. Sem prefixo, sem aspas, sem markdown, sem comentários. Só o texto que será enviado.`;

  const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
  if (!OPENAI_KEY) { console.error("[followup] OPENAI_API_KEY not set"); return; }

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...histMessages],
      max_tokens: 150,
      temperature: 0.85,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!aiRes.ok) { console.error(`[followup] OpenAI error ${aiRes.status}`); return; }

  const aiData = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
  const replyText = aiData.choices?.[0]?.message?.content?.trim();
  if (!replyText) { console.error("[followup] empty AI reply"); return; }

  // Send via Evolution API — @lid JIDs must be sent with full JID, not bare number
  let sendNumber: string;
  if (item.jid.endsWith("@lid")) {
    // Try resolved phone first, fall back to full @lid JID (Baileys handles it natively)
    const resolved = lidPhoneCache.get(`${item.instanceName}:${item.jid}`);
    sendNumber = resolved ?? item.jid;
  } else {
    sendNumber = item.jid.replace(/@s\.whatsapp\.net|@c\.us/g, "");
  }

  const sendRes = await evoFetch(`/message/sendText/${item.instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number: sendNumber, textMessage: { text: replyText } }),
  });

  if (!sendRes.ok) {
    console.error(`[followup] send failed ${sendRes.status} to ${sendNumber}`);
    return;
  }

  // Mark sent + update live cache
  await db.update(sdrFollowupQueueTable)
    .set({ sentAt: new Date() })
    .where(eq(sdrFollowupQueueTable.id, item.id));

  const ts = Math.floor(Date.now() / 1000);
  addLiveEntry(item.instanceName, item.jid, { name: contactName, text: replyText, ts, fromMe: true });
  console.log(`[followup] ✓ stage ${item.stage} sent to ${item.instanceName}:${item.jid.slice(0, 20)}`);
}

// Enqueue job — a cada 5 min detecta chats silenciosos e agenda follow-ups
setInterval(async () => {
  try {
    const instances = await db.select({
      instanceName: sdrInstanceMapTable.instanceName,
      userId: sdrInstanceMapTable.userId,
      slotNumber: sdrInstanceMapTable.slotNumber,
    }).from(sdrInstanceMapTable);

    for (const { instanceName: inst, userId, slotNumber } of instances) {
      const [settings] = await db.select()
        .from(sdrFollowupSettingsTable)
        .where(and(
          eq(sdrFollowupSettingsTable.userId, userId),
          eq(sdrFollowupSettingsTable.slotNumber, slotNumber),
          eq(sdrFollowupSettingsTable.enabled, true),
        ))
        .limit(1);
      if (!settings) continue;

      const stages: { minutes: number }[] = (() => {
        try { return JSON.parse(settings.stagesJson); } catch { return []; }
      })();
      if (stages.length === 0) continue;

      const live = liveChats.get(inst);
      if (!live || live.size === 0) continue;

      const now = Date.now();
      const firstStageMs = (stages[0]?.minutes ?? 30) * 60_000;

      // Follow-up triggers when WE sent the last message (fromMe=true) and contact didn't reply
      for (const [jid, chatEntry] of live.entries()) {
        if (!chatEntry.fromMe) continue; // contact sent last — not our follow-up scenario

        const elapsed = now - (chatEntry.ts * 1000);
        if (elapsed < firstStageMs) continue; // too soon

        // Check if already queued for this chat
        const existing = await db.select({ id: sdrFollowupQueueTable.id })
          .from(sdrFollowupQueueTable)
          .where(and(
            eq(sdrFollowupQueueTable.instanceName, inst),
            eq(sdrFollowupQueueTable.jid, jid),
            isNull(sdrFollowupQueueTable.cancelledAt),
          ))
          .limit(1);
        if (existing.length > 0) continue;

        // Schedule all stages from the last message timestamp
        const lastMsgTs = new Date(chatEntry.ts * 1000);
        let inserted = 0;
        for (let i = 0; i < stages.length; i++) {
          const scheduledAt = new Date(lastMsgTs.getTime() + (stages[i]?.minutes ?? 0) * 60_000);
          if (scheduledAt <= new Date()) continue; // already past — skip
          await db.insert(sdrFollowupQueueTable).values({
            userId, instanceName: inst, slotNumber, jid, stage: i + 1, scheduledAt,
          }).catch(() => {});
          inserted++;
        }
        if (inserted > 0) {
          console.log(`[followup] queued ${inserted} stages for ${inst}:${jid.slice(0, 20)}`);
        }
      }
    }
  } catch { /* non-fatal */ }
}, 5 * 60_000);

// Send job — a cada minuto processa itens vencidos na fila
setInterval(async () => {
  try {
    const due = await db.select()
      .from(sdrFollowupQueueTable)
      .where(and(
        lte(sdrFollowupQueueTable.scheduledAt, new Date()),
        isNull(sdrFollowupQueueTable.sentAt),
        isNull(sdrFollowupQueueTable.cancelledAt),
      ))
      .orderBy(sdrFollowupQueueTable.scheduledAt)
      .limit(5);

    for (const item of due) {
      await processFollowupItem(item).catch(err =>
        console.error(`[followup] item ${item.id} error:`, String(err)),
      );
    }
  } catch { /* non-fatal */ }
}, 60_000);

// GET /api/sdr/followup/settings?slot=1
router.get("/sdr/followup/settings", requireAuth, async (req, res) => {
  const userId = (req.session as { userId?: number }).userId!;
  const slot = parseInt(String(req.query.slot ?? "1"), 10);
  const [s] = await db.select()
    .from(sdrFollowupSettingsTable)
    .where(and(eq(sdrFollowupSettingsTable.userId, userId), eq(sdrFollowupSettingsTable.slotNumber, slot)))
    .limit(1);
  res.json({
    enabled: s?.enabled ?? false,
    stagesJson: s?.stagesJson ?? '[{"minutes":30},{"minutes":60},{"minutes":240},{"minutes":720},{"minutes":1440},{"minutes":2880}]',
    aiPrompt: s?.aiPrompt ?? "",
  });
});

// PUT /api/sdr/followup/settings?slot=1
router.put("/sdr/followup/settings", requireAuth, async (req, res) => {
  const userId = (req.session as { userId?: number }).userId!;
  const slot = parseInt(String(req.query.slot ?? "1"), 10);
  const { enabled, stagesJson, aiPrompt } = req.body as { enabled?: boolean; stagesJson?: string; aiPrompt?: string };
  const defaultStages = '[{"minutes":30},{"minutes":60},{"minutes":240},{"minutes":720},{"minutes":1440},{"minutes":2880}]';
  await db.insert(sdrFollowupSettingsTable)
    .values({ userId, slotNumber: slot, enabled: !!enabled, stagesJson: stagesJson ?? defaultStages, aiPrompt: aiPrompt ?? "" })
    .onConflictDoUpdate({
      target: [sdrFollowupSettingsTable.userId, sdrFollowupSettingsTable.slotNumber],
      set: { enabled: !!enabled, stagesJson: stagesJson ?? defaultStages, aiPrompt: aiPrompt ?? "", updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// ── Bunny media proxy — serve stored media to authenticated clients ───────────
// GET /api/whatsapp/media?path=<storagePath>
// Fetches the file from Bunny Storage using the private API key and streams it
// back. Requires a valid session — media is never exposed publicly.
router.get("/whatsapp/media", requireAuth, async (req, res) => {
  const storagePath = String(req.query.path ?? "").trim();
  if (!storagePath || storagePath.includes("..")) {
    res.status(400).json({ error: "path inválido" }); return;
  }

  const ZONE = process.env.BUNNY_STORAGE_ZONE ?? "combozap";
  const HOST = process.env.BUNNY_STORAGE_HOSTNAME ?? "storage.bunnycdn.com";
  const KEY  = process.env.BUNNY_STORAGE_PASSWORD ?? "";

  if (!KEY) { res.status(503).json({ error: "storage não configurado" }); return; }

  try {
    const url = `https://${HOST}/${ZONE}/${storagePath}`;
    const upstream = await fetch(url, {
      headers: { "AccessKey": KEY },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "arquivo não encontrado" }); return;
    }

    const ct = upstream.headers.get("Content-Type") ?? "application/octet-stream";
    const cl = upstream.headers.get("Content-Length");
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (cl) res.setHeader("Content-Length", cl);

    if (upstream.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (err) {
    res.status(502).json({ error: "erro ao buscar mídia: " + String(err) });
  }
});

export default router;
