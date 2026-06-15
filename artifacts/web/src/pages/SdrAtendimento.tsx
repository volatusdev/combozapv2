import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "../components/Layout";

type Chat = {
  jid: string;
  name: string | null;
  phone: string;
  unread: number;
  lastMessage: string;
  lastTimestamp: number;
};

type Message = {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  mediaType?: string;
  mediaData?: string;
  mediaMime?: string;
  mediaName?: string;
  mediaUrl?: string;
};

/** Resolve the src URL for a media message.
 *  - If mediaUrl (Bunny storage path) is set → use the API proxy endpoint.
 *  - Fallback → base64 data URI. */
function resolveMediaSrc(msg: Message): string | null {
  if (msg.mediaUrl) return `/api/whatsapp/media?path=${encodeURIComponent(msg.mediaUrl)}`;
  if (msg.mediaData) return `data:${msg.mediaMime ?? "application/octet-stream"};base64,${msg.mediaData}`;
  return null;
}

type Tag = { id: string; name: string; desc: string };

function applyVars(text: string, name: string | null, phone: string): string {
  return text
    .replace(/\{\{nome\}\}/gi, name ?? "Cliente")
    .replace(/\{\{name\}\}/gi, name ?? "Cliente")
    .replace(/\{\{telefone\}\}/gi, phone)
    .replace(/\{\{phone\}\}/gi, phone);
}

// ── LocalStorage cache — persiste chats e mensagens no browser ───────────────
// Chave por slot (não por userId — cada aba do browser tem seu próprio usuário logado).
// Limite: 200 mensagens por conversa para não estourar o limite de 5MB do localStorage.
const LS_CHATS = (slot: number) => `vn_chats_s${slot}`;
const LS_MSGS  = (slot: number, jid: string) => `vn_msgs_s${slot}_${btoa(jid).replace(/=/g, "")}`;
const MAX_CACHED = 200;

