import { useState, useEffect } from "react";
import { Layout } from "../components/Layout";

const GREEN = "#22c55e";
const GREEN_DARK = "#16a34a";
const BLACK = "#0d0d0d";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";
const WHITE = "#ffffff";
const OFF_WHITE = "#f7f7f5";

interface PaymentLink { label: string; url: string; }

interface Agent {
  id: number;
  name: string;
  description: string;
  prompt: string;
  specialties: string[];
  paymentLinks: PaymentLink[];
  wooviEnabled: boolean;
  pixGateway: string;
  pixDescription: string;
  pixMinCents: number;
  pixMaxCents: number;
  callEnabled: boolean;
  avatarColor: string;
  active: boolean;
  slots: number[];
  createdAt: string;
}

interface AcquirerStatus { gateway: string; apiKey: string; enabled: boolean; }

const GATEWAYS = [
  { id: "woovi",       label: "Woovi" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "asaas",       label: "Asaas" },
  { id: "pagarme",     label: "Pagar.me" },
];

const AVATAR_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "A";
}

function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 800, color: WHITE, flexShrink: 0, letterSpacing: -0.5,
    }}>
      {initials(name)}
    </div>
  );
}

function Toggle({ active, onChange, disabled }: { active: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title={active ? "Clique para desativar agente" : "Clique para ativar agente"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 14px", borderRadius: 99, cursor: disabled ? "not-allowed" : "pointer",
        border: `1.5px solid ${active ? "#bbf7d0" : BORDER}`,
        background: active ? "#f0fdf4" : "#f9fafb",
        transition: "all 0.15s", opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        width: 36, height: 20, borderRadius: 10,
        background: active ? GREEN : "#d1d5db",
        display: "flex", alignItems: "center",
        padding: "0 2px", transition: "background 0.2s", flexShrink: 0,
      }}>
        <span style={{
          width: 16, height: 16, borderRadius: "50%", background: WHITE,
          transform: active ? "translateX(16px)" : "translateX(0)",
          transition: "transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? GREEN_DARK : GRAY }}>
        {active ? "Ativo" : "Inativo"}
      </span>
    </button>
  );
}

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 13px", borderRadius: 8,
  border: `1px solid ${BORDER}`, fontSize: 13.5, outline: "none",
  color: BLACK, boxSizing: "border-box", background: WHITE,
};
const TEXTAREA: React.CSSProperties = {
  ...INPUT, resize: "vertical", minHeight: 100, fontFamily: "inherit", lineHeight: 1.6,
};
const LABEL: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: "#374151",
  display: "block", marginBottom: 5, letterSpacing: 0.2,
};

