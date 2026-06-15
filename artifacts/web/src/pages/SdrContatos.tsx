import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "../components/Layout";

type Contact = {
  jid: string;
  name: string | null;
  phone: string;
  avatarUrl?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type ContactTag = { id: string; name: string };

type ContactNote = { id: number; content: string; createdAt: string };

function avatarUrl(contact: Contact) {
  if (contact.avatarUrl) return contact.avatarUrl;
  const label = contact.name || contact.phone || "?";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=e5e5e5&color=222&size=80&bold=true`;
}

function tsLabel(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `hoje ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 2) return `ontem ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function jidDisplay(jid: string) {
  if (jid.endsWith("@lid")) return `ID:${jid.replace("@lid", "")}`;
  return jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
}

export function SdrContatos() {
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [contactTags, setContactTags] = useState<Record<string, ContactTag[]>>({});
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [sdrMaxSlots, setSdrMaxSlots]   = useState(1);
  const [slotNames, setSlotNames]       = useState<Record<number, string>>({});
  const [toast, setToast]           = useState<string | null>(null);
  const selectedSlotRef             = useRef(1);

  // Notes state
  const [notesContact, setNotesContact] = useState<Contact | null>(null);
  const [notes, setNotes]           = useState<ContactNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote]       = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  useEffect(() => { fetchPlan(); }, []);
  useEffect(() => { loadContacts(); }, [selectedSlot]);

  async function fetchPlan() {
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

  async function loadContacts(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const slot = selectedSlotRef.current;
      const [cr, ctr] = await Promise.all([
        fetch(`/api/sdr/contacts?slot=${slot}`, { credentials: "include" }),
        fetch("/api/sdr/contact-tags/bulk", { credentials: "include" }),
      ]);
      const d  = await cr.json();
      const ct = ctr.ok ? await ctr.json() : { contactTags: {} };
      setContacts(d.contacts ?? []);
      setContactTags(ct.contactTags ?? {});
    } catch {
      setContacts([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  function switchSlot(slot: number) {
    selectedSlotRef.current = slot;
    setSelectedSlot(slot);
    setContacts([]);
  }

  function exportCsv() {
    const slot = selectedSlotRef.current;
    const url = `/api/sdr/contacts/export.csv?slot=${slot}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatos-slot${slot}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Download iniciado!");
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).then(() => showToast("Número copiado!")).catch(() => {});
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  const openNotes = useCallback(async (contact: Contact) => {
    setNotesContact(contact);
    setNewNote("");
    setNotes([]);
    setNotesLoading(true);
    try {
      const r = await fetch(`/api/sdr/contact-notes?jid=${encodeURIComponent(contact.jid)}`, { credentials: "include" });
      const d = await r.json();
      setNotes(d.notes ?? []);
    } catch {} finally { setNotesLoading(false); }
  }, []);

  async function addNote() {
    if (!notesContact || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const r = await fetch("/api/sdr/contact-notes", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: notesContact.jid, content: newNote.trim() }),
      });
      const d = await r.json();
      if (d.note) {
        setNotes(prev => [d.note, ...prev]);
        setNoteCounts(c => ({ ...c, [notesContact.jid]: (c[notesContact.jid] ?? 0) + 1 }));
        setNewNote("");
      }
    } catch {} finally { setSavingNote(false); }
  }

  async function deleteNote(id: number) {
    if (!notesContact) return;
    await fetch(`/api/sdr/contact-notes/${id}`, { method: "DELETE", credentials: "include" });
    setNotes(prev => prev.filter(n => n.id !== id));
    setNoteCounts(c => ({ ...c, [notesContact.jid]: Math.max(0, (c[notesContact.jid] ?? 1) - 1) }));
  }

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q) || jidDisplay(c.jid).includes(q);
  });

  const TH: React.CSSProperties = {
    padding: "10px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.07em", color: "rgba(0,0,0,0.38)", textAlign: "left",
    borderBottom: "1px solid #e8e8e8", background: "#fafafa", whiteSpace: "nowrap",
  };

  return (
    <Layout>
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          background: "#111", color: "#fff", borderRadius: 10, padding: "11px 20px",
          fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
        }}>
          {toast}
        </div>
      )}

      <div style={{ padding: "32px 36px", maxWidth: 1060, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, marginBottom: 4 }}>Contatos</h1>
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              {loading
                ? "Carregando…"
                : contacts.length === 0
                  ? "Nenhum contato ainda — aparecem quando mensagens chegam"
                  : `${contacts.length} contato${contacts.length !== 1 ? "s" : ""} · slot ${selectedSlot}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => loadContacts()} style={{
              padding: "9px 18px", borderRadius: 8, border: "1px solid #e0e0e0",
              background: "#fff", color: "#333", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Atualizar
            </button>
            <button onClick={exportCsv} disabled={contacts.length === 0} style={{
              padding: "9px 18px", borderRadius: 8, border: "none",
              background: contacts.length === 0 ? "rgba(0,0,0,0.06)" : "#111",
              color: contacts.length === 0 ? "rgba(0,0,0,0.35)" : "#fff",
              fontSize: 13, fontWeight: 600,
              cursor: contacts.length === 0 ? "not-allowed" : "pointer",
            }}>
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Slot selector */}
        {sdrMaxSlots > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {Array.from({ length: sdrMaxSlots }, (_, i) => i + 1).map(s => (
              <button key={s} onClick={() => switchSlot(s)} style={{
                padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "none",
                background: selectedSlot === s ? "#111" : "rgba(0,0,0,0.06)",
                color: selectedSlot === s ? "#fff" : "rgba(0,0,0,0.55)",
                cursor: "pointer",
              }}>
                {slotNames[s] ?? `WhatsApp ${s}`}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou número…"
            style={{
              width: "100%", padding: "9px 14px 9px 36px", border: "1px solid #e5e5e5",
              borderRadius: 8, fontSize: 13.5, outline: "none", color: "#111",
              background: "#fafafa", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
            <Spinner />
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div style={{ border: "1px solid #e8e8e8", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 0.9fr 0.9fr 100px" }}>
              {["Contato", "Número", "Última msg", "1º contato", "Notas"].map(h => (
                <span key={h} style={TH}>{h}</span>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: "56px 24px", textAlign: "center" }}>
                {contacts.length === 0 ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 6 }}>
                      Nenhum contato ainda
                    </div>
                    <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
                      Quando um número enviar uma mensagem para este slot, ele aparece aqui automaticamente com nome e número.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, color: "#aaa" }}>Nenhum contato encontrado</div>
                )}
              </div>
            )}

            {filtered.map((c, i) => {
              const display = c.name || c.phone;
              const noteCount = noteCounts[c.jid] ?? 0;
              return (
                <div
                  key={c.jid}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1.4fr 0.9fr 0.9fr 100px",
                    borderBottom: i < filtered.length - 1 ? "1px solid #f2f2f2" : "none",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
                    <img src={avatarUrl(c)} alt={display}
                      style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.name ?? <span style={{ color: "#aaa", fontStyle: "italic" }}>Sem nome</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace", marginTop: 1 }}>
                        {jidDisplay(c.jid)}
                      </div>
                      {(contactTags[c.jid] ?? []).length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {(contactTags[c.jid] ?? []).map(t => (
                            <span key={t.id} style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 7px",
                              borderRadius: 99, background: "rgba(0,0,0,0.06)", color: "#555",
                            }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => copyPhone(c.phone)}
                    title="Clique para copiar"
                    style={{
                      padding: "13px 16px", fontSize: 13, color: "#555",
                      fontVariantNumeric: "tabular-nums", cursor: "pointer",
                    }}
                  >
                    {c.phone}
                  </div>

                  <div style={{ padding: "13px 16px", fontSize: 12.5, color: "#888" }}>
                    {tsLabel(c.lastSeenAt)}
                  </div>

                  <div style={{ padding: "13px 16px", fontSize: 12.5, color: "#bbb" }}>
                    {tsLabel(c.firstSeenAt)}
                  </div>

                  <div style={{ padding: "10px 16px" }}>
                    <button
                      onClick={() => openNotes(c)}
                      style={{
                        padding: "5px 12px", borderRadius: 7, border: "1px solid #e5e5e5",
                        background: noteCount > 0 ? "#f8f8f8" : "#fff",
                        color: noteCount > 0 ? "#111" : "#aaa",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <NoteIcon />
                      {noteCount > 0 ? <span>{noteCount}</span> : null}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Notes Modal ────────────────────────────────────────────────────────── */}
      {notesContact && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000,
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
          }}
          onClick={e => { if (e.target === e.currentTarget) setNotesContact(null); }}
        >
          <div style={{
            width: 420, height: "100%", background: "#fff",
            boxShadow: "-8px 0 40px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>
                  Notas internas
                </div>
                <button
                  onClick={() => setNotesContact(null)}
                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#aaa", lineHeight: 1, padding: 4 }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img
                  src={avatarUrl(notesContact)}
                  style={{ width: 32, height: 32, borderRadius: "50%" }}
                  alt=""
                />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#222" }}>
                    {notesContact.name ?? <span style={{ color: "#aaa", fontStyle: "italic" }}>Sem nome</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>{notesContact.phone}</div>
                </div>
              </div>
            </div>

            {/* Add note */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5" }}>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
                placeholder="Escreva uma nota privada sobre este contato…"
                rows={3}
                style={{
                  width: "100%", padding: "10px 12px", border: "1px solid #e5e5e5",
                  borderRadius: 8, fontSize: 13, outline: "none", color: "#111",
                  resize: "none", boxSizing: "border-box", fontFamily: "inherit",
                  background: "#fafafa", lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: "#ccc" }}>Ctrl+Enter para salvar</span>
                <button
                  onClick={addNote}
                  disabled={savingNote || !newNote.trim()}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "none",
                    background: newNote.trim() ? "#111" : "#f0f0f0",
                    color: newNote.trim() ? "#fff" : "#bbb",
                    fontSize: 13, fontWeight: 600,
                    cursor: newNote.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  {savingNote ? "Salvando…" : "Salvar nota"}
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
              {notesLoading && (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Spinner />
                </div>
              )}
              {!notesLoading && notes.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb", fontSize: 13 }}>
                  Nenhuma nota ainda
                </div>
              )}
              {!notesLoading && notes.map(note => (
                <div key={note.id} style={{
                  background: "#fffdf0", border: "1px solid #f0ead0",
                  borderRadius: 9, padding: "12px 14px", marginBottom: 10,
                  position: "relative",
                }}>
                  <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6, whiteSpace: "pre-wrap", paddingRight: 28 }}>
                    {note.content}
                  </div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 6 }}>
                    {tsLabel(note.createdAt)}
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    title="Excluir nota"
                    style={{
                      position: "absolute", top: 10, right: 10,
                      border: "none", background: "none", cursor: "pointer",
                      fontSize: 14, color: "#ccc", lineHeight: 1, padding: 2,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function NoteIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{ width: 28, height: 28, border: "2.5px solid #f0f0f0", borderTop: "2.5px solid #111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
