import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";

interface SubscriberRow {
  id: number;
  email: string;
  name: string;
  whatsapp: string | null;
  createdAt: string;
  planType: string;
  maxSlots: number;
  purchasedAt: string;
  slotsRegistered: number;
  slotsConnected: number;
}

const PLAN_LABELS: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediario",
  empresa: "Empresa",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function monthProgress(purchasedAt: string): string {
  const purchased = new Date(purchasedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - purchased.getTime()) / (1000 * 60 * 60 * 24));
  const month = Math.floor(diffDays / 30) + 1;
  return `${month}/${month}`;
}

export function AdminSubscribers() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/subscribers", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setSubscribers(d.subscribers ?? []);
      })
      .catch(() => setError("Falha ao carregar assinantes"))
      .finally(() => setLoading(false));
  }, []);

  async function handleImpersonate(userId: number) {
    setGenerating(userId);
    try {
      const r = await fetch(`/api/admin/impersonate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json() as { url?: string; error?: string };
      if (data.error || !data.url) {
        alert(data.error ?? "Erro ao gerar link");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 3000);
    } catch {
      alert("Erro ao copiar link");
    } finally {
      setGenerating(null);
    }
  }

  const filtered = subscribers.filter(s =>
    !search ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.whatsapp ?? "").includes(search)
  );

  return (
    <AdminLayout>
      <div style={{ padding: "32px 28px", maxWidth: 1280 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, letterSpacing: -0.5 }}>
            Assinantes
          </h1>
          <p style={{ fontSize: 13.5, color: "#777", margin: "4px 0 0" }}>
            Usuarios com plano ativo — slots cruzados com Evolution API
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Buscar por nome, email ou WhatsApp..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", maxWidth: 380, padding: "9px 14px", borderRadius: 8,
              border: "1px solid #e5e7eb", fontSize: 13.5, outline: "none",
              background: "#fff", color: "#111",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13.5, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: "#999", fontSize: 14 }}>Carregando dados reais...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 120px 160px 110px 90px 44px",
              padding: "12px 20px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}>
              {["Nome / Email", "WhatsApp", "Desde", "Plano", "Slots", "Mes", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 14 }}>
                Nenhum assinante encontrado
              </div>
            ) : (
              filtered.map((s, i) => (
                <div key={s.id} style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 120px 160px 110px 90px 44px",
                  padding: "14px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f5" : "none",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{s.email}</div>
                  </div>
                  <div style={{ fontSize: 13.5, color: s.whatsapp ? "#111" : "#ccc" }}>
                    {s.whatsapp || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>{fmtDate(s.purchasedAt)}</div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11.5, fontWeight: 700,
                      background: "#111", color: "#fff",
                    }}>
                      {PLAN_LABELS[s.planType] ?? s.planType} · {s.maxSlots}x
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                      {s.slotsConnected}/{s.maxSlots} ativos
                    </div>
                    <div style={{ fontSize: 11.5, color: "#aaa", marginTop: 1 }}>
                      {s.slotsRegistered} registrado{s.slotsRegistered !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                    {monthProgress(s.purchasedAt)}
                  </div>

                  {/* Impersonation button */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => handleImpersonate(s.id)}
                      disabled={generating === s.id}
                      title={copiedId === s.id ? "Link copiado!" : "Entrar como este usuario (gera link 15min)"}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: copiedId === s.id ? "#dcfce7" : "#f4f4f5",
                        color: copiedId === s.id ? "#16a34a" : "#555",
                        fontSize: 16, transition: "all 0.15s",
                        opacity: generating === s.id ? 0.5 : 1,
                      }}
                    >
                      {copiedId === s.id ? "✓" : generating === s.id ? "…" : "🚪"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && !error && (
          <div style={{ fontSize: 12.5, color: "#bbb", marginTop: 12 }}>
            {filtered.length} assinante{filtered.length !== 1 ? "s" : ""} com plano ativo
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
