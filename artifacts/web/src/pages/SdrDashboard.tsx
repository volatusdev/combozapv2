import { useState, useEffect, useCallback } from "react";
import { Layout } from "../components/Layout";

interface TimeBucket { label: string; recv: number; sent: number }
interface TopDdd { ddd: string; estado: string; count: number }
interface ResponseBin { label: string; count: number }

interface DashStats {
  period: string;
  totalReceived: number;
  totalSent: number;
  totalContacts: number;
  newContactsToday: number;
  avgResponseSeconds: number | null;
  timeSeries: TimeBucket[];
  topDdds: TopDdd[];
  responseDist: ResponseBin[];
}

function formatTime(s: number | null): string {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function fmt(n: number): string { return n.toLocaleString("pt-BR"); }

const C = {
  accent: "#16a34a",
  accentSent: "#2563eb",
  grid: "#f0f0f0",
  text: "#0d0d0d",
  muted: "#9ca3af",
  mutedLight: "#c4c9d0",
  bg: "#fff",
  bgPage: "#f8f9fa",
  cardBorder: "#e8e8e8",
};

function AreaChart({ data }: { data: TimeBucket[] }) {
  const W = 800, H = 160;
  const pad = { t: 16, r: 16, b: 28, l: 36 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const maxVal = Math.max(...data.map(d => d.recv), 1);
  const n = data.length;
  const px = (i: number) => pad.l + (n <= 1 ? iW / 2 : (i / (n - 1)) * iW);
  const py = (v: number) => pad.t + iH - (v / maxVal) * iH;
  const linePts = data.map((d, i) => `${px(i).toFixed(1)},${py(d.recv).toFixed(1)}`).join(" L ");
  const linePath = `M ${linePts}`;
  const areaPath = `${linePath} L ${px(n - 1).toFixed(1)},${(pad.t + iH).toFixed(1)} L ${px(0).toFixed(1)},${(pad.t + iH).toFixed(1)} Z`;
  const xIdxs = [0, 4, 8, 12, 16, 20, 23].filter(i => i < n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="recvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.15" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((v, i) => {
        const gy = (pad.t + iH - v * iH).toFixed(1);
        return <line key={i} x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} stroke={C.grid} strokeWidth="1" />;
      })}
      {[0, Math.round(maxVal / 2), maxVal].map((v, i) => (
        <text key={i} x={pad.l - 6} y={py(v) + 4} textAnchor="end" fontSize="9" fill={C.muted} fontFamily="system-ui,sans-serif">{v}</text>
      ))}
      <path d={areaPath} fill="url(#recvGrad)" />
      <path d={linePath} fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => d.recv > 0 ? (
        <circle key={i} cx={px(i)} cy={py(d.recv)} r="2.5" fill={C.accent} />
      ) : null)}
      {xIdxs.map(i => (
        <text key={i} x={px(i).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="system-ui,sans-serif">{data[i].label}</text>
      ))}
    </svg>
  );
}

