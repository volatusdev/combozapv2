import { useState, useEffect } from "react";
import { Layout } from "../components/Layout";

const GREEN = "#22c55e";
const GREEN_DARK = "#16a34a";
const BORDER = "#e5e7eb";

interface AcquirerStatus {
  gateway: string;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string;
}

interface GatewayDef {
  id: string;
  name: string;
  logoChar: string;
  accent: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  docsUrl: string;
}

const GATEWAYS: GatewayDef[] = [
  {
    id: "woovi",
    name: "Woovi (OpenPix)",
    logoChar: "W",
    accent: "#03d69d",
    description: "Pagamentos PIX instantâneos. Em woovi.com → API/Plugins, copie o App ID.",
    keyLabel: "App ID",
    keyPlaceholder: "Q2xpZW50X0lkOl...",
    docsUrl: "https://developers.woovi.com/docs/apis/api-getting-started",
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    logoChar: "MP",
    accent: "#009ee3",
    description: "PIX, boleto e cartão. Acesse Mercado Pago → Credenciais e copie o Access Token de produção.",
    keyLabel: "Access Token",
    keyPlaceholder: "APP_USR-0000...",
    docsUrl: "https://www.mercadopago.com.br/developers/pt/docs",
  },
  {
    id: "asaas",
    name: "Asaas",
    logoChar: "A",
    accent: "#ff6900",
    description: "PIX, boleto e cartão. No painel Asaas, acesse Minha conta → Integrações → API Keys.",
    keyLabel: "API Key",
    keyPlaceholder: "$aact_YTU5YTE...",
    docsUrl: "https://docs.asaas.com",
  },
  {
    id: "pagarme",
    name: "Pagar.me",
    logoChar: "PM",
    accent: "#65348c",
    description: "Gateway completo. No dashboard Pagar.me, vá em Configurações → Dados da API.",
    keyLabel: "Secret Key",
    keyPlaceholder: "sk_live_...",
    docsUrl: "https://docs.pagar.me",
  },
];

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<unknown>;
}

function GatewayCard({ def, status, onSaved }: { def: GatewayDef; status?: AcquirerStatus; onSaved: () => void }) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [enabled, setEnabled] = useState(status?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(status?.enabled ?? false);
  }, [status?.enabled]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/sdr/acquirers/${def.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput || undefined, enabled }),
      });
      setSaved(true);
      setKeyInput("");
      setTimeout(() => { setSaved(false); onSaved(); }, 1500);
    } catch (err) {
      alert("Erro ao salvar: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const isActive = status?.enabled && status?.hasKey;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14,
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* Accent bar */}
      <div style={{ height: 4, background: def.accent }} />

      <div style={{ padding: "20px 22px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, background: def.accent + "18",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 13, color: def.accent, letterSpacing: -0.5,
            }}>
              {def.logoChar}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{def.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                <a href={def.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#9ca3af", textDecoration: "underline" }}>
                  Ver documentação
                </a>
              </div>
            </div>
          </div>
          <span style={{
            background: isActive ? "#f0fdf4" : "#f9fafb",
            color: isActive ? GREEN_DARK : "#9ca3af",
            borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600,
          }}>
            {isActive ? "● Ativo" : "○ Inativo"}
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px", lineHeight: 1.5 }}>
          {def.description}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
            {def.keyLabel}
            {status?.hasKey && !keyInput && (
              <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>
                {status.maskedKey} — deixe em branco para manter
              </span>
            )}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder={status?.hasKey ? "Nova chave (opcional)" : def.keyPlaceholder}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 8,
                border: `1px solid ${BORDER}`, fontSize: 13,
                outline: "none", fontFamily: keyInput ? "monospace" : "inherit",
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowKey(v => !v)}
              style={{
                background: "#f3f4f6", border: "none", borderRadius: 8,
                padding: "0 12px", cursor: "pointer", fontSize: 15,
              }}
              title={showKey ? "Ocultar" : "Mostrar"}
            >
              {showKey ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <div
              onClick={() => setEnabled(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: enabled ? GREEN : "#d1d5db",
                position: "relative", transition: "background 0.2s", cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: enabled ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
              {enabled ? "Habilitado" : "Desabilitado"}
            </span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              background: saved ? "#10b981" : GREEN_DARK,
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 20px", fontSize: 13, fontWeight: 600,
              cursor: saving || saved ? "default" : "pointer",
              opacity: saving ? 0.7 : 1, transition: "background 0.2s",
            }}
          >
            {saved ? "✓ Salvo!" : saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SdrAdquirentes() {
  const [acquirers, setAcquirers] = useState<AcquirerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await apiFetch("/api/sdr/acquirers") as { acquirers: AcquirerStatus[] };
      setAcquirers(data.acquirers);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <div style={{ padding: "28px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111" }}>Adquirentes</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
            Configure sua própria chave em cada gateway para processar cobranças diretamente na sua conta.
            Nenhuma chave passa pelo servidor ComboZap — as cobranças são criadas com sua credencial.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>Carregando...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
            {GATEWAYS.map(def => (
              <GatewayCard
                key={def.id}
                def={def}
                status={acquirers.find(a => a.gateway === def.id)}
                onSaved={load}
              />
            ))}
          </div>
        )}

        <div style={{
          marginTop: 32, padding: "16px 20px", background: "#fffbeb",
          border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e",
        }}>
          <strong>⚠️ Segurança:</strong> suas chaves de API são armazenadas de forma privada e vinculadas
          apenas à sua conta. Nunca compartilhe essas chaves com terceiros.
          Ative apenas o gateway que você usa para evitar cobranças acidentais.
        </div>
      </div>
    </Layout>
  );
}
