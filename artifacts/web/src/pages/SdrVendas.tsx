import { useState, useEffect, useCallback } from "react";
import { Layout } from "../components/Layout";

const GREEN = "#22c55e";
const GREEN_DARK = "#16a34a";
const BLACK = "#0d0d0d";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";
const WHITE = "#ffffff";
const OFF_WHITE = "#f7f7f5";

interface Stats {
  total: number;
  paid: number;
  pending: number;
  expired: number;
  totalValueCents: number;
  paidValueCents: number;
  pendingValueCents: number;
  conversionRate: number;
}

interface Charge {
  id: number;
  contactName: string;
  jid: string;
  instance: string;
  valueCents: number;
  description: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string; dot: string }> = {
    COMPLETED: { label: "Pago",     bg: "#f0fdf4", color: GREEN_DARK,  dot: GREEN },
    PENDING:   { label: "Pendente", bg: "#fffbeb", color: "#92400e",   dot: "#f59e0b" },
    EXPIRED:   { label: "Expirado", bg: "#f9fafb", color: GRAY,        dot: "#d1d5db" },
  };
  const s = map[status] ?? map.EXPIRED;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: s.bg, fontSize: 12, fontWeight: 700, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {s.label}
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? GREEN : WHITE,
      border: `1px solid ${accent ? GREEN : BORDER}`,
      borderRadius: 14, padding: "20px 22px", flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: accent ? "rgba(255,255,255,0.8)" : GRAY, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? WHITE : BLACK, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.75)" : GRAY, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function SdrVendas() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "COMPLETED" | "PENDING">("ALL");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [sr, cr] = await Promise.all([
        fetch("/api/sdr/pix/stats", { credentials: "include" }),
        fetch("/api/sdr/pix/charges", { credentials: "include" }),
      ]);
      if (sr.ok) setStats(await sr.json());
      if (cr.ok) {
        const d = await cr.json();
        setCharges(d.charges ?? []);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = filter === "ALL" ? charges : charges.filter(c => c.status === filter);

  const convPct = stats ? `${(stats.conversionRate * 100).toFixed(0)}%` : "—";

  return (
    <Layout>
      <div style={{ height: "calc(100vh - 56px)", overflowY: "auto", background: OFF_WHITE }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 28px" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: BLACK, margin: 0, marginBottom: 4 }}>Vendas PIX</h1>
              <div style={{ fontSize: 13, color: GRAY }}>
                Cobranças geradas pelo agente IA · Atualizado às {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>
            <button onClick={load} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, fontSize: 13, fontWeight: 600, color: BLACK, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Atualizar
            </button>
          </div>

          {/* KPI cards */}
          {loading ? (
            <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ flex: 1, height: 98, borderRadius: 14, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          ) : stats ? (
            <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
              <KpiCard label="Total Recebido" value={fmt(stats.paidValueCents)} sub={`${stats.paid} cobranças pagas`} accent />
              <KpiCard label="Taxa de Conversão" value={convPct} sub={`${stats.paid} de ${stats.total} cobranças`} />
              <KpiCard label="Pendente" value={fmt(stats.pendingValueCents)} sub={`${stats.pending} aguardando pagamento`} />
              <KpiCard label="Total Gerado" value={fmt(stats.totalValueCents)} sub={`${stats.total} cobranças no total`} />
            </div>
          ) : null}

          {/* Table */}
          <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>

            {/* Table header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>Histórico de Cobranças</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["ALL", "COMPLETED", "PENDING"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: "5px 12px", borderRadius: 7, border: `1px solid ${filter === f ? GREEN : BORDER}`,
                    background: filter === f ? "#f0fdf4" : WHITE,
                    fontSize: 12, fontWeight: 600, color: filter === f ? GREEN_DARK : GRAY, cursor: "pointer",
                  }}>
                    {f === "ALL" ? "Todos" : f === "COMPLETED" ? "Pagos" : "Pendentes"}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "48px", color: GRAY, fontSize: 13 }}>Carregando…</div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.2 }}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}>
                    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                  </svg>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  {filter === "ALL" ? "Nenhuma cobrança ainda" : filter === "COMPLETED" ? "Nenhuma cobrança paga" : "Nenhuma cobrança pendente"}
                </div>
                <div style={{ fontSize: 12.5, color: GRAY, maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
                  As cobranças PIX geradas pelo agente IA aparecerão aqui automaticamente
                </div>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: OFF_WHITE }}>
                      {["Contato", "Valor", "Descrição", "Slot", "Status", "Criado em", "Pago em"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", fontSize: 11.5, fontWeight: 700, color: GRAY, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={c.id} style={{ borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? WHITE : "#fafafa" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: BLACK }}>{c.contactName || "—"}</div>
                          <div style={{ fontSize: 11.5, color: GRAY, fontFamily: "monospace" }}>{c.jid.replace(/@.*/, "")}</div>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 800, color: c.status === "COMPLETED" ? GREEN_DARK : BLACK, whiteSpace: "nowrap" }}>
                          {fmt(c.valueCents)}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.description || "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12.5, color: GRAY, whiteSpace: "nowrap" }}>
                          {c.instance || "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <StatusBadge status={c.status} />
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12.5, color: GRAY, whiteSpace: "nowrap" }}>
                          {fmtDate(c.createdAt)}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12.5, color: c.paidAt ? GREEN_DARK : GRAY, whiteSpace: "nowrap", fontWeight: c.paidAt ? 700 : 400 }}>
                          {c.paidAt ? fmtDate(c.paidAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}
