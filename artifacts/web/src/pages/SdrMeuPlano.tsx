import { useState, useEffect, useCallback } from "react";
import { Layout } from "../components/Layout";
import { useAuth } from "../lib/use-auth";

function apiUrl(path: string) {
  return `/api/${path}`;
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type PlanType = "starter" | "iniciante";

interface SdrPlan { id: number; userId: number; planType: PlanType; maxSlots: number; purchasedAt: string; updatedAt: string }
interface SdrSlot  { id: number; userId: number; slotNumber: number; name: string; updatedAt: string }
interface SdrOrder { id: number; planType: PlanType; maxSlots: number; valueCents: number; correlationId: string; status: string; createdAt: string }

const PLAN_DEFS: Record<string, { label: string; price: string; slots: number; desc: string; features: string[] }> = {
  starter:   { label: "Starter", price: "R$ 147,90", slots: 1, desc: "Tudo que você precisa para vender pelo WhatsApp com IA.", features: ["1 número WhatsApp", "Agentes de IA ilimitados", "IA incluída", "Central de atendimento", "Gestão de contatos", "Tags ilimitadas", "Disparo em massa", "Suporte incluso"] },
  iniciante: { label: "Starter", price: "R$ 147,90", slots: 1, desc: "Tudo que você precisa para vender pelo WhatsApp com IA.", features: ["1 número WhatsApp", "Agentes de IA ilimitados", "IA incluída", "Central de atendimento", "Gestão de contatos", "Tags ilimitadas", "Disparo em massa", "Suporte incluso"] },
};

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ─── Pill component ─────────────────────────────────────────────────────────── */
function Pill({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: ok ? "rgba(34,197,94,0.1)" : "rgba(0,0,0,0.06)",
      color: ok ? "#15803d" : "rgba(0,0,0,0.45)",
      border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(0,0,0,0.1)"}`,
    }}>
      {ok ? "Aprovado" : "Pendente"}
    </span>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */
export function SdrMeuPlano() {
  const { user } = useAuth();

  /* plan state */
  const [currentPlan, setCurrentPlan] = useState<SdrPlan | null>(null);
  const [slots, setSlots]             = useState<SdrSlot[]>([]);
  const [orders, setOrders]           = useState<SdrOrder[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(true);

  /* tab */
  const [tab, setTab] = useState<"plano" | "slots" | "historico">("plano");

  /* purchase flow */
  const [buying, setBuying]           = useState<boolean>(false);
  const [form, setForm]               = useState({ name: "", email: "", whatsapp: "", cpf: "" });
  const [pixData, setPixData]         = useState<{ qrCodeImage: string | null; brCode: string | null; correlationId: string; label: string; price: string } | null>(null);
  const [polling, setPolling]         = useState(false);
  const [paidOk, setPaidOk]           = useState(false);
  const [checkoutErr, setCheckoutErr] = useState("");
  const [submitting, setSubmitting]   = useState(false);

  /* rename slot */
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [renameVal, setRenameVal]       = useState("");

  /* toast */
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  /* ── Fetch current plan ── */
  const fetchPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const r = await fetch(apiUrl("sdr/plan/current"), { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setCurrentPlan(d.plan ?? null);
        setSlots(d.slots ?? []);
      }
    } finally { setLoadingPlan(false); }
  }, []);

  useEffect(() => {
    fetchPlan();
    fetchOrders();
  }, [fetchPlan]);

  async function fetchOrders() {
    const r = await fetch(apiUrl("sdr/plan/orders"), { credentials: "include" });
    if (r.ok) { const d = await r.json(); setOrders(d.orders ?? []); }
  }

  /* ── Purchase submit ── */
  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!buying) return;
    setCheckoutErr("");
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl("sdr/plan/purchase"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: "starter", ...form }),
      });
      const d = await r.json();
      if (!r.ok) { setCheckoutErr(d.error ?? "Erro ao gerar PIX"); return; }
      setPixData(d);
      startPolling(d.correlationId);
    } finally { setSubmitting(false); }
  }

  /* ── Poll for payment ── */
  function startPolling(correlationId: string) {
    setPolling(true);
    const iv = setInterval(async () => {
      const r = await fetch(apiUrl(`sdr/plan/status/${correlationId}`), { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d.status === "COMPLETED") {
          clearInterval(iv);
          setPolling(false);
          setPaidOk(true);
          await fetchPlan();
          await fetchOrders();
          setTimeout(() => { setBuying(false); setPixData(null); setPaidOk(false); setTab("slots"); }, 2500);
        }
      }
    }, 4000);
    setTimeout(() => { clearInterval(iv); setPolling(false); }, 600000);
  }

  /* ── Rename slot ── */
  async function saveRename(slotNumber: number) {
    if (!renameVal.trim()) return;
    const r = await fetch(apiUrl(`sdr/slots/${slotNumber}/name`), {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameVal.trim() }),
    });
    if (r.ok) {
      setSlots(prev => prev.map(s => s.slotNumber === slotNumber ? { ...s, name: renameVal.trim() } : s));
      setRenamingSlot(null);
      showToast("Nome do slot atualizado!");
    }
  }

  /* ─── Styles ─────────────────────────────────────────────────────────────── */
  const CARD: React.CSSProperties = {
    background: "#fff", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 12,
    padding: "24px 22px 20px", display: "flex", flexDirection: "column",
    position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };
  const BTN_PRI: React.CSSProperties = {
    padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: "rgba(0,0,0,0.88)", color: "#fff", border: "none", cursor: "pointer",
  };
  const BTN_SEC: React.CSSProperties = {
    padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: "transparent", color: "rgba(0,0,0,0.75)", border: "1.5px solid rgba(0,0,0,0.2)", cursor: "pointer",
  };
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 13, color: "rgba(0,0,0,0.82)", background: "#fff", outline: "none",
    boxSizing: "border-box",
  };
  const TH: React.CSSProperties = {
    padding: "10px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", textAlign: "left",
    borderBottom: "1px solid rgba(0,0,0,0.07)", whiteSpace: "nowrap",
    background: "rgba(0,0,0,0.015)",
  };
  const TD: React.CSSProperties = {
    padding: "13px 16px", fontSize: 13, borderBottom: "1px solid rgba(0,0,0,0.05)",
    verticalAlign: "middle",
  };

  const TABS = [
    { key: "plano" as const, label: "Meu Plano SDR" },
    { key: "slots" as const, label: "Gerenciar Slots" },
    { key: "historico" as const, label: "Histórico" },
  ];

  /* ─── Purchase modal ─────────────────────────────────────────────────────── */
  if (buying) {
    const planDef = PLAN_DEFS["starter"];
    return (
      <Layout>
        <div style={{ padding: "36px 32px 64px", maxWidth: 520, margin: "0 auto" }}>
          {/* Header */}
          <button onClick={() => { setBuying(false); setPixData(null); setPaidOk(false); setCheckoutErr(""); }} style={{ ...BTN_SEC, marginBottom: 24, fontSize: 12 }}>
            ← Voltar
          </button>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: "rgba(0,0,0,0.88)", marginBottom: 4 }}>
            {planDef.label} — {planDef.price}<span style={{ fontSize: 13, fontWeight: 400, color: "rgba(0,0,0,0.4)" }}>/mês</span>
          </h2>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", marginBottom: 28 }}>{planDef.desc}</p>

          {/* PIX payment shown */}
          {paidOk && (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>Pagamento confirmado!</div>
              <div style={{ fontSize: 13, color: "rgba(0,0,0,0.55)" }}>Seu plano SDR foi ativado. Redirecionando para os slots…</div>
            </div>
          )}

          {pixData && !paidOk && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.7)", marginBottom: 16 }}>
                Escaneie o QR Code para pagar via PIX
              </div>
              {pixData.qrCodeImage && (
                <img src={pixData.qrCodeImage} alt="QR Code PIX" style={{ width: 220, height: 220, borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", marginBottom: 16 }} />
              )}
              {pixData.brCode && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 6 }}>Ou copie o código PIX:</div>
                  <div style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 8, padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "rgba(0,0,0,0.7)", wordBreak: "break-all", textAlign: "left", marginBottom: 8 }}>
                    {pixData.brCode}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(pixData!.brCode!).then(() => showToast("Código PIX copiado!")).catch(() => showToast("Copie o código manualmente")); }} style={BTN_SEC}>
                    Copiar código PIX
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {polling && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.5s infinite" }} />}
                {polling ? "Aguardando pagamento…" : "Verificando…"}
              </div>
              <div style={{ marginTop: 16, fontSize: 20, fontWeight: 800, color: "rgba(0,0,0,0.88)" }}>{pixData.price}</div>
            </div>
          )}

          {/* Form */}
          {!pixData && !paidOk && (
            <form onSubmit={handlePurchase} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.6)", display: "block", marginBottom: 5 }}>Nome completo</label>
                <input style={INPUT} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="João Silva" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.6)", display: "block", marginBottom: 5 }}>E-mail</label>
                <input style={INPUT} required type="email" value={form.email || user?.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="voce@email.com" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.6)", display: "block", marginBottom: 5 }}>WhatsApp</label>
                <input style={INPUT} required value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="5511999999999" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.6)", display: "block", marginBottom: 5 }}>CPF ou CNPJ</label>
                <input style={INPUT} required value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              {checkoutErr && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>
                  {checkoutErr}
                </div>
              )}
              <button type="submit" disabled={submitting} style={{ ...BTN_PRI, marginTop: 4, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Gerando PIX…" : `Pagar ${planDef.price} via PIX`}
              </button>
            </form>
          )}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }`}</style>
      </Layout>
    );
  }

  return (
    <Layout>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, padding: "12px 20px", fontSize: 13, boxShadow: "0 8px 28px rgba(0,0,0,0.12)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      <div style={{ padding: "36px 32px 64px", maxWidth: 1020 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(0,0,0,0.88)", margin: 0, marginBottom: 4 }}>Meu Plano SDR</h1>
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", margin: 0 }}>Gerencie seus números de WhatsApp do Katrivo SDR.</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.08)", marginBottom: 36 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "10px 20px", fontSize: 13, fontWeight: tab === t.key ? 600 : 500,
              background: "none", border: "none", cursor: "pointer",
              borderBottom: tab === t.key ? "2px solid rgba(0,0,0,0.85)" : "2px solid transparent",
              color: tab === t.key ? "rgba(0,0,0,0.88)" : "rgba(0,0,0,0.45)",
              marginBottom: -1, transition: "color .12s, border-color .12s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── MEU PLANO SDR ── */}
        {tab === "plano" && (
          <>
            {/* Banner do plano atual */}
            <div style={{ ...CARD, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 36 }}>
              {loadingPlan ? (
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Carregando…</div>
              ) : currentPlan ? (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.4)", marginBottom: 4 }}>Plano ativo</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(0,0,0,0.88)" }}>ComboZap Starter</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>1 número WhatsApp · Agentes de IA ilimitados</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "rgba(0,0,0,0.88)" }}>R$ 147,90</div>
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>/mês</div>
                  </div>
                </>
              ) : (
                <div style={{ width: "100%", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(0,0,0,0.7)", marginBottom: 4 }}>Sem plano SDR ativo</div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Escolha um plano abaixo para começar a usar o Katrivo SDR com WhatsApp real.</div>
                </div>
              )}
            </div>

            {/* Card único — plano Starter */}
            {!currentPlan && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(0,0,0,0.38)", marginBottom: 16 }}>
                  Plano Disponível
                </div>
                <div style={{ maxWidth: 360 }}>
                  {(() => {
                    const def = PLAN_DEFS["starter"];
                    return (
                      <div style={{ ...CARD }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.88)", marginBottom: 8 }}>{def.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(0,0,0,0.88)", marginBottom: 2 }}>{def.price}</div>
                        <div style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", marginBottom: 12 }}>/mês</div>
                        <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", lineHeight: 1.5, marginBottom: 16 }}>{def.desc}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                          {def.features.map(f => (
                            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(0,0,0,0.75)" }}>
                              <span style={{ color: "#15803d", fontWeight: 700 }}>✓</span> {f}
                            </div>
                          ))}
                        </div>
                        <button onClick={() => { setBuying(true); setForm({ name: "", email: user?.email ?? "", whatsapp: "", cpf: "" }); }} style={BTN_PRI}>
                          Assinar agora
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </>
        )}

        {/* ── GERENCIAR SLOTS ── */}
        {tab === "slots" && (
          <>
            {loadingPlan ? (
              <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Carregando…</div>
            ) : !currentPlan ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(0,0,0,0.6)", marginBottom: 8 }}>Sem plano SDR ativo</div>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", marginBottom: 20 }}>Adquira um plano na aba "Meu Plano SDR" para gerenciar seus números.</div>
                <button onClick={() => setTab("plano")} style={BTN_PRI}>Ver planos</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", marginBottom: 20 }}>
                  Seu plano <strong style={{ color: "rgba(0,0,0,0.82)" }}>{PLAN_DEFS[currentPlan.planType].label}</strong> inclui{" "}
                  <strong style={{ color: "rgba(0,0,0,0.82)" }}>{currentPlan.maxSlots}</strong> número{currentPlan.maxSlots > 1 ? "s" : ""} de WhatsApp.
                  Cada número é uma instância independente e isolada.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {slots.map(slot => {
                    const instanceId = `sdr-u${slot.userId}-s${slot.slotNumber}`;
                    const isRenaming = renamingSlot === slot.slotNumber;
                    return (
                      <div key={slot.slotNumber} style={{ ...CARD, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "18px 22px" }}>
                        {/* Slot info */}
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.09)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <WaIcon size={20} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            {isRenaming ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                  autoFocus value={renameVal}
                                  onChange={e => setRenameVal(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") saveRename(slot.slotNumber); if (e.key === "Escape") setRenamingSlot(null); }}
                                  style={{ ...INPUT, width: 160, padding: "5px 10px" }}
                                />
                                <button onClick={() => saveRename(slot.slotNumber)} style={{ ...BTN_PRI, padding: "5px 12px", fontSize: 12 }}>Salvar</button>
                                <button onClick={() => setRenamingSlot(null)} style={{ ...BTN_SEC, padding: "5px 12px", fontSize: 12 }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.88)" }}>{slot.name}</div>
                            )}
                            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", fontFamily: "monospace", marginTop: 2 }}>
                              Slot {slot.slotNumber} · {instanceId}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        {!isRenaming && (
                          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            <button onClick={() => { setRenamingSlot(slot.slotNumber); setRenameVal(slot.name); }} style={{ ...BTN_SEC, padding: "7px 14px", fontSize: 12 }}>
                              Renomear
                            </button>
                            <a href={`/app/sdr/conexao?slot=${slot.slotNumber}`} style={{ ...BTN_PRI, padding: "7px 14px", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                              Gerenciar Conexão
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === "historico" && (
          <>
            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              {orders.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "rgba(0,0,0,0.35)" }}>
                  Nenhum pedido SDR encontrado.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>ID</th>
                      <th style={TH}>Data</th>
                      <th style={TH}>Plano</th>
                      <th style={TH}>Slots</th>
                      <th style={TH}>Valor</th>
                      <th style={TH}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td style={TD}><span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(0,0,0,0.4)" }}>{o.correlationId.slice(-12)}</span></td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{fmtDate(o.createdAt)}</td>
                        <td style={TD}><strong>{PLAN_DEFS[o.planType as PlanType]?.label ?? o.planType}</strong></td>
                        <td style={{ ...TD, textAlign: "center" }}>{o.maxSlots}</td>
                        <td style={{ ...TD, fontWeight: 700 }}>{fmt(o.valueCents)}</td>
                        <td style={TD}><Pill ok={o.status === "COMPLETED"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

/* ── WhatsApp Icon ───────────────────────────────────────────────────────────── */
function WaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#22c55e", flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
    </svg>
  );
}