function cacheChats(slot: number, chats: Chat[]) {
  try { localStorage.setItem(LS_CHATS(slot), JSON.stringify(chats)); } catch {}
}
function getCachedChats(slot: number): Chat[] {
  try { return JSON.parse(localStorage.getItem(LS_CHATS(slot)) ?? "[]") as Chat[]; } catch { return []; }
}
function cacheMsgs(slot: number, jid: string, msgs: Message[]) {
  try { localStorage.setItem(LS_MSGS(slot, jid), JSON.stringify(msgs.slice(-MAX_CACHED))); } catch {}
}
function getCachedMsgs(slot: number, jid: string): Message[] {
  try { return JSON.parse(localStorage.getItem(LS_MSGS(slot, jid)) ?? "[]") as Message[]; } catch { return []; }
}
/** Merge cached + fresh, dedup by id, sort by timestamp, cap at MAX_CACHED. */
function mergeMsgs(cached: Message[], fresh: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of cached) map.set(m.id, m);
  for (const m of fresh)  map.set(m.id, m); // fresh wins on conflict
  return Array.from(map.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_CACHED);
}
/** Remove all cached chats + messages for a slot (called on "Limpar histórico"). */
function clearCachedSlot(slot: number) {
  try {
    const prefix = `vn_msgs_s${slot}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === LS_CHATS(slot) || k.startsWith(prefix))) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

function MsgContent({ msg }: { msg: Message }) {
  const src = resolveMediaSrc(msg);

  if ((msg.mediaType === "image" || msg.mediaType === "sticker") && src) {
    return (
      <img
        src={src}
        alt="imagem"
        style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, display: "block", cursor: "pointer" }}
        onClick={() => window.open(src)}
      />
    );
  }
  if (msg.mediaType === "audio" && src) {
    return (
      <audio
        controls
        style={{ display: "block", minWidth: 200, maxWidth: "100%", outline: "none" }}
        src={src}
      />
    );
  }
  if (msg.mediaType === "video" && src) {
    return (
      <video
        controls
        style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, display: "block" }}
        src={src}
      />
    );
  }
  if (msg.mediaType === "document") {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>📄</span>
        <span style={{ fontStyle: "italic", wordBreak: "break-word" }}>{msg.mediaName || "documento"}</span>
      </span>
    );
  }
  if (msg.mediaType === "image" || msg.mediaType === "sticker") {
    return <span style={{ fontStyle: "italic", opacity: 0.7 }}>🖼️ {msg.text}</span>;
  }
  if (msg.mediaType === "audio") {
    return <span style={{ fontStyle: "italic", opacity: 0.7 }}>🎤 {msg.text}</span>;
  }
  if (msg.mediaType === "video") {
    return <span style={{ fontStyle: "italic", opacity: 0.7 }}>📹 {msg.text}</span>;
  }
  return <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.text}</span>;
}

function formatPhone(jid: string): string {
  if (jid.endsWith("@lid")) return ""; // @lid = ID interno Meta, não é telefone real
  const raw = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
  // Números brasileiros: 55 + 2 dígitos de DDD + 8-9 dígitos
  if (raw.startsWith("55") && (raw.length === 12 || raw.length === 13)) {
    const area = raw.slice(2, 4);
    const num  = raw.slice(4);
    if (num.length === 9) return `+55 ${area} ${num.slice(0, 5)}-${num.slice(5)}`;
    if (num.length === 8) return `+55 ${area} ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return `+${raw}`;
}

/** True se o "nome" é um número/ID disfarçado de nome (sem letras) */
function isNumericId(s: string): boolean {
  return /^[+\d\s\-().@a-z]+$/.test(s) && !/[A-Za-zÀ-ú]/.test(s);
}

function jidToDisplay(jid: string, name: string | null): string {
  // Rejeita nomes que são apenas números/IDs (ex: "+1669547237581231" ou "166954723758123@lid")
  const realName = name && !isNumericId(name) ? name : null;
  if (realName) return realName;
  if (jid.endsWith("@lid")) return "WhatsApp"; // @lid sem nome real → apelido neutro
  return formatPhone(jid) || jid;
}

// ── ContactAvatar ─────────────────────────────────────────────────────────────
const _picCache = new Map<string, string | null>();
const AVATAR_COLORS = ["#6366f1","#f59e0b","#10b981","#3b82f6","#ec4899","#8b5cf6","#06b6d4","#ef4444"];

function avatarColor(jid: string) {
  const idx = jid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function avatarInitials(display: string) {
  const parts = display.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return display.slice(0, 2).toUpperCase();
}

function ContactAvatar({ jid, name, slot, size = 46 }: {
  jid: string; name: string | null; slot: number; size?: number;
}) {
  const display = jidToDisplay(jid, name);
  const cacheKey = `${slot}:${jid}`;
  const [picUrl, setPicUrl] = useState<string | null | undefined>(
    _picCache.has(cacheKey) ? (_picCache.get(cacheKey) ?? null) : undefined
  );

  useEffect(() => {
    if (_picCache.has(cacheKey)) { setPicUrl(_picCache.get(cacheKey) ?? null); return; }
    fetch(`/api/sdr/contact-pic?slot=${slot}&jid=${encodeURIComponent(jid)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { const url = d?.url ?? null; _picCache.set(cacheKey, url); setPicUrl(url); })
      .catch(() => { _picCache.set(cacheKey, null); setPicUrl(null); });
  }, [cacheKey, slot, jid]);

  if (picUrl) {
    return (
      <img src={picUrl} alt={display}
        style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "block", objectFit: "cover" }}
        onError={() => { _picCache.set(cacheKey, null); setPicUrl(null); }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: picUrl === undefined ? "#e5e7eb" : avatarColor(jid),
      display: "flex", alignItems: "center", justifyContent: "center",
      color: picUrl === undefined ? "transparent" : "#fff",
      fontSize: Math.round(size * 0.37), fontWeight: 700, userSelect: "none",
    }}>
      {picUrl !== undefined && avatarInitials(display)}
    </div>
  );
}

function tsToTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 2) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function SdrAtendimento() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [sdrMaxSlots, setSdrMaxSlots] = useState(1);
  const [slotNames, setSlotNames] = useState<Record<number, string>>({});
  const selectedSlotRef = useRef(1);
  const selectedJidRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<Set<string>>(new Set());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [chatStatuses, setChatStatuses] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("aberto");
  const [contactSuggestions, setContactSuggestions] = useState<{jid: string; name: string|null; phone: string}[]>([]);
  const [teamMembers, setTeamMembers] = useState<{id: number; name: string}[]>([]);
  const [assignments, setAssignments] = useState<Record<string, {memberId: number; memberName: string}>>({});
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [aiPausedJids, setAiPausedJids] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSdrPlan();
    checkStatus();
    fetchAllTags();
    fetchConvStatuses(1);
    fetchTeamMembers();
    fetchAssignments(1);
    fetchAiPaused(1);

    // Pause polling when tab is hidden — resume when visible again
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Reinicia chat poll
        if (chatPollRef.current) clearInterval(chatPollRef.current);
        chatPollRef.current = setInterval(() => loadChats(false), 20000);
        // Reinicia msg poll se houver um chat selecionado (não checa msgPollRef — foi zerado ao esconder)
        if (selectedJidRef.current) {
          if (msgPollRef.current) clearInterval(msgPollRef.current);
          msgPollRef.current = setInterval(() => loadMessages(selectedJidRef.current!), 8000);
        }
      } else {
        if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; }
        if (msgPollRef.current) { clearInterval(msgPollRef.current); msgPollRef.current = null; }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function fetchSdrPlan() {
    try {
      const r = await fetch("/api/sdr/plan/current", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d.plan?.maxSlots) setSdrMaxSlots(d.plan.maxSlots);
        if (d.slots) {
          const names: Record<number, string> = {};
          for (const s of d.slots) names[s.slotNumber] = s.name;
          setSlotNames(names);
        }
      }
    } catch {}
  }

  function switchSlot(slot: number) {
    selectedSlotRef.current = slot;
    setSelectedSlot(slot);
    setChats([]);
    setSelectedJid(null);
    selectedJidRef.current = null;
    setMessages([]);
    setChatStatuses({});
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    // NÃO chama loadDbChats aqui — checkStatus → startChatPolling já cuida disso
    // (chamar aqui também causava double-load com race condition)
    checkStatus();
    fetchConvStatuses(slot);
    fetchAssignments(slot);
    fetchAiPaused(slot);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchAiPaused(slot: number) {
    try {
      const r = await fetch(`/api/sdr/ai-pause?slot=${slot}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setAiPausedJids(new Set(Object.keys(d.paused ?? {})));
      }
    } catch {}
  }

  async function toggleAiPause(jid: string) {
    const wasPaused = aiPausedJids.has(jid);
    const nowPaused = !wasPaused;
    setAiPausedJids(prev => {
      const next = new Set(prev);
      if (nowPaused) next.add(jid); else next.delete(jid);
      return next;
    });
    try {
      await fetch("/api/sdr/ai-pause", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, slot: selectedSlotRef.current, paused: nowPaused }),
      });
    } catch {
      // rollback on error
      setAiPausedJids(prev => {
        const next = new Set(prev);
        if (wasPaused) next.add(jid); else next.delete(jid);
        return next;
      });
    }
  }

  async function fetchConvStatuses(slot: number) {
    try {
      const r = await fetch(`/api/sdr/conversation-status?slot=${slot}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setChatStatuses(d.statuses ?? {});
      }
    } catch {}
  }

  async function setConvStatus(jid: string, status: string) {
    setChatStatuses(prev => ({ ...prev, [jid]: status }));
    try {
      await fetch("/api/sdr/conversation-status", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, slot: selectedSlotRef.current, status }),
      });
    } catch {}
  }

  async function fetchTeamMembers() {
    try {
      const r = await fetch("/api/sdr/assignments/members", { credentials: "include" });
      if (r.ok) { const d = await r.json(); setTeamMembers(d.members ?? []); }
    } catch {}
  }

  async function fetchAssignments(slot: number) {
    try {
      const r = await fetch(`/api/sdr/assignments?slot=${slot}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAssignments(d.assignments ?? {}); }
    } catch {}
  }

  async function saveAssignment(jid: string, memberId: number | null) {
    const prevAssignments = assignments;
    if (memberId === null) {
      setAssignments(a => { const n = { ...a }; delete n[jid]; return n; });
    } else {
      const member = teamMembers.find(m => m.id === memberId);
      if (member) setAssignments(a => ({ ...a, [jid]: { memberId, memberName: member.name } }));
    }
    try {
      await fetch("/api/sdr/assignments", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, slot: selectedSlotRef.current, memberId }),
      });
    } catch {
      setAssignments(prevAssignments);
    }
  }

  async function checkStatus() {
    try {
      const slot = selectedSlotRef.current;
      const res = await fetch(`/api/sdr/whatsapp/status?slot=${slot}`, { credentials: "include" });
      const data = await res.json();
      const isConnected = data.connected === true;
      setConnected(isConnected);
      if (isConnected) startChatPolling();
    } catch {
      setConnected(false);
    }
  }

  // ── Carrega chats do banco — fonte de verdade persistente ───────────────────
  // IMPORTANTE: sempre escreve no localStorage para que loadChats() possa
  // fazer merge correto sobre os dados do DB (sem isso a merge perderia chats).
  async function loadDbChats(slot: number) {
    try {
      const res = await fetch(`/api/sdr/db-chats?slot=${slot}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const dbChats: Chat[] = data.chats ?? [];
      if (dbChats.length === 0) return;

      // Merge DB com localStorage existente: DB é base, cache preserva nomes extras
      const prevCached = getCachedChats(slot);
      const chatMap = new Map<string, Chat>(prevCached.map(c => [c.jid, c]));
      for (const dc of dbChats) {
        const existing = chatMap.get(dc.jid);
        chatMap.set(dc.jid, { ...dc, name: dc.name || existing?.name || null });
      }
      const merged = Array.from(chatMap.values())
        .sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));

      // Escreve no localStorage ANTES de retornar — loadChats() que vem depois usa isso
      cacheChats(slot, merged);

      // Atualiza estado: se já há dados frescos da API, faz merge inteligente
      setChats(prev => {
        if (prev.length === 0) return merged;
        // Há dados na tela — garante que chats do DB que não estão no estado atual sejam adicionados
        const stateMap = new Map<string, Chat>(prev.map(c => [c.jid, c]));
        for (const dc of merged) {
          if (!stateMap.has(dc.jid)) stateMap.set(dc.jid, dc);
        }
        return Array.from(stateMap.values())
          .sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));
      });

      if (!selectedJidRef.current && merged.length > 0) {
        selectedJidRef.current = merged[0].jid;
        setSelectedJid(merged[0].jid);
      }
    } catch {}
  }

  // ── Polling de chats ─────────────────────────────────────────────────────────
  // SEQUÊNCIA CRÍTICA: DB primeiro (popula localStorage), API depois (merge sobre DB)
  // Rodar em paralelo causava race onde loadChats sobrescrevia estado sem os chats do DB.
  function startChatPolling() {
    const slot = selectedSlotRef.current;
    loadDbChats(slot).then(() => loadChats());
    if (chatPollRef.current) clearInterval(chatPollRef.current);
    chatPollRef.current = setInterval(() => {
      loadChats(false); // silent refresh periódico — DB já está no localStorage
    }, 20000);
  }

  async function loadChats(showSpinner = true) {
    const slot = selectedSlotRef.current;

    // Mostra cache imediatamente só se a tela estiver vazia (evita piscar)
    const cached = getCachedChats(slot);
    if (cached.length > 0) {
      setChats(prev => {
        if (prev.length > 0) return prev; // já tem dados, não pisca
        return cached;
      });
      if (!selectedJidRef.current && cached.length > 0) {
        selectedJidRef.current = cached[0].jid;
        setSelectedJid(cached[0].jid);
      }
    }

    if (showSpinner && cached.length === 0) setLoadingChats(true);
    try {
      const res = await fetch(`/api/sdr/chats?slot=${slot}`, { credentials: "include" });
      if (selectedSlotRef.current !== slot) return; // usuário trocou de slot — descarta resposta
      const data = await res.json();
      const newChats: Chat[] = data.chats ?? [];

      // Merge: localStorage (já inclui DB) é a base; API atualiza por cima
      const prevCached = getCachedChats(slot);
      const chatMap = new Map<string, Chat>(prevCached.map(c => [c.jid, c]));
      for (const nc of newChats) {
        const existing = chatMap.get(nc.jid);
        chatMap.set(nc.jid, { ...nc, name: nc.name || existing?.name || null });
      }
      const merged = Array.from(chatMap.values())
        .sort((a, b) => (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));

      setChats(merged);
      cacheChats(slot, merged);
      if (merged.length > 0 && !selectedJidRef.current) {
        selectedJidRef.current = merged[0].jid;
        setSelectedJid(merged[0].jid);
      }
    } catch {
      // silencioso em refresh periódico — cache já exibido
    } finally {
      if (showSpinner) setLoadingChats(false);
    }
  }

  const loadMessages = useCallback(async (jid: string) => {
    const slot = selectedSlotRef.current;
    const cached = getCachedMsgs(slot, jid);

    // Mostra cache APENAS quando as mensagens estão vazias (troca de chat / primeira carga)
    // Em polls periódicos, mantém o estado atual para não piscar nem perder mensagens otimistas
    setMessages(prev => {
      if (prev.length === 0) return cached;
      return prev; // já tem mensagens — não substitui para evitar flash e perda de otimistas
    });
    if (cached.length === 0) setLoadingMsgs(true);

    try {
      const res = await fetch(`/api/sdr/messages?jid=${encodeURIComponent(jid)}&count=60&slot=${slot}`, { credentials: "include" });
      // Guard: descarta resposta se o usuário já trocou de conversa
      if (selectedJidRef.current !== jid) return;
      const data = await res.json();
      const fresh: Message[] = data.messages ?? [];
      const confirmedIds = new Set(fresh.map(m => m.id));

      setMessages(prev => {
        // Otimistas: mensagens do usuário ainda não confirmadas pelo servidor
        const optimistic = prev.filter(m => m.id.startsWith("opt-") && !confirmedIds.has(m.id));
        // Merge histórico (prev sem otimistas) + fresh do servidor
        const merged = mergeMsgs(prev.filter(m => !m.id.startsWith("opt-")), fresh);
        // Recoloca otimistas no final
        const final = [...merged, ...optimistic]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-MAX_CACHED);
        cacheMsgs(slot, jid, merged); // salva sem otimistas (serão recarregados do servidor)
        return final;
      });
    } catch {
      // mantém estado atual — não apaga mensagens em caso de falha de rede
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // Atualiza ref quando selectedJid muda
  useEffect(() => {
    selectedJidRef.current = selectedJid;
  }, [selectedJid]);

  // Carrega tags do contato selecionado
  useEffect(() => {
    setContactTagIds(new Set());
    setShowTagPanel(false);
    if (selectedJid) fetchContactTags(selectedJid);
  }, [selectedJid]);

  useEffect(() => {
    if (!selectedJid) return;
    // Limpa mensagens do chat anterior ANTES de carregar o novo —
    // sem isso, loadMessages mantém o prev (guarda anti-flash do poll) e o usuário vê o chat errado
    setMessages([]);
    loadMessages(selectedJid);

    if (msgPollRef.current) clearInterval(msgPollRef.current);
    msgPollRef.current = setInterval(() => loadMessages(selectedJid), 8000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [selectedJid, loadMessages]);

  async function clearHistory() {
    const slot = selectedSlotRef.current;
    await fetch(`/api/sdr/whatsapp/clearHistory?slot=${slot}`, {
      method: "DELETE", credentials: "include",
    });
    clearCachedSlot(slot);
    setChats([]);
    setMessages([]);
    setSelectedJid(null);
    selectedJidRef.current = null;
  }

  async function fetchAllTags() {
    try {
      const r = await fetch("/api/sdr/tags", { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAllTags(d.tags ?? []); }
    } catch {}
  }

  async function fetchContactTags(jid: string) {
    try {
      const r = await fetch(`/api/sdr/contact-tags?jid=${encodeURIComponent(jid)}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setContactTagIds(new Set((d.tags ?? []).map((t: Tag) => t.id))); }
    } catch {}
  }

  async function toggleContactTag(tagId: string) {
    const jid = selectedJidRef.current;
    if (!jid) return;
    const isAdding = !contactTagIds.has(tagId);
    setContactTagIds(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(tagId); else next.delete(tagId);
      return next;
    });
    try {
      await fetch("/api/sdr/contact-tags", {
        method: isAdding ? "POST" : "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, tagId }),
      });
    } catch {
      setContactTagIds(prev => {
        const next = new Set(prev);
        if (isAdding) next.delete(tagId); else next.add(tagId);
        return next;
      });
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !selectedJid || sending) return;
    setSending(true);
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      fromMe: true,
      text,
      timestamp: Math.floor(Date.now() / 1000),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const slot = selectedSlotRef.current;
      const res = await fetch(`/api/sdr/send?slot=${slot}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: selectedJid, text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const detail = String(err.detail ? JSON.stringify(err.detail) : (err.error ?? "Erro ao enviar"));
        alert(`Mensagem não enviada: ${detail}`);
        // Reverte a mensagem otimista
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(text);
        return;
      }
      // Recarrega as mensagens após 1.5s para sincronizar com servidor
      setTimeout(() => loadMessages(selectedJid!), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro de rede";
      alert(`Mensagem não enviada: ${msg}`);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  // Busca de contatos no DB quando search >= 2 chars
  useEffect(() => {
    if (search.length < 2) { setContactSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const slot = selectedSlotRef.current;
        const r = await fetch(`/api/sdr/contacts?slot=${slot}`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json() as { contacts?: {jid: string; name: string|null; phone: string}[] };
        const q = search.toLowerCase();
        const knownJids = new Set(chats.map(c => c.jid));
        const results = (d.contacts ?? []).filter(c => {
          const name = (c.name ?? "").toLowerCase();
          const phone = c.phone.toLowerCase();
          return (name.includes(q) || phone.includes(q)) && !knownJids.has(c.jid);
        }).slice(0, 7);
        setContactSuggestions(results);
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [search, chats]);

  const selectedChat = chats.find((c) => c.jid === selectedJid);
  const filtered = chats.filter((c) => {
    if (c.jid.endsWith("@g.us")) return false; // never show group chats
    const display = jidToDisplay(c.jid, c.name).toLowerCase();
    const phone = formatPhone(c.jid);
    const textMatch = display.includes(search.toLowerCase()) || phone.includes(search);
    const status = chatStatuses[c.jid] ?? "aberto";
    const statusMatch = statusFilter === status;
    return textMatch && statusMatch;
  });

  if (connected === null) {
    return (
      <Layout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)" }}>
          <Spinner />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden", background: "#fff" }}>

        {/* ── Painel esquerdo ─────────────────────────────────────── */}
        <div style={{
          width: 340, minWidth: 300, flexShrink: 0,
          borderRight: "1px solid #e5e5e5",
          display: "flex", flexDirection: "column", background: "#fafafa",
        }}>
          <div style={{ padding: "18px 18px 10px", borderBottom: "1px solid #e5e5e5" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Central de Atendimento</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={clearHistory}
                  title="Limpar histórico"
                  style={{
                    border: "1px solid #f0c0c0", background: "#fff8f8", cursor: "pointer",
                    padding: "3px 10px", color: "#c44", borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                  }}
                >
                  Limpar
                </button>
                <button onClick={() => loadChats()} title="Atualizar" style={{
                  border: "none", background: "none", cursor: "pointer",
                  padding: 4, color: "#999", borderRadius: 6,
                }}>
                  <RefreshIcon />
                </button>
              </div>
            </div>
            {/* Slot selector — aparece só com plano multi-slot */}
          {sdrMaxSlots > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {Array.from({ length: sdrMaxSlots }, (_, i) => i + 1).map(s => (
                <button key={s} onClick={() => switchSlot(s)} style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none",
                  background: selectedSlot === s ? "#111" : "rgba(0,0,0,0.06)",
                  color: selectedSlot === s ? "#fff" : "rgba(0,0,0,0.55)",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  {slotNames[s] ?? `WA ${s}`}
                </button>
              ))}
            </div>
          )}

          <div style={{ position: "relative" }}>
              <SearchIcon style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato ou número..."
                style={{
                  width: "100%", padding: "8px 10px 8px 34px",
                  border: "1px solid #e5e5e5", borderRadius: 8,
                  background: "#fff", fontSize: 13.5, outline: "none",
                  color: "#111", boxSizing: "border-box",
                }}
              />
              {/* Dropdown de sugestões — contatos do DB não na lista */}
              {contactSuggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 400, overflow: "hidden",
                }}>
                  <div style={{ padding: "6px 12px 4px", fontSize: 11, color: "#999", fontWeight: 600, letterSpacing: 0.3 }}>
                    CONTATOS ANTERIORES
                  </div>
                  {contactSuggestions.map(c => {
                    const name = c.name || formatPhone(c.jid);
                    return (
                      <button
                        key={c.jid}
                        onClick={() => {
                          setSelectedJid(c.jid);
                          setSearch("");
                          setContactSuggestions([]);
                        }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", border: "none", background: "transparent",
                          cursor: "pointer", textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <ContactAvatar jid={c.jid} name={c.name ?? null} slot={selectedSlot} size={34} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{name}</div>
                          <div style={{ fontSize: 11.5, color: "#999" }}>{formatPhone(c.jid)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status filter tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
              {([
                { key: "aberto",   label: "🟢 Aberto" },
                { key: "pendente", label: "🟡 Pendente" },
                { key: "resolvido",label: "✅ Resolvido" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, border: "none",
                    background: statusFilter === key ? "#111" : "rgba(0,0,0,0.05)",
                    color: statusFilter === key ? "#fff" : "#555",
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingChats && (
              <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
                <Spinner />
              </div>
            )}
            {!loadingChats && filtered.length === 0 && (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                {!connected ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📱</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#555", marginBottom: 6 }}>WhatsApp não conectado</div>
                    <div style={{ fontSize: 12.5, color: "#aaa", lineHeight: 1.5, marginBottom: 14 }}>Conecte um número para ver as conversas aqui</div>
                    <a href="/sdr/conexao" style={{ fontSize: 12.5, fontWeight: 700, color: "#111", textDecoration: "underline" }}>
                      Ir para Conexão →
                    </a>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, color: "#aaa" }}>Nenhuma conversa encontrada</div>
                )}
              </div>
            )}
            {filtered.map((c) => {
              const display = jidToDisplay(c.jid, c.name);
              return (
                <button
                  key={c.jid}
                  onClick={() => setSelectedJid(c.jid)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 18px", border: "none", cursor: "pointer", textAlign: "left",
                    background: selectedJid === c.jid ? "#f0f0f0" : "transparent",
                    borderBottom: "1px solid #f0f0f0", transition: "background 0.1s",
                  }}
                >
                  <ContactAvatar jid={c.jid} name={c.name ?? null} slot={selectedSlot} size={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                        {display}
                      </span>
                      <span style={{ fontSize: 11, color: "#999", flexShrink: 0, marginLeft: 8 }}>
                        {tsToTime(c.lastTimestamp)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12.5, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                        {c.lastMessage || "—"}
                      </span>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, marginLeft: 6 }}>
                        {(() => {
                          const s = chatStatuses[c.jid] ?? "aberto";
                          if (s === "aberto") return null;
                          return (
                            <span style={{ fontSize: 12 }} title={s === "pendente" ? "Pendente" : "Resolvido"}>
                              {s === "pendente" ? "🟡" : "✅"}
                            </span>
                          );
                        })()}
                        {c.unread > 0 && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: "#fff",
                            background: "#222", borderRadius: 99,
                            padding: "1px 7px",
                          }}>
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    {assignments[c.jid] && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                        <span>👤</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                          {assignments[c.jid].memberName}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Painel direito: chat ─────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!selectedChat ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 14 }}>
              Selecione uma conversa
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: "12px 20px", borderBottom: "1px solid #e5e5e5",
                display: "flex", alignItems: "center", gap: 14, background: "#fff", flexShrink: 0,
                position: "relative",
              }}>
                <ContactAvatar jid={selectedChat.jid} name={selectedChat.name ?? null} slot={selectedSlot} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
                    {jidToDisplay(selectedChat.jid, selectedChat.name)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {selectedChat.phone || formatPhone(selectedChat.jid)}
                    </span>
                    {Array.from(contactTagIds).map(id => {
                      const tag = allTags.find(t => t.id === id);
                      return tag ? (
                        <span key={id} style={{
                          display: "inline-block", fontSize: 10.5, fontWeight: 600,
                          padding: "2px 8px", borderRadius: 99,
                          background: "rgba(0,0,0,0.07)", color: "#444",
                        }}>
                          🏷️ {tag.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* Botão toggle IA */}
                {(() => {
                  const isPaused = aiPausedJids.has(selectedChat!.jid);
                  return (
                    <button
                      onClick={() => toggleAiPause(selectedChat!.jid)}
                      title={isPaused ? "IA pausada nesta conversa — clique para reativar" : "IA ativa — clique para pausar nesta conversa"}
                      style={{
                        padding: "5px 11px", borderRadius: 7, border: "none",
                        background: isPaused ? "#fff3cd" : "#d4edda",
                        color: isPaused ? "#856404" : "#155724",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                        flexShrink: 0, transition: "all 0.12s",
                        boxShadow: "0 0 0 1px " + (isPaused ? "#ffc10740" : "#28a74540"),
                      }}
                    >
                      {isPaused ? "⏸️" : "🤖"} <span>{isPaused ? "IA pausada" : "IA ativa"}</span>
                    </button>
                  );
                })()}

                {/* Status buttons */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {([
                    { key: "aberto",    emoji: "🟢", label: "Aberto" },
                    { key: "pendente",  emoji: "🟡", label: "Pendente" },
                    { key: "resolvido", emoji: "✅", label: "Resolvido" },
                  ] as const).map(({ key, emoji, label }) => {
                    const current = chatStatuses[selectedChat!.jid] ?? "aberto";
                    const active = current === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setConvStatus(selectedChat!.jid, key)}
                        title={label}
                        style={{
                          padding: "5px 10px", borderRadius: 7, border: "none",
                          background: active ? "#111" : "rgba(0,0,0,0.05)",
                          color: active ? "#fff" : "#555",
                          fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                          transition: "all 0.12s",
                        }}
                      >
                        {emoji} <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Botão de atribuição — só aparece se houver membros na equipe */}
                {teamMembers.length > 0 && (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={() => { setShowAssignPanel(p => !p); setShowTagPanel(false); }}
                      title="Atribuir conversa"
                      style={{
                        padding: "6px 13px", borderRadius: 8,
                        border: showAssignPanel ? "1.5px solid #111" : "1px solid #e0e0e0",
                        background: assignments[selectedChat!.jid] ? "#111" : (showAssignPanel ? "#111" : "#fff"),
                        color: (assignments[selectedChat!.jid] || showAssignPanel) ? "#fff" : "#555",
                        fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      👤 {assignments[selectedChat!.jid]?.memberName ?? "Atribuir"}
                    </button>

                    {showAssignPanel && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300,
                        background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.13)", minWidth: 200, padding: "6px 0",
                      }}>
                        <div style={{ padding: "6px 14px 4px", fontSize: 11, color: "#999", fontWeight: 600 }}>
                          ATRIBUIR A
                        </div>
                        <button
                          onClick={() => { saveAssignment(selectedChat!.jid, null); setShowAssignPanel(false); }}
                          style={{
                            width: "100%", padding: "9px 14px", border: "none",
                            background: !assignments[selectedChat!.jid] ? "#f5f5f5" : "transparent",
                            cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                          onMouseLeave={e => (e.currentTarget.style.background = !assignments[selectedChat!.jid] ? "#f5f5f5" : "transparent")}
                        >
                          <span>🚫</span> <span style={{ color: "#555" }}>Nenhum</span>
                        </button>
                        {teamMembers.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { saveAssignment(selectedChat!.jid, m.id); setShowAssignPanel(false); }}
                            style={{
                              width: "100%", padding: "9px 14px", border: "none",
                              background: assignments[selectedChat!.jid]?.memberId === m.id ? "#f0f0f0" : "transparent",
                              cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                            onMouseLeave={e => (e.currentTarget.style.background = assignments[selectedChat!.jid]?.memberId === m.id ? "#f0f0f0" : "transparent")}
                          >
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#e0e0e0", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#555", flexShrink: 0 }}>{(m.name ?? "?")[0].toUpperCase()}</span>
                            <span style={{ fontWeight: 600 }}>{m.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Botão de tag */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    onClick={() => setShowTagPanel(p => !p)}
                    title="Adicionar/remover tag"
                    style={{
                      padding: "6px 13px", borderRadius: 8,
                      border: showTagPanel ? "1.5px solid #111" : "1px solid #e0e0e0",
                      background: showTagPanel ? "#111" : "#fff",
                      color: showTagPanel ? "#fff" : "#555",
                      fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    🏷️ Tag
                  </button>

                  {showTagPanel && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300,
                      background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.13)", minWidth: 220, padding: "6px 0",
                    }}>
                      <div style={{
                        padding: "7px 14px 9px", fontSize: 11, fontWeight: 700,
                        color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em",
                        borderBottom: "1px solid #f0f0f0",
                      }}>
                        Tags do contato
                      </div>
                      {allTags.length === 0 ? (
                        <div style={{ padding: "10px 14px", fontSize: 13, color: "#aaa" }}>
                          Sem tags.{" "}
                          <a href="/sdr/tags" style={{ color: "#555" }}>Criar →</a>
                        </div>
                      ) : allTags.map(tag => {
                        const checked = contactTagIds.has(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleContactTag(tag.id)}
                            style={{
                              width: "100%", padding: "9px 14px", border: "none",
                              background: checked ? "rgba(0,0,0,0.04)" : "transparent",
                              cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                              textAlign: "left",
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                              border: checked ? "none" : "1.5px solid #ddd",
                              background: checked ? "#111" : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {checked && (
                                <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span style={{ fontSize: 13.5, color: "#111", fontWeight: checked ? 600 : 400 }}>
                              {tag.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Mensagens */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "20px",
                background: "#f8f8f8", display: "flex", flexDirection: "column", gap: 8,
              }}>
                {loadingMsgs && messages.length === 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                    <Spinner />
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{ display: "flex", justifyContent: msg.fromMe ? "flex-end" : "flex-start" }}
                  >
                    <div style={{
                      maxWidth: "70%",
                      background: msg.fromMe ? "#222" : "#fff",
                      color: msg.fromMe ? "#fff" : "#111",
                      border: msg.fromMe ? "none" : "1px solid #e5e5e5",
                      borderRadius: msg.fromMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: (msg.mediaData || msg.mediaUrl) && (msg.mediaType === "image" || msg.mediaType === "sticker") ? "6px" : "9px 14px",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      overflow: "hidden",
                    }}>
                      <MsgContent msg={msg} />
                      {/* Show caption text below media if both exist */}
                      {(msg.mediaData || msg.mediaUrl) && msg.text && msg.text !== `[${msg.mediaType}]` && !msg.text.startsWith("[") && (
                        <div style={{ marginTop: 4, paddingLeft: 4 }}>{msg.text}</div>
                      )}
                      <div style={{ fontSize: 10.5, color: msg.fromMe ? "rgba(255,255,255,0.5)" : "#bbb", marginTop: 4, textAlign: "right", paddingRight: (msg.mediaData || msg.mediaUrl) ? 4 : 0 }}>
                        {tsToTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && !loadingMsgs && (
                  <div style={{ textAlign: "center", color: "#ccc", fontSize: 13.5, paddingTop: 40 }}>
                    Nenhuma mensagem ainda
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: "12px 16px", borderTop: "1px solid #e5e5e5",
                background: "#fff", display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
              }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { sendMessage(); }
                  }}
                  placeholder="Digite uma mensagem..."
                  style={{
                    flex: 1, padding: "10px 16px", borderRadius: 10,
                    border: "1px solid #e5e5e5", fontSize: 14, outline: "none",
                    background: "#fafafa", color: "#111",
                  }}
                />
                <button
                  onClick={() => { sendMessage(); }}
                  disabled={!input.trim() || sending}
                  style={{
                    padding: "10px 20px", borderRadius: 10, border: "none",
                    background: "#111", color: "#fff", fontSize: 13.5, fontWeight: 600,
                    cursor: !input.trim() || sending ? "not-allowed" : "pointer",
                    opacity: !input.trim() || sending ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  {sending ? "..." : "Enviar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </Layout>
  );
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
  );
}
function Spinner() {
  return (
    <div style={{ width: 24, height: 24, border: "2px solid #f0f0f0", borderTop: "2px solid #111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
