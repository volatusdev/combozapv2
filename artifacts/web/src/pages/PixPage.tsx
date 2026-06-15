import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface PixCharge {
  brCode: string;
  qrCodeImage: string | null;
  valueCents: number;
  description: string;
  status: string;
}

export function PixPage() {
  const [location] = useLocation();
  const id = location.split("/pix/")[1]?.split("/")[0] ?? "";
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Identification step
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [identified, setIdentified] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pix/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Cobrança não encontrada");
        return r.json() as Promise<PixCharge>;
      })
      .then(setCharge)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  function handleCopy() {
    if (!charge?.brCode) return;
    navigator.clipboard.writeText(charge.brCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = charge.brCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  function formatCpf(v: string) {
    return v.replace(/\D/g, "").slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  const valueStr = charge
    ? `R$ ${(charge.valueCents / 100).toFixed(2).replace(".", ",")}`
    : "";

  const isPaid = charge?.status === "COMPLETED";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #16a34a, #15803d)",
          padding: "24px 24px 20px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🔑</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Pagamento PIX</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 }}>
            ComboZap
          </div>
        </div>

        <div style={{ padding: "28px 24px 32px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "#6b7280", padding: "40px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              Carregando cobrança…
            </div>
          )}

          {error && (
            <div style={{ textAlign: "center", color: "#dc2626", padding: "40px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              {error}
            </div>
          )}

          {charge && (
            <>
              {isPaid ? (
                <div style={{
                  textAlign: "center",
                  background: "#f0fdf4",
                  border: "2px solid #bbf7d0",
                  borderRadius: 12,
                  padding: "32px 24px",
                }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: "#15803d" }}>
                    Pagamento confirmado!
                  </div>
                  <div style={{ color: "#6b7280", marginTop: 8, fontSize: 14 }}>
                    {valueStr} recebido com sucesso.
                  </div>
                </div>
              ) : !identified ? (
                /* ── Step 1: Identification ── */
                <div>
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Valor a pagar</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#111827" }}>{valueStr}</div>
                    {charge.description && (
                      <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{charge.description}</div>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 16 }}>
                    Seus dados para pagamento
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                      Nome completo
                    </label>
                    <input
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName((e.target as HTMLInputElement).value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1.5px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                      CPF
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf((e.target as HTMLInputElement).value))}
                      inputMode="numeric"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1.5px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    onClick={() => setIdentified(true)}
                    disabled={!name.trim() || cpf.replace(/\D/g, "").length < 11}
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: (!name.trim() || cpf.replace(/\D/g, "").length < 11) ? "#d1d5db" : "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: (!name.trim() || cpf.replace(/\D/g, "").length < 11) ? "not-allowed" : "pointer",
                    }}
                  >
                    Ver QR Code →
                  </button>

                  <div style={{ marginTop: 12, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                    Seus dados são usados apenas para identificação do pagamento.
                  </div>
                </div>
              ) : (
                /* ── Step 2: QR Code + Copy ── */
                <>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 2 }}>Pagando como</div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>CPF: {cpf}</div>
                  </div>

                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Valor a pagar</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>{valueStr}</div>
                    {charge.description && (
                      <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{charge.description}</div>
                    )}
                  </div>

                  {charge.qrCodeImage && (
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: 16,
                      background: "#f9fafb",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #e5e7eb",
                    }}>
                      <img
                        src={charge.qrCodeImage}
                        alt="QR Code PIX"
                        style={{ width: 200, height: 200, borderRadius: 8 }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: 12, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
                    Escaneie o QR Code ou copie o código abaixo
                  </div>

                  <div style={{
                    background: "#f3f4f6",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 11,
                    color: "#374151",
                    wordBreak: "break-all",
                    lineHeight: 1.5,
                    marginBottom: 16,
                    border: "1px solid #e5e7eb",
                    maxHeight: 72,
                    overflow: "hidden",
                    position: "relative",
                  }}>
                    {charge.brCode.slice(0, 80)}…
                  </div>

                  <button
                    onClick={handleCopy}
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: copied ? "#15803d" : "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "background 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {copied ? "✅ Código copiado!" : "📋 Copiar código PIX"}
                  </button>

                  <div style={{ marginTop: 16, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                    Abra o app do seu banco → Pix → Colar código
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
        Powered by ComboZap · Pagamento seguro via Pix
      </div>
    </div>
  );
}