export function SdrAgente() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [slotNames, setSlotNames] = useState<Record<number, string>>({});

  // Form state
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPrompt, setFPrompt] = useState("");
  const [fSpecialties, setFSpecialties] = useState<string[]>([]);
  const [fSpecInput, setFSpecInput] = useState("");
  const [fPayLinks, setFPayLinks] = useState<PaymentLink[]>([]);
  const [fCallEnabled, setFCallEnabled] = useState(false);
  const [fPixGateway, setFPixGateway] = useState("");
  const [fPixDescription, setFPixDescription] = useState("");
  const [fPixMinReais, setFPixMinReais] = useState("");
  const [fPixMaxReais, setFPixMaxReais] = useState("");
  const [fColor, setFColor] = useState(AVATAR_COLORS[0]);
  const [fSlots, setFSlots] = useState<number[]>([]);
  const [acquirers, setAcquirers] = useState<AcquirerStatus[]>([]);

  async function loadAgents(): Promise<Agent[]> {
    try {
      const r = await fetch("/api/sdr/agents", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const list: Agent[] = d.agents ?? [];
        setAgents(list);
        return list;
      }
    } finally { setLoading(false); }
    return [];
  }

  async function loadSlotNames() {
    try {
      const r = await fetch("/api/sdr/plan/current", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const names: Record<number, string> = {};
        for (let i = 1; i <= 5; i++) names[i] = `Slot ${i}`;
        for (const s of (d.slots ?? [])) names[s.slotNumber] = s.name;
        setSlotNames(names);
      } else {
        const names: Record<number, string> = {};
        for (let i = 1; i <= 5; i++) names[i] = `Slot ${i}`;
        setSlotNames(names);
      }
    } catch {
      const names: Record<number, string> = {};
      for (let i = 1; i <= 5; i++) names[i] = `Slot ${i}`;
      setSlotNames(names);
    }
  }

  async function loadAcquirers() {
    try {
      const r = await fetch("/api/sdr/acquirers", { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAcquirers(d.acquirers ?? []); }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadAgents();
    loadSlotNames();
    loadAcquirers();
  }, []);

  function openCreate() {
    setFName(""); setFDesc(""); setFPrompt("");
    setFSpecialties([]); setFSpecInput(""); setFPayLinks([]);
    setFCallEnabled(false);
    setFPixGateway(""); setFPixDescription(""); setFPixMinReais(""); setFPixMaxReais("");
    setFColor(AVATAR_COLORS[0]); setFSlots([]);
    setSelected(null); setError(""); setMode("create");
  }

  function openEdit(agent: Agent) {
    setFName(agent.name); setFDesc(agent.description); setFPrompt(agent.prompt);
    setFSpecialties([...agent.specialties]); setFSpecInput("");
    setFPayLinks(agent.paymentLinks.map(p => ({ ...p })));
    setFCallEnabled(agent.callEnabled ?? false);
    setFPixGateway(agent.pixGateway || (agent.wooviEnabled ? "woovi" : ""));
    setFPixDescription(agent.pixDescription ?? "");
    setFPixMinReais(agent.pixMinCents > 0 ? (agent.pixMinCents / 100).toFixed(2) : "");
    setFPixMaxReais(agent.pixMaxCents > 0 ? (agent.pixMaxCents / 100).toFixed(2) : "");
    setFColor(agent.avatarColor); setFSlots([...agent.slots]);
    setSelected(agent); setError(""); setMode("edit");
  }

  async function handleSave() {
    if (!fName.trim()) { setError("O nome do agente é obrigatório"); return; }
    setSaving(true); setError("");
    try {
      const toReaisCents = (s: string) => {
        const v = parseFloat(s.replace(",", "."));
        return isNaN(v) || v <= 0 ? 0 : Math.round(v * 100);
      };
      const body = {
        name: fName.trim(), description: fDesc.trim(), prompt: fPrompt.trim(),
        specialties: fSpecialties, paymentLinks: fPayLinks, avatarColor: fColor,
        pixGateway: fPixGateway,
        pixDescription: fPixDescription.trim(),
        pixMinCents: toReaisCents(fPixMinReais),
        pixMaxCents: toReaisCents(fPixMaxReais),
        callEnabled: fCallEnabled,
        slots: fSlots,
      };
      const isCreate = mode === "create";
      const url = isCreate ? "/api/sdr/agents" : `/api/sdr/agents/${selected!.id}`;
      const method = isCreate ? "POST" : "PUT";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Erro ao salvar"); return; }
      const saved = await r.json();
      const list = await loadAgents();
      const savedId: number = saved.agent?.id ?? selected?.id;
      const found = list.find(a => a.id === savedId) ?? null;
      setSelected(found);
      setMode("view");
    } catch { setError("Erro de rede"); }
    finally { setSaving(false); }
  }

  async function handleToggle(agentId: number) {
    setToggling(agentId);
    try {
      const r = await fetch(`/api/sdr/agents/${agentId}/toggle`, { method: "PATCH", credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, active: d.active } : a));
      if (selected?.id === agentId) setSelected(prev => prev ? { ...prev, active: d.active } : null);
    } finally { setToggling(null); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/sdr/agents/${id}`, { method: "DELETE", credentials: "include" });
      setAgents(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) { setSelected(null); setMode("view"); }
    } finally { setDeletingId(null); }
  }

  function addSpecialty() {
    const v = fSpecInput.trim();
    if (v && !fSpecialties.includes(v)) { setFSpecialties(prev => [...prev, v]); }
    setFSpecInput("");
  }

  function toggleFormSlot(slot: number) {
    setFSlots(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]);
  }

  const isFormMode = mode === "create" || mode === "edit";
  const viewAgent = mode === "view" ? selected : null;

  return (
    <Layout>
      <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>

        {/* ── Left: Agent List ── */}
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", background: WHITE }}>
          <div style={{ padding: "20px 16px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: BLACK, margin: 0, marginBottom: 12 }}>Agente SDR</h1>
            <button onClick={openCreate} style={{
              width: "100%", padding: "9px", borderRadius: 8, border: "none",
              background: GREEN, color: WHITE, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>
              + Criar agente
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: GRAY, fontSize: 13 }}>Carregando…</div>
            )}
            {!loading && agents.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 20px", color: GRAY }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}>
                    <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
                  </svg>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Nenhum agente criado</div>
                <div style={{ fontSize: 12.5, color: GRAY, lineHeight: 1.5 }}>Crie seu primeiro agente SDR e conecte em um slot WhatsApp</div>
              </div>
            )}
            {agents.map(agent => {
              const isActive = selected?.id === agent.id;
              return (
                <div key={agent.id} style={{
                  borderRadius: 10, marginBottom: 4, outline: isActive ? `2px solid #bbf7d0` : "none",
                  background: isActive ? "#f0fdf4" : "transparent", transition: "all 0.12s",
                }}>
                  <button onClick={() => { setSelected(agent); setMode("view"); }}
                    style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "transparent", borderRadius: 10, padding: "11px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={agent.name} color={agent.avatarColor} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: BLACK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {agent.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {agent.description || "Sem descrição"}
                        </div>
                      </div>
                    </div>
                    {agent.slots.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7, marginLeft: 46 }}>
                        {agent.slots.map(s => (
                          <span key={s} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#f0fdf4", border: "1px solid #bbf7d0", color: GREEN_DARK }}>
                            {slotNames[s] ?? `Slot ${s}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                  {/* Toggle inline na lista */}
                  <div style={{ padding: "0 12px 10px 58px" }}>
                    <Toggle active={agent.active} disabled={toggling === agent.id} onChange={() => handleToggle(agent.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Detail / Form ── */}
        <div style={{ flex: 1, overflowY: "auto", background: OFF_WHITE }}>

          {/* Empty state */}
          {!selected && !isFormMode && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 16, color: GRAY }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={BORDER} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
              </svg>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>Selecione ou crie um agente</div>
                <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>Configure prompt, especialidades e links de pagamento</div>
              </div>
            </div>
          )}

          {/* ── VIEW MODE ── */}
          {viewAgent && !isFormMode && (
            <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 32px" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
                <Avatar name={viewAgent.name} color={viewAgent.avatarColor} size={56} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: BLACK, margin: "0 0 8px" }}>{viewAgent.name}</h2>
                  <div style={{ fontSize: 14, color: GRAY, marginBottom: 12 }}>{viewAgent.description || "Sem descrição"}</div>
                  {/* Toggle proeminente */}
                  <Toggle
                    active={viewAgent.active}
                    disabled={toggling === viewAgent.id}
                    onChange={() => handleToggle(viewAgent.id)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openEdit(viewAgent)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, fontSize: 13, fontWeight: 600, color: BLACK, cursor: "pointer" }}>
                    Editar
                  </button>
                  <button onClick={() => { if (confirm(`Excluir "${viewAgent.name}"?`)) handleDelete(viewAgent.id); }}
                    disabled={deletingId === viewAgent.id}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #fecaca", background: WHITE, fontSize: 13, fontWeight: 600, color: "#ef4444", cursor: "pointer" }}>
                    {deletingId === viewAgent.id ? "…" : "Excluir"}
                  </button>
                </div>
              </div>

              {/* AI Status banner */}
              <div style={{
                border: `1px solid ${viewAgent.active ? "#bbf7d0" : BORDER}`,
                background: viewAgent.active ? "#f0fdf4" : "#f9fafb",
                borderRadius: 12, padding: "14px 18px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: viewAgent.active ? "#dcfce7" : "#f3f4f6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={viewAgent.active ? GREEN_DARK : GRAY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: viewAgent.active ? GREEN_DARK : BLACK }}>
                    {viewAgent.active ? "Agente IA ativo — respondendo mensagens automaticamente" : "Agente IA inativo — não está respondendo"}
                  </div>
                  <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>
                    {viewAgent.active
                      ? `Todas as novas mensagens nos slots vinculados são respondidas pelo agente`
                      : "Ative o toggle acima para o agente começar a responder via IA"}
                  </div>
                </div>
              </div>

              {/* Slots */}
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: WHITE, padding: "20px 22px", marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 14 }}>WhatsApp vinculado</div>
                {viewAgent.slots.length === 0
                  ? (
                    <div style={{ fontSize: 13, color: GRAY }}>
                      Nenhum slot vinculado — clique em <strong>Editar</strong> e selecione os slots onde este agente deve atuar.
                    </div>
                  )
                  : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {viewAgent.slots.map(s => (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 7, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: GREEN_DARK }}>{slotNames[s] ?? `Slot ${s}`}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>

              {/* Prompt */}
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: WHITE, padding: "20px 22px", marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 10 }}>Prompt / Personalidade</div>
                {viewAgent.prompt
                  ? <p style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{viewAgent.prompt}</p>
                  : <p style={{ fontSize: 13.5, color: GRAY, fontStyle: "italic", margin: 0 }}>Nenhum prompt configurado</p>
                }
              </div>

              {/* Specialties */}
              {viewAgent.specialties.length > 0 && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: WHITE, padding: "20px 22px", marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 12 }}>Especialidades</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {viewAgent.specialties.map((s, i) => (
                      <span key={i} style={{ background: OFF_WHITE, border: `1px solid ${BORDER}`, color: "#374151", fontSize: 12.5, padding: "4px 12px", borderRadius: 99, fontWeight: 500 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Links */}
              {viewAgent.paymentLinks.length > 0 && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: WHITE, padding: "20px 22px", marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 12 }}>Links de Pagamento</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {viewAgent.paymentLinks.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: `1px solid ${BORDER}`, borderRadius: 9 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: BLACK, minWidth: 100 }}>{p.label || "Link"}</span>
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "#3b82f6", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.url}</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PIX Gateway */}
              {(() => {
                const gw = viewAgent.pixGateway || (viewAgent.wooviEnabled ? "woovi" : "");
                const gwLabel = GATEWAYS.find(g => g.id === gw)?.label ?? gw;
                return (
                  <div style={{ border: `1px solid ${gw ? "#bbf7d0" : BORDER}`, borderRadius: 14, background: gw ? "#f0fdf4" : WHITE, padding: "20px 22px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: gw ? "#dcfce7" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={gw ? GREEN_DARK : GRAY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: gw ? GREEN_DARK : BLACK }}>
                          Pagamento PIX — {gw ? `${gwLabel} ativo` : "desabilitado"}
                        </div>
                        {gw && (
                          <div style={{ fontSize: 12.5, color: GRAY, marginTop: 4 }}>
                            {viewAgent.pixDescription && <span>{viewAgent.pixDescription}</span>}
                            {viewAgent.pixMinCents > 0 && <span style={{ marginLeft: viewAgent.pixDescription ? 8 : 0 }}>· min R$ {(viewAgent.pixMinCents / 100).toFixed(2).replace(".", ",")}</span>}
                            {viewAgent.pixMaxCents > 0 && <span> · max R$ {(viewAgent.pixMaxCents / 100).toFixed(2).replace(".", ",")}</span>}
                          </div>
                        )}
                        {!gw && <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>Clique em Editar para habilitar cobranças PIX automáticas</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── CREATE / EDIT FORM ── */}
          {isFormMode && (
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
                {fName ? <Avatar name={fName} color={fColor} size={48} /> : (
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: BLACK, margin: 0, marginBottom: 2 }}>
                    {mode === "create" ? "Novo agente" : `Editando: ${selected?.name}`}
                  </h2>
                  <div style={{ fontSize: 12.5, color: GRAY }}>Configure a identidade e prompt do seu agente SDR</div>
                </div>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#b91c1c" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Nome */}
                <div>
                  <label style={LABEL}>Nome do agente *</label>
                  <input style={INPUT} value={fName} onChange={e => setFName(e.target.value)} placeholder="Ex: Bot de Vendas, Suporte IA, Agente Cobrança…" />
                </div>

                {/* Cor do avatar */}
                <div>
                  <label style={LABEL}>Cor do avatar</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c} onClick={() => setFColor(c)} style={{
                        width: 28, height: 28, borderRadius: "50%", background: c, border: "none", cursor: "pointer",
                        outline: fColor === c ? "3px solid #374151" : "none", outlineOffset: 2,
                      }} />
                    ))}
                  </div>
                </div>

                {/* Descrição */}
                <div>
                  <label style={LABEL}>Descrição curta</label>
                  <input style={INPUT} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Ex: Agente especializado em vendas de planos premium" />
                </div>

                {/* Prompt */}
                <div>
                  <label style={LABEL}>Prompt / Personalidade do agente</label>
                  <textarea style={TEXTAREA} value={fPrompt} onChange={e => setFPrompt(e.target.value)}
                    placeholder={`Você é um assistente de vendas da VolatusNet. Seu objetivo é qualificar leads e apresentar nossos planos de forma consultiva.\n\nSempre seja educado, responda em português, e nunca prometa algo que não está no catálogo...`}
                    rows={7}
                  />
                  <div style={{ fontSize: 11.5, color: GRAY, marginTop: 5 }}>
                    Este prompt define a personalidade do agente IA — ele é enviado como instrução de sistema para o GPT a cada conversa
                  </div>
                </div>

                {/* WhatsApp Slots */}
                <div>
                  <label style={LABEL}>WhatsApp vinculado — selecione os slots que este agente vai atender</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2, 3, 4, 5].map(slot => {
                      const attached = fSlots.includes(slot);
                      return (
                        <button key={slot} onClick={() => toggleFormSlot(slot)} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "11px 16px", borderRadius: 10, cursor: "pointer",
                          border: attached ? `2px solid ${GREEN}` : `1.5px solid ${BORDER}`,
                          background: attached ? "#f0fdf4" : WHITE, transition: "all 0.12s",
                          textAlign: "left",
                        }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${attached ? GREEN : "#d1d5db"}`,
                            background: attached ? GREEN : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {attached && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="2 6 5 9 10 3"/>
                              </svg>
                            )}
                          </span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: attached ? GREEN_DARK : BLACK }}>
                              {slotNames[slot] ?? `Slot ${slot}`}
                            </span>
                            <span style={{ fontSize: 12, color: GRAY, marginLeft: 8 }}>
                              · Slot {slot}
                            </span>
                          </div>
                          {attached && (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN_DARK }}>Selecionado</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: GRAY, marginTop: 6 }}>
                    O agente vai responder automaticamente todas as novas mensagens recebidas nestes slots quando estiver ativo
                  </div>
                </div>

                {/* Especialidades */}
                <div>
                  <label style={LABEL}>Especialidades</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input style={{ ...INPUT, flex: 1 }} value={fSpecInput} onChange={e => setFSpecInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSpecialty(); } }}
                      placeholder="Ex: Vendas, Suporte, Cobrança, Agendamento…" />
                    <button onClick={addSpecialty} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, fontSize: 13, fontWeight: 600, color: BLACK, cursor: "pointer", whiteSpace: "nowrap" }}>
                      + Adicionar
                    </button>
                  </div>
                  {fSpecialties.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {fSpecialties.map((s, i) => (
                        <span key={i} style={{ background: OFF_WHITE, border: `1px solid ${BORDER}`, color: "#374151", fontSize: 12.5, padding: "4px 10px", borderRadius: 99, display: "flex", alignItems: "center", gap: 6 }}>
                          {s}
                          <button onClick={() => setFSpecialties(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: GRAY, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Links de Pagamento */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ ...LABEL, margin: 0 }}>Links de Pagamento</label>
                    <button onClick={() => setFPayLinks(prev => [...prev, { label: "", url: "" }])} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: BLACK, cursor: "pointer" }}>
                      + Adicionar
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: GRAY, marginBottom: 8 }}>
                    O agente inclui esses links nas respostas quando o cliente perguntar sobre preços ou pagamento
                  </div>
                  {fPayLinks.length === 0 && (
                    <div style={{ fontSize: 12.5, color: GRAY, fontStyle: "italic" }}>Nenhum link ainda — adicione links de checkout, Pix, planos, etc.</div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fPayLinks.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input style={{ ...INPUT, width: 140, flexShrink: 0 }} value={p.label} onChange={e => setFPayLinks(prev => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))} placeholder="Rótulo" />
                        <input style={{ ...INPUT, flex: 1 }} value={p.url} onChange={e => setFPayLinks(prev => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))} placeholder="https://..." />
                        <button onClick={() => setFPayLinks(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: GRAY, fontSize: 18, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PIX Gateway */}
                <div style={{ border: `1px solid ${fPixGateway ? "#bbf7d0" : BORDER}`, borderRadius: 12, padding: "18px 20px", background: fPixGateway ? "#f0fdf4" : WHITE, transition: "all 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: fPixGateway ? "#dcfce7" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={fPixGateway ? GREEN_DARK : GRAY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: fPixGateway ? GREEN_DARK : BLACK }}>Pagamento PIX</div>
                      <div style={{ fontSize: 11.5, color: GRAY }}>O agente gera cobranças e envia o link/código PIX no WhatsApp</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {/* Desabilitado */}
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${!fPixGateway ? GREEN : BORDER}`, background: !fPixGateway ? "#f0fdf4" : WHITE }}>
                      <input type="radio" name="pixGateway" checked={!fPixGateway} onChange={() => setFPixGateway("")} style={{ accentColor: GREEN }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: !fPixGateway ? GREEN_DARK : BLACK }}>Desabilitado</span>
                    </label>

                    {GATEWAYS.map(gw => {
                      const acq = acquirers.find(a => a.gateway === gw.id);
                      const configured = !!(acq?.apiKey?.trim());
                      const isSelected = fPixGateway === gw.id;
                      return (
                        <label key={gw.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: configured ? "pointer" : "default", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${isSelected ? GREEN : BORDER}`, background: isSelected ? "#f0fdf4" : WHITE, opacity: configured ? 1 : 0.55 }}>
                          <input type="radio" name="pixGateway" checked={isSelected} onChange={() => configured && setFPixGateway(gw.id)} disabled={!configured} style={{ accentColor: GREEN }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isSelected ? GREEN_DARK : BLACK }}>{gw.label}</span>
                          {configured
                            ? <span style={{ fontSize: 11, color: GREEN_DARK, background: "#dcfce7", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>Configurado</span>
                            : <a href="/sdr/adquirentes" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}>Configurar →</a>
                          }
                        </label>
                      );
                    })}
                  </div>

                  {fPixGateway && (
                    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid #bbf7d0`, paddingTop: 14 }}>
                      <div>
                        <label style={LABEL}>Descrição do produto / serviço</label>
                        <input style={INPUT} value={fPixDescription} onChange={e => setFPixDescription(e.target.value)}
                          placeholder="Ex: Assinatura mensal, Produto X, Consultoria…" />
                        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 4 }}>Aparece na cobrança PIX gerada pelo agente</div>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <label style={LABEL}>Valor mínimo (R$)</label>
                          <input style={INPUT} type="number" min="0" step="0.01" value={fPixMinReais} onChange={e => setFPixMinReais(e.target.value)} placeholder="Ex: 50.00" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={LABEL}>Valor máximo (R$)</label>
                          <input style={INPUT} type="number" min="0" step="0.01" value={fPixMaxReais} onChange={e => setFPixMaxReais(e.target.value)} placeholder="Ex: 500.00" />
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: GRAY, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "8px 12px" }}>
                        💡 O agente negocia o valor com o cliente e, quando fechado, inclui a tag <code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>[GERAR_PIX:valor]</code> na resposta — o sistema processa e envia o link/código PIX automaticamente.
                      </div>
                    </div>
                  )}
                </div>

                {/* Call scheduling toggle */}
                <div style={{ border: `1px solid ${fCallEnabled ? "#bbf7d0" : BORDER}`, borderRadius: 12, padding: "18px 20px", background: fCallEnabled ? "#f0fdf4" : WHITE, transition: "all 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: fCallEnabled ? "#dcfce7" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📹</div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: fCallEnabled ? GREEN_DARK : BLACK }}>Agendamento de Call</div>
                        <div style={{ fontSize: 12, color: GRAY, marginTop: 1 }}>Agente negocia data/hora e agenda automaticamente</div>
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <div
                        onClick={() => setFCallEnabled(v => !v)}
                        style={{
                          width: 40, height: 22, borderRadius: 11, background: fCallEnabled ? GREEN : "#d1d5db",
                          position: "relative", cursor: "pointer", transition: "background 0.2s",
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", background: "#fff",
                          position: "absolute", top: 2, left: fCallEnabled ? 20 : 2, transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </div>
                    </label>
                  </div>
                  {fCallEnabled && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: GRAY }}>
                      💡 O agente negocia data e horário com o lead e inclui a tag <code style={{ background: "#dcfce7", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>[AGENDAR_CALL:data]</code> na resposta — o sistema cria a sala de vídeo, registra o agendamento e envia o link automaticamente.
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
                  <button onClick={handleSave} disabled={saving} style={{ padding: "11px 28px", borderRadius: 8, border: "none", background: GREEN, color: WHITE, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Salvando…" : mode === "create" ? "Criar agente" : "Salvar alterações"}
                  </button>
                  <button onClick={() => { setMode("view"); }} style={{ padding: "11px 22px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, fontSize: 14, fontWeight: 600, color: BLACK, cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
