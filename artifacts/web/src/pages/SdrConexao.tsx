import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "../components/Layout";
import { useAuth } from "../lib/use-auth";

const API = "/api/sdr/whatsapp";

type SlotStatus = "loading" | "connected" | "connecting" | "disconnected";

interface SlotInfo {
  slotNumber: number;
  name: string;
}

interface SlotState {
  status: SlotStatus;
  qrBase64: string | null;
  phoneInfo: { name?: string; number?: string } | null;
  instanceId: string | null;
}

function defaultSlotState(): SlotState {
  return { status: "loading", qrBase64: null, phoneInfo: null, instanceId: null };
}

// Planos e quantos slots liberam
const PLAN_SLOTS: Record<string, number> = {
  iniciante: 1,
  intermediario: 3,
  empresa: 5,
};

function planLabel(planType: string): string {
  return { iniciante: "SDR Iniciante", intermediario: "SDR Intermediário", empresa: "SDR Empresa" }[planType] ?? planType;
}

function planRequired(slotNumber: number): string {
  if (slotNumber <= 1) return "";
  if (slotNumber <= 3) return "SDR Intermediário";
  return "SDR Empresa";
}

export function SdrConexao() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  // Plano do usuário
  const [maxSlots, setMaxSlots] = useState<number>(1); // 1 slot gratuito sempre
  const [planType, setPlanType] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [planLoading, setPlanLoading] = useState(true);

  // IDs únicos de instância por slot (hash gerado no servidor)
  const [instanceIds, setInstanceIds] = useState<Record<number, string>>({});

  // Slot selecionado
  const [activeSlot, setActiveSlot] = useState(1);

  // Estado de cada slot (1-5)
  const [slotStates, setSlotStates] = useState<Record<number, SlotState>>({
    1: defaultSlotState(),
    2: defaultSlotState(),
    3: defaultSlotState(),
    4: defaultSlotState(),
    5: defaultSlotState(),
  });

  const pollRefs = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  function updateSlot(slot: number, patch: Partial<SlotState>) {
    setSlotStates((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
  }

  function stopPolling(slot: number) {
    if (pollRefs.current[slot]) {
      clearInterval(pollRefs.current[slot]);
      delete pollRefs.current[slot];
    }
  }

  useEffect(() => () => {
    Object.keys(pollRefs.current).forEach((k) => clearInterval(pollRefs.current[Number(k)]));
  }, []);

  // Carrega IDs de instância únicos do servidor
  useEffect(() => {
    fetch(`${API}/instances`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.instances) setInstanceIds(data.instances); })
      .catch(() => {});
  }, []);

  // Carrega plano + slots do usuário
  useEffect(() => {
    fetch("/api/sdr/plan/current", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const plan = data?.plan ?? null;
        const m = plan ? (PLAN_SLOTS[plan.planType] ?? 1) : 1;
        setMaxSlots(m);
        setPlanType(plan?.planType ?? null);
        setSlots(
          Array.from({ length: 5 }, (_, i) => {
            const n = i + 1;
            const found = data?.slots?.find((s: any) => s.slotNumber === n);
            return { slotNumber: n, name: found?.name ?? `WhatsApp ${n}` };
          })
        );
      })
      .catch(() => {
        setMaxSlots(1);
        setSlots(Array.from({ length: 5 }, (_, i) => ({ slotNumber: i + 1, name: `WhatsApp ${i + 1}` })));
      })
      .finally(() => setPlanLoading(false));
  }, []);

  // Verifica status de cada slot desbloqueado ao carregar
  useEffect(() => {
    if (planLoading) return;
    for (let slot = 1; slot <= maxSlots; slot++) {
      checkStatus(slot);
    }
    // Slots bloqueados ficam como "disconnected" (não "loading")
    for (let slot = maxSlots + 1; slot <= 5; slot++) {
      updateSlot(slot, { status: "disconnected" });
    }
  }, [planLoading, maxSlots]);

  const checkStatus = useCallback(async (slot: number) => {
    try {
      const res = await fetch(`${API}/status?slot=${slot}`, { credentials: "include" });
      if (!res.ok) { updateSlot(slot, { status: "disconnected" }); return; }
      const data = await res.json();
      const instanceId: string | null = data.instanceName ?? null;
      if (data.connected) {
        updateSlot(slot, { status: "connected", phoneInfo: data.phone ?? null, instanceId });
      } else {
        updateSlot(slot, { status: "disconnected", instanceId });
      }
    } catch {
      updateSlot(slot, { status: "disconnected" });
    }
  }, []);

  async function refreshQr(slot: number) {
    try {
      const res = await fetch(`${API}/qr?slot=${slot}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.qrcode) updateSlot(slot, { qrBase64: data.qrcode });
    } catch { /* silencioso */ }
  }

  async function pollStatus(slot: number) {
    try {
      const res = await fetch(`${API}/status?slot=${slot}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.connected) {
        stopPolling(slot);
        updateSlot(slot, {
          status: "connected",
          qrBase64: null,
          phoneInfo: data.phone ?? null,
        });
      }
    } catch { /* silencioso */ }
  }

  const [connectError, setConnectError] = useState<string | null>(null);

  async function handleConnect(slot: number) {
    setConnectError(null);
    updateSlot(slot, { status: "connecting", qrBase64: null });

    try {
      const res = await fetch(`${API}/connect?slot=${slot}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        setConnectError(data.error ?? "Erro ao conectar. Tente novamente.");
        updateSlot(slot, { status: "disconnected" });
        return;
      }

      // Instância já estava conectada — mostra imediatamente
      if (data.connected) {
        updateSlot(slot, {
          status: "connected",
          qrBase64: null,
          phoneInfo: data.phone ?? null,
          instanceId: data.instanceName ?? null,
        });
        return;
      }

      // QR gerado — inicia polling 2s + refresh QR a cada 24s
      if (!data.qrcode) {
        setConnectError("QR não disponível. Tente novamente.");
        updateSlot(slot, { status: "disconnected" });
        return;
      }

      updateSlot(slot, { qrBase64: data.qrcode });

      stopPolling(slot);
      let qrTick = 0;
      pollRefs.current[slot] = setInterval(async () => {
        qrTick++;
        await pollStatus(slot);
        if (qrTick % 12 === 0) await refreshQr(slot); // ~24s
      }, 2000);
    } catch {
      setConnectError("Erro de rede. Verifique sua conexão.");
      updateSlot(slot, { status: "disconnected" });
    }
  }

  async function handleDisconnect(slot: number) {
    stopPolling(slot);
    try {
      await fetch(`${API}/disconnect?slot=${slot}`, { method: "DELETE", credentials: "include" });
    } catch { /* ignora */ }
    updateSlot(slot, { status: "disconnected", qrBase64: null, phoneInfo: null });
  }

  function handleCancel(slot: number) {
    stopPolling(slot);
    updateSlot(slot, { status: "disconnected", qrBase64: null });
  }

  const isUnlocked = (slot: number) => slot <= maxSlots;
  const slotName = (slot: number) => slots.find((s) => s.slotNumber === slot)?.name ?? `WhatsApp ${slot}`;
  const instanceName = (slot: number) => slot === 1 ? `sdr-u(seu-id)` : `sdr-u(seu-id)-s${slot}`;
  const activeState = slotStates[activeSlot];

  return (
    <Layout>
      <div style={{ padding: "32px 36px", maxWidth: 820, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, marginBottom: 4 }}>
            Conexão WhatsApp
          </h1>
          <p style={{ fontSize: 13.5, color: "#888", margin: 0 }}>
            Cada slot é isolado — número único, ID permanente por conta
          </p>
        </div>

        {/* Plano badge */}
        {!planLoading && (
          <div style={{ marginBottom: 24 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 14px", borderRadius: 99,
              background: planType ? "#f0fdf4" : "#f9fafb",
              border: `1px solid ${planType ? "#86efac" : "#e5e7eb"}`,
              fontSize: 12.5, fontWeight: 700,
              color: planType ? "#15803d" : "#6b7280",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: planType ? "#22c55e" : "#d1d5db",
              }} />
              {planType ? planLabel(planType) : "Sem plano — 1 slot gratuito"}
              <span style={{ fontWeight: 400, color: planType ? "#16a34a" : "#9ca3af" }}>
                · {maxSlots} slot{maxSlots !== 1 ? "s" : ""} ativo{maxSlots !== 1 ? "s" : ""}
              </span>
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* ── Coluna de slots ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 240, flexShrink: 0 }}>
            {[1, 2, 3, 4, 5].map((slot) => {
              const unlocked = isUnlocked(slot);
              const state = slotStates[slot];
              const isActive = slot === activeSlot;
              const reqPlan = planRequired(slot);

              return (
                <button
                  key={slot}
                  onClick={() => unlocked && setActiveSlot(slot)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 12,
                    border: isActive && unlocked
                      ? "2px solid #111"
                      : "1.5px solid #e5e7eb",
                    background: isActive && unlocked ? "#111" : unlocked ? "#fff" : "#f9fafb",
                    cursor: unlocked ? "pointer" : "default",
                    textAlign: "left", transition: "all 0.12s",
                    opacity: unlocked ? 1 : 0.6,
                  }}
                >
                  {/* Número */}
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isActive && unlocked ? "#fff" : unlocked ? "#f3f4f6" : "#e5e7eb",
                    fontSize: 13, fontWeight: 800,
                    color: isActive && unlocked ? "#111" : unlocked ? "#374151" : "#9ca3af",
                  }}>
                    {unlocked ? slot : <LockIcon small />}
                  </span>

                  {/* Nome + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: isActive && unlocked ? "#fff" : unlocked ? "#111" : "#9ca3af",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {slotName(slot)}
                    </div>
                    <div style={{
                      fontSize: 11.5, marginTop: 1,
                      color: isActive && unlocked ? "#aaa" : "#9ca3af",
                    }}>
                      {!unlocked
                        ? reqPlan
                        : state.status === "loading" ? "verificando..."
                        : state.status === "connected" ? "Conectado"
                        : state.status === "connecting" ? "Aguardando QR..."
                        : "Desconectado"}
                    </div>
                  </div>

                  {/* Status dot */}
                  {unlocked && state.status !== "loading" && (
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background:
                        state.status === "connected" ? "#22c55e"
                        : state.status === "connecting" ? "#f59e0b"
                        : isActive ? "#555" : "#d1d5db",
                    }} />
                  )}
                </button>
              );
            })}

          </div>

          {/* ── Painel QR do slot ativo ── */}
          <div style={{ flex: 1, minWidth: 280 }}>

            {!isUnlocked(activeSlot) ? (
              /* Slot bloqueado */
              <div style={{
                border: "1px solid #e5e7eb", borderRadius: 16,
                background: "#fff", padding: "40px 32px",
                display: "flex", flexDirection: "column", alignItems: "center",
                textAlign: "center",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#f3f4f6", border: "1px solid #e5e7eb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16,
                }}>
                  <LockIcon />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                  Slot {activeSlot} bloqueado
                </div>
                <div style={{ fontSize: 13.5, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
                  Este slot requer o plano <strong>{planRequired(activeSlot)}</strong>.
                  Faça upgrade para conectar mais números.
                </div>
                <button
                  onClick={() => { window.location.href = "/sdr/meu-plano"; }}
                  style={{
                    padding: "11px 28px", borderRadius: 10, border: "none",
                    background: "#111", color: "#fff",
                    fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Ver planos SDR
                </button>
              </div>
            ) : (
              /* Slot desbloqueado — painel QR */
              <div style={{
                border: "1px solid #e5e7eb", borderRadius: 16,
                background: "#fff", padding: "32px",
                display: "flex", flexDirection: "column", alignItems: "center",
              }}>

                {/* Título do slot */}
                <div style={{
                  width: "100%", display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 24,
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>
                      {slotName(activeSlot)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#9ca3af", fontFamily: "monospace", marginTop: 2 }}>
                      {activeState.instanceId ?? instanceIds[activeSlot] ?? "sdr-#…"}
                    </div>
                  </div>
                  {/* Status badge */}
                  <StatusBadge status={activeState.status} />
                </div>

                {/* ── LOADING (verificando status inicial) ── */}
                {activeState.status === "loading" && (
                  <div style={{ padding: "40px 0" }}>
                    <Spinner />
                  </div>
                )}

                {/* ── DESCONECTADO ── */}
                {activeState.status === "disconnected" && (
                  <>
                    {connectError && (
                      <div style={{
                        width: "100%", background: "#fef2f2", border: "1px solid #fecaca",
                        borderRadius: 10, padding: "11px 14px", marginBottom: 16,
                        fontSize: 13, color: "#b91c1c", textAlign: "center",
                      }}>
                        {connectError}
                      </div>
                    )}
                    <div style={{
                      width: 200, height: 200, border: "1.5px dashed #d0d0d0",
                      borderRadius: 16, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      background: "#fafafa", marginBottom: 28, gap: 10,
                    }}>
                      <QrIcon />
                      <span style={{ fontSize: 12.5, color: "#bbb", textAlign: "center", lineHeight: 1.4 }}>
                        Clique em conectar<br />para gerar o QR Code
                      </span>
                    </div>
                    <button
                      onClick={() => handleConnect(activeSlot)}
                      style={{
                        padding: "12px 32px", borderRadius: 10, border: "none",
                        background: "#111", color: "#fff",
                        fontSize: 14.5, fontWeight: 700, cursor: "pointer", width: "100%",
                      }}
                    >
                      Conectar WhatsApp
                    </button>
                  </>
                )}

                {/* ── CONECTANDO — QR ── */}
                {activeState.status === "connecting" && (
                  <>
                    <div style={{
                      width: 220, height: 220,
                      border: "2px solid #e0e0e0", borderRadius: 16,
                      overflow: "hidden", marginBottom: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
                    }}>
                      {activeState.qrBase64
                        ? <img src={activeState.qrBase64} alt="QR Code WhatsApp" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <Spinner />}
                    </div>
                    <p style={{ fontSize: 13, color: "#666", textAlign: "center", margin: "0 0 6px", lineHeight: 1.6 }}>
                      Abra o WhatsApp no celular<br />
                      <strong>Menu → Dispositivos conectados → Conectar</strong>
                    </p>
                    <p style={{ fontSize: 11.5, color: "#aaa", textAlign: "center", margin: "0 0 24px" }}>
                      O QR Code é atualizado automaticamente a cada 30s
                    </p>
                    <button
                      onClick={() => handleCancel(activeSlot)}
                      style={{
                        width: "100%", padding: "11px", borderRadius: 9,
                        border: "1px solid #e0e0e0", background: "#fff",
                        color: "#555", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                )}

                {/* ── CONECTADO ── */}
                {activeState.status === "connected" && (
                  <>
                    <div style={{
                      width: 72, height: 72, borderRadius: "50%",
                      background: "#f0fdf4", border: "2px solid #bbf7d0",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 16,
                    }}>
                      <CheckIcon />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 4 }}>
                      {activeState.phoneInfo?.number ?? "WhatsApp conectado"}
                    </div>
                    {activeState.phoneInfo?.name && (
                      <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
                        {activeState.phoneInfo.name}
                      </div>
                    )}
                    {!activeState.phoneInfo?.name && (
                      <div style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Conexão ativa</div>
                    )}
                    <div style={{
                      width: "100%", border: "1px solid #f0f0f0", borderRadius: 10,
                      padding: "16px", marginBottom: 20, background: "#fafafa",
                    }}>
                      {[
                        { label: "Status", value: "Online ✓" },
                        { label: "Slot", value: `${activeSlot} — ${slotName(activeSlot)}` },
                      ].map((s) => (
                        <div key={s.label} style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "7px 0", borderBottom: "1px solid #f0f0f0",
                        }}>
                          <span style={{ fontSize: 13, color: "#888" }}>{s.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleDisconnect(activeSlot)}
                      style={{
                        padding: "11px", borderRadius: 9, border: "1px solid #fca5a5",
                        background: "#fff", color: "#ef4444", fontSize: 13.5,
                        fontWeight: 600, cursor: "pointer", width: "100%",
                      }}
                    >
                      Desconectar
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Card instruções — só quando desconectado e desbloqueado */}
            {isUnlocked(activeSlot) && activeState.status === "disconnected" && (
              <div style={{
                marginTop: 16, border: "1px solid #e8e8e8", borderRadius: 14,
                background: "#fafafa", padding: "20px 20px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 12 }}>
                  Como conectar
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    "Clique em «Conectar WhatsApp» — o QR real é gerado em segundos",
                    "Abra o WhatsApp no celular → Menu (⋮) → Dispositivos conectados",
                    "Toque em «Conectar um dispositivo» e aponte a câmera para o QR",
                    "Pronto! A conexão é mantida em segundo plano automaticamente",
                  ].map((text, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "#111", color: "#fff", fontSize: 10.5, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 12.5, color: "#666", lineHeight: 1.5 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatusBadge({ status }: { status: SlotStatus }) {
  const cfg = {
    loading:      { dot: "#d1d5db", label: "Verificando...", bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
    disconnected: { dot: "#d1d5db", label: "Desconectado",  bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
    connecting:   { dot: "#f59e0b", label: "Aguardando QR", bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
    connected:    { dot: "#22c55e", label: "Conectado",     bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
  }[status];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 99,
      border: `1px solid ${cfg.border}`, background: cfg.bg,
      fontSize: 12, fontWeight: 600, color: cfg.text,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot }} />
      {cfg.label}
    </div>
  );
}

function QrIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
      <path d="M14 17h3M17 14v3M20 17v3M20 14h-3"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function LockIcon({ small }: { small?: boolean }) {
  const s = small ? 14 : 22;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={small ? "#9ca3af" : "#d1d5db"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 36, height: 36, border: "3px solid #f0f0f0",
      borderTop: "3px solid #111", borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