function BarChart({ data }: { data: TimeBucket[] }) {
  const W = 800, H = 160;
  const pad = { t: 16, r: 16, b: 28, l: 36 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const n = data.length;
  const maxVal = Math.max(...data.flatMap(d => [d.recv, d.sent]), 1);
  const slotW = iW / n;
  const gap = 2;
  const barW = Math.max(3, (slotW - gap * 3) / 2);
  const py = (v: number) => pad.t + iH - (v / maxVal) * iH;
  const bh = (v: number) => (v / maxVal) * iH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden>
      {[0, 0.5, 1].map((v, i) => {
        const gy = (pad.t + iH - v * iH).toFixed(1);
        return <line key={i} x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} stroke={C.grid} strokeWidth="1" />;
      })}
      {[0, Math.round(maxVal / 2), maxVal].map((v, i) => (
        <text key={i} x={pad.l - 6} y={(pad.t + iH - (v / maxVal) * iH) + 4} textAnchor="end" fontSize="9" fill={C.muted} fontFamily="system-ui,sans-serif">{v}</text>
      ))}
      {data.map((d, i) => {
        const cx = pad.l + i * slotW + slotW / 2;
        const x1 = cx - barW - gap / 2;
        const x2 = cx + gap / 2;
        const showLabel = n <= 10 || i % Math.ceil(n / 8) === 0;
        return (
          <g key={i}>
            {d.recv > 0 && <rect x={x1.toFixed(1)} y={py(d.recv).toFixed(1)} width={barW.toFixed(1)} height={bh(d.recv).toFixed(1)} rx="2" fill={C.accent} opacity="0.85" />}
            {d.sent > 0 && <rect x={x2.toFixed(1)} y={py(d.sent).toFixed(1)} width={barW.toFixed(1)} height={bh(d.sent).toFixed(1)} rx="2" fill={C.accentSent} opacity="0.7" />}
            {showLabel && <text x={cx.toFixed(1)} y={H - 8} textAnchor="middle" fontSize="8.5" fill={C.muted} fontFamily="system-ui,sans-serif">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function DddChart({ data }: { data: TopDdd[] }) {
  if (data.length === 0) return (
    <div style={{ textAlign: "center", padding: "28px 0", color: C.mutedLight, fontSize: 12.5 }}>
      Sem dados de localização ainda
    </div>
  );
  const maxVal = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => {
        const pct = (d.count / maxVal) * 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: C.text, flexShrink: 0 }}>{d.estado}</div>
            <div style={{ fontSize: 9.5, color: C.muted, width: 26, flexShrink: 0 }}>({d.ddd})</div>
            <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 3, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: C.accent, width: `${pct.toFixed(1)}%`, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ width: 28, textAlign: "right", fontSize: 11.5, fontWeight: 600, color: C.text, flexShrink: 0 }}>{fmt(d.count)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ResponseDistChart({ data }: { data: ResponseBin[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return (
    <div style={{ textAlign: "center", padding: "28px 0", color: C.mutedLight, fontSize: 12.5 }}>
      Sem dados de tempo de resposta ainda
    </div>
  );
  const colors = ["#16a34a", "#22c55e", "#84cc16", "#eab308", "#ef4444"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {data.map((d, i) => {
        const pct = total > 0 ? (d.count / total) * 100 : 0;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 58, fontSize: 11.5, color: C.muted, flexShrink: 0 }}>{d.label}</div>
            <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 3, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: colors[i], width: `${pct.toFixed(1)}%`, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ width: 26, textAlign: "right", fontSize: 11, color: C.muted, flexShrink: 0 }}>{fmt(d.count)}</div>
            <div style={{ width: 34, textAlign: "right", fontSize: 11, fontWeight: 600, color: C.text, flexShrink: 0 }}>{pct.toFixed(0)}%</div>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: C.bg,
      border: `1px solid ${C.cardBorder}`,
      borderRadius: 12,
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.muted }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, color: C.text }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.mutedLight }}>{sub}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "22px 24px 18px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function PeriodTabs({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const opts = [{ v: "24h", l: "24 horas" }, { v: "7d", l: "7 dias" }, { v: "30d", l: "30 dias" }];
  return (
    <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 600,
          background: period === o.v ? C.bg : "transparent",
          color: period === o.v ? C.text : C.muted,
          boxShadow: period === o.v ? "0 1px 3px rgba(0,0,0,0.07)" : "none",
          transition: "all 0.15s",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}

export function SdrDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("24h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (p: string) => {
    try {
      const r = await fetch(`/api/sdr/stats?slot=1&period=${p}`, { credentials: "include" });
      if (r.ok) {
        setStats(await r.json() as DashStats);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(period); }, [load, period]);
  useEffect(() => {
    const t = setInterval(() => load(period), 30_000);
    return () => clearInterval(t);
  }, [load, period]);

  const s = stats;
  const allZero = s ? s.timeSeries.every(b => b.recv === 0 && b.sent === 0) : true;
  const totalMsgs = s ? s.totalReceived + s.totalSent : 0;
  const recvPct = totalMsgs > 0 && s ? Math.round((s.totalReceived / totalMsgs) * 100) : 0;

  return (
    <Layout>
      <div style={{ padding: "28px 28px 56px", maxWidth: 1120 }}>

        <a href="https://katrivoads.com" target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 24 }}>
          <img
            src="/banner.gif"
            alt="banner"
            style={{ width: "100%", borderRadius: 14, display: "block", objectFit: "cover", cursor: "pointer" }}
          />
        </a>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Analytics</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
              Dados reais de atendimento — mensagens, localização e tempo de resposta
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {lastUpdated && (
              <div style={{ fontSize: 11, color: C.mutedLight }}>
                Atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <PeriodTabs period={period} onChange={p => { setPeriod(p); }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "#ddd", fontSize: 13 }}>Carregando...</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              <KpiCard label="Recebidas" value={s ? fmt(s.totalReceived) : "0"} sub={`no período de ${period === "24h" ? "24h" : period === "7d" ? "7 dias" : "30 dias"}`} />
              <KpiCard label="Enviadas" value={s ? fmt(s.totalSent) : "0"} sub="central de atendimento" />
              <KpiCard label="Contatos ativos" value={s ? fmt(s.totalContacts) : "0"} sub="conversas únicas no período" />
              <KpiCard label="Novos hoje" value={s ? fmt(s.newContactsToday) : "0"} sub="contatos com msg hoje" />
              <KpiCard label="Tempo médio" value={s ? formatTime(s.avgResponseSeconds) : "—"} sub="receber — responder" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <Card
                title={period === "24h" ? "Volume por Hora — últimas 24h" : period === "7d" ? "Volume por Dia — últimos 7 dias" : "Volume por Dia — últimos 30 dias"}
                sub={period === "24h" ? "Mensagens recebidas hora a hora" : "Recebidas e enviadas por dia"}
              >
                {allZero ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#ddd", fontSize: 12.5 }}>
                    Nenhuma mensagem no período selecionado
                  </div>
                ) : (
                  <>
                    {period === "24h"
                      ? <AreaChart data={s!.timeSeries} />
                      : <BarChart data={s!.timeSeries} />}
                    {period !== "24h" && (
                      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "flex-end" }}>
                        <Dot color={C.accent} label="Recebidas" />
                        <Dot color={C.accentSent} label="Enviadas" />
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Card title="Top Regiões por DDD" sub="Estados com mais contatos na base">
                <DddChart data={s?.topDdds ?? []} />
              </Card>

              <Card title="Distribuição de Tempo de Resposta" sub="Velocidade de atendimento por faixa">
                <ResponseDistChart data={s?.responseDist ?? []} />
                {s && s.avgResponseSeconds !== null && (
                  <div style={{
                    marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.cardBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Média geral</span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>
                      {formatTime(s.avgResponseSeconds)}
                    </span>
                  </div>
                )}
              </Card>
            </div>

            {s && totalMsgs > 0 && (
              <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recebidas vs Enviadas</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{fmt(totalMsgs)} mensagens totais no período</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>{recvPct}% recebidas</div>
                </div>
                <div style={{ background: "#f3f4f6", borderRadius: 6, height: 10, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${recvPct}%`, background: C.accent, height: "100%", transition: "width 0.6s ease" }} />
                  <div style={{ flex: 1, background: C.accentSent, height: "100%", opacity: 0.6 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
                    Recebidas: <strong style={{ color: C.text, fontWeight: 600 }}>{fmt(s.totalReceived)}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accentSent }} />
                    Enviadas: <strong style={{ color: C.text, fontWeight: 600 }}>{fmt(s.totalSent)}</strong>
                  </div>
                </div>
              </div>
            )}

            {s && s.totalReceived === 0 && s.totalSent === 0 && (
              <div style={{
                marginTop: 12, background: C.bg,
                border: `1px solid ${C.cardBorder}`, borderRadius: 12,
                padding: "48px 24px", textAlign: "center",
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
                  Sem mensagens no período selecionado
                </div>
                <div style={{ fontSize: 12, color: "#d8d8d8" }}>
                  Conecte um número WhatsApp para visualizar os dados
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
