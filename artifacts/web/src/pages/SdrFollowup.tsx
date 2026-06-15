import { useState, useEffect, useCallback } from "react";
import { Layout } from "../components/Layout";

const STAGES = [
  { label: "30 minutos", desc: "Check-in leve, sem pressao" },
  { label: "1 hora",     desc: "Entrega valor relacionado a dor mencionada" },
  { label: "4 horas",    desc: "Ancoragem emocional na dor principal do cliente" },
  { label: "12 horas",   desc: "Prova social ou escassez sutil no contexto" },
  { label: "1 dia",      desc: "Pergunta direta com abertura sem culpa" },
  { label: "2 dias",     desc: "Encerramento elegante, porta aberta" },
];

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
        background: active ? "#111" : "#d1d5db",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 4, left: active ? 28 : 4,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", display: "block",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

export function SdrFollowup() {
  const [maxSlots, setMaxSlots] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function fetchPlan() {
    try {
      const r = await fetch("/api/sdr/plan/current", { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        if (d.plan?.maxSlots) setMaxSlots(d.plan.maxSlots);
      }
    } catch {}
  }

  const fetchSettings = useCallback(async (slot: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/sdr/followup/settings?slot=${slot}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setEnabled(d.enabled ?? false);
        setAiPrompt(d.aiPrompt ?? "");
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    fetchSettings(1);
  }, [fetchSettings]);

  function switchSlot(slot: number) {
    setSelectedSlot(slot);
    fetchSettings(slot);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/sdr/followup/settings?slot=${selectedSlot}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, aiPrompt }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {} finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        padding: "28px 32px", boxSizing: "border-box", overflow: "hidden",
      }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: -0.4 }}>Follow-up IA</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>
              Detecta silencio e reengaja clientes automaticamente com base na conversa
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {saved && <div style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>Configuracoes salvas</div>}
            <button
              onClick={save}
              disabled={saving || loading}
              style={{
                padding: "10px 28px", borderRadius: 9, border: "none",
                background: "#111", cursor: saving ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 700, color: "#fff",
                opacity: saving || loading ? 0.6 : 1,
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: "flex", gap: 20, flex: 1, overflow: "hidden" }}>

          {/* LEFT — controls */}
          <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Como funciona */}
            <div style={{
              background: "#f7f7f7", border: "1px solid #e8e8e8", borderRadius: 12, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Como funciona
              </div>
              <div style={{ fontSize: 12.5, color: "#555", lineHeight: 1.65 }}>
                Quando voce envia uma mensagem e o contato para de responder, o agente le o
                <strong style={{ color: "#111" }}> historico completo</strong> da conversa e envia mensagens
                personalizadas em cada intervalo. Se o contato responder, a sequencia e cancelada automaticamente.
              </div>
            </div>

            {/* Slot selector */}
            {maxSlots > 1 && (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                  Conexao
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {Array.from({ length: maxSlots }, (_, i) => i + 1).map(slot => (
                    <button
                      key={slot}
                      onClick={() => switchSlot(slot)}
                      style={{
                        padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                        border: `1.5px solid ${selectedSlot === slot ? "#111" : "#e0e0e0"}`,
                        background: selectedSlot === slot ? "#111" : "#fff",
                        color: selectedSlot === slot ? "#fff" : "#555",
                        transition: "all 0.15s",
                      }}
                    >
                      Slot {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle */}
            <div style={{
              background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "18px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              opacity: loading ? 0.6 : 1, transition: "opacity 0.2s",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                  Agente ativo
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                  {enabled ? "Monitorando conversas" : "Desativado"}
                </div>
              </div>
              <Toggle active={enabled} onChange={() => setEnabled(v => !v)} />
            </div>
          </div>

          {/* RIGHT — stages + prompt */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>

            {/* Stages */}
            <div style={{
              background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "18px 20px", flexShrink: 0,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>
                Sequencia automatica
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {STAGES.map((s, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 9,
                    background: "#f9f9f9", border: "1px solid #ebebeb",
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: enabled ? "#111" : "#d1d5db",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10.5, fontWeight: 800, color: "#fff",
                      transition: "background 0.2s",
                    }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111" }}>{s.label}</div>
                      <div style={{ fontSize: 11.5, color: "#888" }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Prompt */}
            <div style={{
              background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                Instrucao personalizada <span style={{ fontWeight: 400, color: "#ccc" }}>(opcional)</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#777", marginBottom: 12, lineHeight: 1.6 }}>
                O agente <strong style={{ color: "#444" }}>sempre</strong> le o historico completo e faz auditoria automatica antes de enviar.
                Use para definir identidade, tom ou contexto do seu negocio.
              </div>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Exemplo: Voce representa a empresa XYZ, especializada em [seu nicho]. Nosso produto resolve [dor principal]. Mantenha tom descontraido e proximo."
                style={{
                  flex: 1, border: "1px solid #e0e0e0", borderRadius: 9,
                  padding: "12px 14px", fontSize: 13, color: "#333", resize: "none",
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  lineHeight: 1.6, background: "#fafafa",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
