import { useState, useEffect, useRef } from "react";
import { Layout } from "../components/Layout";

const BG = "#f7f7f5";
const COLUMN_BG = "#f0f0ee";
const WHITE = "#ffffff";
const BLACK = "#111111";
const BORDER = "#e5e7eb";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#9ca3af";

const STAGE_COLORS = ["#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#10b981","#ef4444","#ec4899","#f97316"];
function stageColor(idx: number) { return STAGE_COLORS[idx % STAGE_COLORS.length]; }

const BTN_BLACK: React.CSSProperties = {
  background: BLACK, color: WHITE, border: "none",
  borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const BTN_GHOST: React.CSSProperties = {
  background: "transparent", color: GRAY, border: `1.5px dashed ${BORDER}`,
  borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600,
  cursor: "pointer", width: "100%", textAlign: "left",
};
const LABEL: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: "#374151",
  display: "block", marginBottom: 5, letterSpacing: 0.2,
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${BORDER}`, fontSize: 13.5, outline: "none",
  color: BLACK, boxSizing: "border-box", background: WHITE,
};

interface FunnelCard {
  id: number;
  stageId: number;
  jid: string | null;
  contactName: string;
  contactPhone: string;
  title: string;
  valueCents: number | null;
  notes: string;
  position: number;
  createdAt: string;
}

interface FunnelStage {
  id: number;
  name: string;
  color: string;
  position: number;
  cards: FunnelCard[];
}

interface Contact {
  jid: string;
  name: string | null;
  phone: string;
}

function fmtCurrency(cents: number | null | undefined): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function totalValue(cards: FunnelCard[]): number {
  return cards.reduce((sum, c) => sum + (c.valueCents ?? 0), 0);
}

// ── Card Detail Modal ─────────────────────────────────────────────────────────
function CardModal({
  card, stages, onClose, onSave, onDelete, onMove,
}: {
  card: FunnelCard;
  stages: FunnelStage[];
  onClose: () => void;
  onSave: (id: number, data: Partial<FunnelCard>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onMove: (id: number, stageId: number) => Promise<void>;
}) {
  const [name, setName] = useState(card.contactName);
  const [phone, setPhone] = useState(card.contactPhone);
  const [title, setTitle] = useState(card.title);
  const [value, setValue] = useState(card.valueCents != null ? String(card.valueCents / 100).replace(".", ",") : "");
  const [notes, setNotes] = useState(card.notes);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const rawValue = value.replace(",", ".").trim();
      const valueCents = rawValue ? Math.round(parseFloat(rawValue) * 100) : null;
      await onSave(card.id, { contactName: name, contactPhone: phone, title, valueCents, notes });
      onClose();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try { await onDelete(card.id); onClose(); } finally { setSaving(false); }
  }

  const currentStage = stages.find(s => s.id === card.stageId);
  const stageIdx = stages.findIndex(s => s.id === card.stageId);
  const accent = currentStage?.color || stageColor(stageIdx);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: WHITE, borderRadius: 14, width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        <div style={{
          height: 4, background: accent,
        }} />
        <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: BLACK }}>Editar Card</div>
            <div style={{ fontSize: 11.5, color: GRAY, marginTop: 2 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: accent, marginRight: 5, verticalAlign: "middle" }} />
              {currentStage?.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: LIGHT_GRAY, lineHeight: 1, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>×</button>
        </div>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Nome do contato</label>
              <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <label style={LABEL}>Telefone</label>
              <input style={INPUT} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511999999999" />
            </div>
          </div>
          <div>
            <label style={LABEL}>Título do negócio</label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Plano Pro — 3 slots" />
          </div>
          <div>
            <label style={LABEL}>Valor (R$)</label>
            <input style={{ ...INPUT, maxWidth: 180 }} value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label style={LABEL}>Anotações</label>
            <textarea style={{ ...INPUT, resize: "vertical", minHeight: 72, fontFamily: "inherit", lineHeight: 1.6 }}
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre este lead..." />
          </div>
          <div>
            <label style={LABEL}>Mover para etapa</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {stages.map((s, i) => (
                <button key={s.id}
                  onClick={async () => { if (s.id !== card.stageId) { setSaving(true); await onMove(card.id, s.id); onClose(); } }}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${s.id === currentStage?.id ? stageColor(i) : BORDER}`,
                    background: s.id === currentStage?.id ? stageColor(i) : WHITE,
                    color: s.id === currentStage?.id ? WHITE : GRAY,
                    transition: "all 0.12s",
                  }}
                >{s.name}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${BORDER}` }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              style={{ background: "none", border: "none", color: "#ef4444", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Excluir card
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: GRAY }}>Confirmar?</span>
              <button onClick={handleDelete} disabled={saving}
                style={{ ...BTN_BLACK, background: "#ef4444", padding: "6px 12px", fontSize: 12 }}>Excluir</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ background: "none", border: "none", fontSize: 12, color: GRAY, cursor: "pointer" }}>Cancelar</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose}
              style={{ ...BTN_BLACK, background: WHITE, color: BLACK, border: `1px solid ${BORDER}` }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} style={{ ...BTN_BLACK, background: accent }}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Card Modal ─────────────────────────────────────────────────────────────
function AddCardModal({
  stageId, stages, onClose, onAdd,
}: {
  stageId: number;
  stages: FunnelStage[];
  onClose: () => void;
  onAdd: (data: {
    stageId: number; jid?: string; contactName: string; contactPhone: string;
    title: string; valueCents: number | null; notes: string;
  }) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [targetStage, setTargetStage] = useState(stageId);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setLoadingContacts(true);
    fetch("/api/sdr/contacts", { credentials: "include" })
      .then(r => r.json())
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoadingContacts(false));
  }, []);

  const filtered = query.trim()
    ? contacts.filter(c =>
        (c.name ?? "").toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query) ||
        c.jid.includes(query)
      ).slice(0, 8)
    : contacts.slice(0, 8);

  function selectContact(c: Contact) {
    setSelected(c);
    setName(c.name ?? "");
    setPhone(c.phone);
    setQuery(c.name ?? c.phone);
    setDropdownOpen(false);
  }

  async function handleAdd() {
    const cName = name.trim() || query.trim();
    if (!cName) return;
    setSaving(true);
    try {
      const rawValue = value.replace(",", ".").trim();
      const valueCents = rawValue ? Math.round(parseFloat(rawValue) * 100) : null;
      await onAdd({
        stageId: targetStage,
        jid: selected?.jid,
        contactName: cName,
        contactPhone: phone.trim(),
        title: title.trim(),
        valueCents,
        notes: notes.trim(),
      });
      onClose();
    } finally { setSaving(false); }
  }

  const stageIdx = stages.findIndex(s => s.id === targetStage);
  const foundStage = stages.find(s => s.id === targetStage);
  const accent = foundStage?.color || stageColor(stageIdx >= 0 ? stageIdx : 0);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: WHITE, borderRadius: 14, width: "100%", maxWidth: 460,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        <div style={{ height: 4, background: accent, borderRadius: "14px 14px 0 0" }} />
        <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLACK }}>Adicionar ao Funil</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: LIGHT_GRAY, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 13, maxHeight: "65vh", overflowY: "auto", overflowX: "visible" }}>

          {/* Contact search — uses relative positioning for dropdown */}
          <div style={{ position: "relative", zIndex: 20 }}>
            <label style={LABEL}>Buscar contato</label>
            <input style={INPUT} value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); setName(""); setPhone(""); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={loadingContacts ? "Carregando contatos…" : "Nome ou telefone…"}
              autoFocus />
            {dropdownOpen && filtered.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 999,
                background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
              }}>
                {filtered.map(c => (
                  <button key={c.jid} onMouseDown={() => selectContact(c)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "9px 14px", border: "none",
                      background: "none", cursor: "pointer", textAlign: "left",
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f7")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", background: accent,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: WHITE, fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(c.name ?? c.phone).slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BLACK }}>{c.name ?? c.phone}</div>
                      <div style={{ fontSize: 11.5, color: GRAY }}>{c.phone}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div style={{ background: "#f7f7f5", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: WHITE, fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {(selected.name ?? selected.phone).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>{selected.name ?? selected.phone}</div>
                <div style={{ fontSize: 11.5, color: GRAY }}>{selected.phone}</div>
              </div>
              <button onClick={() => { setSelected(null); setQuery(""); setName(""); setPhone(""); }}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: LIGHT_GRAY, fontSize: 16 }}>×</button>
            </div>
          )}

          {!selected && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={LABEL}>Nome</label>
                <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Maria Souza" />
              </div>
              <div>
                <label style={LABEL}>Telefone</label>
                <input style={INPUT} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511…" />
              </div>
            </div>
          )}

          <div>
            <label style={LABEL}>Título do negócio <span style={{ color: LIGHT_GRAY, fontWeight: 400 }}>(opcional)</span></label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Plano Pro — 3 slots" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Valor (R$)</label>
              <input style={INPUT} value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label style={LABEL}>Etapa de destino</label>
              <select style={INPUT} value={targetStage} onChange={e => setTargetStage(Number(e.target.value))}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LABEL}>Anotações</label>
            <textarea style={{ ...INPUT, resize: "vertical", minHeight: 64, fontFamily: "inherit", lineHeight: 1.6 }}
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre este lead…" />
          </div>
        </div>
        <div style={{ padding: "12px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: `1px solid ${BORDER}` }}>
          <button onClick={onClose}
            style={{ ...BTN_BLACK, background: WHITE, color: BLACK, border: `1px solid ${BORDER}` }}>
            Cancelar
          </button>
          <button onClick={handleAdd} disabled={saving || (!name.trim() && !query.trim())}
            style={{ ...BTN_BLACK, background: accent, opacity: (!name.trim() && !query.trim()) ? 0.5 : 1 }}>
            {saving ? "Adicionando…" : "Adicionar ao Funil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Stage Modal ────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  "#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#10b981",
  "#ef4444","#ec4899","#f97316","#64748b","#84cc16",
];

function StageFormModal({
  title, initialName, initialColor, confirmLabel,
  onClose, onConfirm,
}: {
  title: string; initialName: string; initialColor: string; confirmLabel: string;
  onClose: () => void; onConfirm: (name: string, color: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!name.trim()) return;
    setSaving(true);
    try { await onConfirm(name.trim(), color); onClose(); } finally { setSaving(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: WHITE, borderRadius: 12, width: "100%", maxWidth: 360,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        <div style={{ height: 4, background: color, transition: "background 0.15s" }} />
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLACK }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: LIGHT_GRAY, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={LABEL}>Nome da etapa</label>
            <input style={INPUT} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder="Ex: Aguardando Decisão" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Cor</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLOR_PALETTE.map(c => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c,
                    border: color === c ? `3px solid ${BLACK}` : "3px solid transparent",
                    outline: color === c ? `2px solid ${c}` : "none",
                    outlineOffset: 1, cursor: "pointer", padding: 0,
                    transition: "transform 0.1s",
                    transform: color === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "0 22px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}
            style={{ ...BTN_BLACK, background: WHITE, color: BLACK, border: `1px solid ${BORDER}` }}>Cancelar</button>
          <button onClick={handleConfirm} disabled={saving || !name.trim()}
            style={{ ...BTN_BLACK, background: color, opacity: !name.trim() ? 0.5 : 1 }}>
            {saving ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddStageModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, color: string) => Promise<void> }) {
  return <StageFormModal title="Nova Etapa" initialName="" initialColor={COLOR_PALETTE[0]} confirmLabel="Criar Etapa" onClose={onClose} onConfirm={onAdd} />;
}

// ── Kanban Card ────────────────────────────────────────────────────────────────
function KanbanCard({
  card, stageColor: accent, onDragStart, onClick,
}: {
  card: FunnelCard;
  stageColor: string;
  onDragStart: (e: React.DragEvent, card: FunnelCard) => void;
  onClick: (card: FunnelCard) => void;
}) {
  const displayName = card.contactName || card.contactPhone || "Sem nome";
  const initials = displayName.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?";

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, card)}
      onClick={() => onClick(card)}
      style={{
        background: WHITE, borderRadius: 10, marginBottom: 8,
        cursor: "grab", userSelect: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.15s, transform 0.12s",
        overflow: "hidden",
        borderLeft: `3px solid ${accent}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.11), 0 0 0 1px rgba(0,0,0,0.05)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ padding: "11px 13px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: `${accent}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: accent, fontSize: 10.5, fontWeight: 800, flexShrink: 0, marginTop: 1,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, lineHeight: 1.3, marginBottom: 1 }}>
              {displayName}
            </div>
            {card.contactPhone && card.contactPhone !== card.contactName && (
              <div style={{ fontSize: 11, color: LIGHT_GRAY }}>{card.contactPhone}</div>
            )}
          </div>
        </div>
        {card.title && (
          <div style={{ fontSize: 11.5, color: GRAY, marginTop: 7, lineHeight: 1.4 }}>{card.title}</div>
        )}
        {(card.valueCents != null || card.notes) && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            {card.valueCents != null ? (
              <span style={{
                background: `${accent}18`, color: accent,
                borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700,
              }}>
                {fmtCurrency(card.valueCents)}
              </span>
            ) : <span />}
            {card.notes && (
              <span style={{
                fontSize: 10.5, color: LIGHT_GRAY,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: 120,
              }}>
                📝 {card.notes.slice(0, 40)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({
  stage, stageIdx, onAddCard, onDrop, onDragOver, onDragStart, onCardClick, onDelete, onEdit,
}: {
  stage: FunnelStage;
  stageIdx: number;
  onAddCard: (stageId: number) => void;
  onDrop: (e: React.DragEvent, stageId: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, card: FunnelCard) => void;
  onCardClick: (card: FunnelCard) => void;
  onDelete: (id: number, hasCards: boolean) => void;
  onEdit: (stage: FunnelStage) => void;
}) {
  const [dragCounter, setDragCounter] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const accent = stage.color || stageColor(stageIdx);

  const isDragOver = dragCounter > 0;
  const total = totalValue(stage.cards);

  return (
    <div
      style={{
        width: 272, flexShrink: 0, background: isDragOver ? `${accent}0f` : COLUMN_BG,
        borderRadius: 12, display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 140px)",
        border: isDragOver ? `2px solid ${accent}` : "2px solid transparent",
        transition: "border 0.15s, background 0.15s",
      }}
      onDragOver={e => { onDragOver(e); }}
      onDragEnter={e => { e.preventDefault(); setDragCounter(c => c + 1); }}
      onDragLeave={() => setDragCounter(c => Math.max(0, c - 1))}
      onDrop={e => { setDragCounter(0); onDrop(e, stage.id); }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: accent, borderRadius: "10px 10px 0 0", flexShrink: 0 }} />

      {/* Column header */}
      <div style={{ padding: "10px 12px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 12.5, fontWeight: 700, color: BLACK, flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {stage.name}
            </span>
            <span style={{
              background: "#e5e7eb", color: GRAY, borderRadius: 99,
              fontSize: 10.5, fontWeight: 700, padding: "2px 7px", flexShrink: 0,
            }}>{stage.cards.length}</span>
          </div>
          <div style={{ position: "relative", marginLeft: 4 }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", color: LIGHT_GRAY, fontSize: 16, lineHeight: 1, borderRadius: 4 }}
              onMouseEnter={e => (e.currentTarget.style.background = "#e5e7eb")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >⋯</button>
            {menuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setMenuOpen(false)} />
                <div style={{
                  position: "absolute", right: 0, top: "110%", zIndex: 10, background: WHITE,
                  border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                  minWidth: 170, overflow: "hidden",
                }}>
                  <button onClick={() => { setMenuOpen(false); onEdit(stage); }}
                    style={{ display: "block", width: "100%", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: BLACK }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f7")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    ✏️ Editar etapa
                  </button>
                  <button onClick={() => { setMenuOpen(false); onAddCard(stage.id); }}
                    style={{ display: "block", width: "100%", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: BLACK }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f7")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    + Adicionar card
                  </button>
                  <div style={{ borderTop: `1px solid ${BORDER}` }} />
                  <button onClick={() => { setMenuOpen(false); onDelete(stage.id, stage.cards.length > 0); }}
                    style={{ display: "block", width: "100%", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#ef4444" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fff5f5")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    Excluir etapa
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {total > 0 && (
          <div style={{ fontSize: 11, color: accent, fontWeight: 700, marginTop: 4 }}>{fmtCurrency(total)}</div>
        )}
      </div>

      {/* Cards area */}
      <div style={{ padding: "4px 10px", overflowY: "auto", flex: 1 }}>
        {stage.cards.length === 0 && (
          <div style={{
            border: `1.5px dashed ${isDragOver ? accent : BORDER}`,
            borderRadius: 8, padding: "20px 12px", textAlign: "center",
            color: isDragOver ? accent : LIGHT_GRAY, fontSize: 12, marginBottom: 4,
            transition: "all 0.15s",
          }}>
            {isDragOver ? "Soltar aqui" : "Nenhum card"}
          </div>
        )}
        {stage.cards.map(card => (
          <KanbanCard
            key={card.id} card={card} stageColor={accent}
            onDragStart={onDragStart} onClick={onCardClick}
          />
        ))}
      </div>

      {/* Add card button */}
      <div style={{ padding: "6px 10px 10px", flexShrink: 0 }}>
        <button
          style={{ ...BTN_GHOST, borderColor: `${accent}44`, color: accent }}
          onClick={() => onAddCard(stage.id)}
          onMouseEnter={e => { e.currentTarget.style.background = `${accent}0a`; e.currentTarget.style.borderColor = accent; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${accent}44`; }}
        >
          <span style={{ fontSize: 15, lineHeight: 1, marginRight: 2 }}>+</span> Adicionar card
        </button>
      </div>
    </div>
  );
}

// ── Delete Stage Confirm Modal ─────────────────────────────────────────────────
function DeleteStageModal({ hasCards, onConfirm, onClose }: { hasCards: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: WHITE, borderRadius: 12, width: "100%", maxWidth: 360, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "20px 24px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: BLACK, marginBottom: 8 }}>Excluir etapa?</div>
          {hasCards ? (
            <p style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.6, margin: 0 }}>
              Esta etapa ainda tem cards. Mova ou exclua os cards antes de removê-la.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.6, margin: 0 }}>
              Esta ação não pode ser desfeita.
            </p>
          )}
        </div>
        <div style={{ padding: "0 24px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ ...BTN_BLACK, background: WHITE, color: BLACK, border: `1px solid ${BORDER}` }}>
            {hasCards ? "Entendido" : "Cancelar"}
          </button>
          {!hasCards && (
            <button onClick={onConfirm} style={{ ...BTN_BLACK, background: "#ef4444" }}>
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function SdrFunil() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [addCardFor, setAddCardFor] = useState<number | null>(null);
  const [editCard, setEditCard] = useState<FunnelCard | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [editStage, setEditStage] = useState<FunnelStage | null>(null);
  const [deleteStage, setDeleteStage] = useState<{ id: number; hasCards: boolean } | null>(null);

  const dragCardRef = useRef<FunnelCard | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/sdr/funnel", { credentials: "include" });
      if (!r.ok) throw new Error("erro");
      const d = await r.json();
      setStages(d.stages ?? []);
    } catch { setError("Erro ao carregar funil"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function handleDragStart(e: React.DragEvent, card: FunnelCard) {
    dragCardRef.current = card;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(e: React.DragEvent, targetStageId: number) {
    e.preventDefault();
    const card = dragCardRef.current;
    if (!card || card.stageId === targetStageId) return;
    dragCardRef.current = null;

    setStages(prev => prev.map(s => ({
      ...s,
      cards: s.id === card.stageId
        ? s.cards.filter(c => c.id !== card.id)
        : s.id === targetStageId
          ? [...s.cards, { ...card, stageId: targetStageId }]
          : s.cards,
    })));

    try {
      await fetch(`/api/sdr/funnel/cards/${card.id}/move`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: targetStageId }),
      });
    } catch { load(); }
  }

  async function handleAddCard(data: {
    stageId: number; jid?: string; contactName: string; contactPhone: string;
    title: string; valueCents: number | null; notes: string;
  }) {
    const r = await fetch("/api/sdr/funnel/cards", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("erro");
    const d = await r.json();
    setStages(prev => prev.map(s =>
      s.id === data.stageId ? { ...s, cards: [...s.cards, d.card] } : s
    ));
  }

  async function handleSaveCard(id: number, data: Partial<FunnelCard>) {
    const r = await fetch(`/api/sdr/funnel/cards/${id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("erro");
    const d = await r.json();
    setStages(prev => prev.map(s => ({
      ...s,
      cards: s.cards.map(c => c.id === id ? d.card : c),
    })));
  }

  async function handleMoveCard(id: number, stageId: number) {
    const card = stages.flatMap(s => s.cards).find(c => c.id === id);
    if (!card) return;
    setStages(prev => prev.map(s => ({
      ...s,
      cards: s.id === card.stageId
        ? s.cards.filter(c => c.id !== id)
        : s.id === stageId
          ? [...s.cards, { ...card, stageId }]
          : s.cards,
    })));
    await fetch(`/api/sdr/funnel/cards/${id}/move`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
  }

  async function handleDeleteCard(id: number) {
    await fetch(`/api/sdr/funnel/cards/${id}`, { method: "DELETE", credentials: "include" });
    setStages(prev => prev.map(s => ({ ...s, cards: s.cards.filter(c => c.id !== id) })));
  }

  async function handleAddStage(name: string, color: string) {
    const r = await fetch("/api/sdr/funnel/stages", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!r.ok) throw new Error("erro");
    const d = await r.json();
    setStages(prev => [...prev, { ...d.stage, cards: [] }]);
  }

  async function handleEditStage(id: number, name: string, color: string) {
    await fetch(`/api/sdr/funnel/stages/${id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    setStages(prev => prev.map(s => s.id === id ? { ...s, name, color } : s));
  }

  function requestDeleteStage(id: number, hasCards: boolean) {
    setDeleteStage({ id, hasCards });
  }

  async function confirmDeleteStage() {
    if (!deleteStage) return;
    await fetch(`/api/sdr/funnel/stages/${deleteStage.id}`, { method: "DELETE", credentials: "include" });
    setStages(prev => prev.filter(s => s.id !== deleteStage.id));
    setDeleteStage(null);
  }

  const totalCards = stages.reduce((s, st) => s + st.cards.length, 0);
  const totalVal = stages.reduce((s, st) => s + totalValue(st.cards), 0);

  return (
    <Layout>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: BG, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px 13px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: WHITE, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: BLACK, letterSpacing: -0.5 }}>Funil de Vendas</div>
            {!loading && (
              <div style={{ fontSize: 12, color: GRAY, marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                <span>{stages.length} etapas · {totalCards} {totalCards === 1 ? "card" : "cards"}</span>
                {totalVal > 0 && (
                  <span style={{
                    background: "#f0fdf4", color: "#15803d",
                    borderRadius: 5, padding: "2px 8px", fontSize: 11.5, fontWeight: 700,
                  }}>
                    {fmtCurrency(totalVal)} em pipeline
                  </span>
                )}
              </div>
            )}
          </div>
          <button style={BTN_BLACK} onClick={() => setAddStageOpen(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nova Etapa
          </button>
        </div>

        {/* Board */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: GRAY, fontSize: 14 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                Carregando funil…
              </div>
            </div>
          )}
          {!loading && error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ef4444", fontSize: 14 }}>
              {error}
            </div>
          )}
          {!loading && !error && (
            <div style={{ display: "flex", gap: 10, padding: "16px 20px", height: "100%", boxSizing: "border-box", alignItems: "flex-start" }}>
              {stages.length === 0 && (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 16, height: "calc(100% - 32px)",
                }}>
                  <div style={{ fontSize: 44, lineHeight: 1 }}>📋</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: BLACK }}>Nenhuma etapa ainda</div>
                  <div style={{ fontSize: 13, color: GRAY, textAlign: "center", maxWidth: 280 }}>
                    Crie a primeira etapa do seu funil para começar a organizar seus contatos.
                  </div>
                  <button style={{ ...BTN_BLACK, marginTop: 4 }} onClick={() => setAddStageOpen(true)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Criar primeira etapa
                  </button>
                </div>
              )}
              {stages.map((stage, idx) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  stageIdx={idx}
                  onAddCard={setAddCardFor}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragStart={handleDragStart}
                  onCardClick={setEditCard}
                  onDelete={requestDeleteStage}
                  onEdit={setEditStage}
                />
              ))}

              <div style={{ width: 210, flexShrink: 0, paddingTop: 2 }}>
                <button
                  onClick={() => setAddStageOpen(true)}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                    border: `2px dashed ${BORDER}`, background: "transparent",
                    fontSize: 13, fontWeight: 600, color: LIGHT_GRAY,
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = GRAY; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = LIGHT_GRAY; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Nova etapa
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {addCardFor !== null && (
        <AddCardModal
          stageId={addCardFor}
          stages={stages}
          onClose={() => setAddCardFor(null)}
          onAdd={handleAddCard}
        />
      )}

      {editCard && (
        <CardModal
          card={editCard}
          stages={stages}
          onClose={() => setEditCard(null)}
          onSave={handleSaveCard}
          onDelete={handleDeleteCard}
          onMove={handleMoveCard}
        />
      )}

      {addStageOpen && (
        <AddStageModal
          onClose={() => setAddStageOpen(false)}
          onAdd={handleAddStage}
        />
      )}

      {editStage && (
        <StageFormModal
          title="Editar Etapa"
          initialName={editStage.name}
          initialColor={editStage.color || COLOR_PALETTE[0]}
          confirmLabel="Salvar"
          onClose={() => setEditStage(null)}
          onConfirm={(name, color) => handleEditStage(editStage.id, name, color)}
        />
      )}

      {deleteStage && (
        <DeleteStageModal
          hasCards={deleteStage.hasCards}
          onConfirm={confirmDeleteStage}
          onClose={() => setDeleteStage(null)}
        />
      )}
    </Layout>
  );
}
