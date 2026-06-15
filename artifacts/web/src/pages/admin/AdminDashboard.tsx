import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";

const PAGE_SIZE = 10;

interface Stats {
  totalUsers: number; totalSubscribers: number; noPlanUsers: number;
  totalInstancesDb: number; totalInstancesEvo: number; connectedInstances: number;
  paidOrders: number; paidTotal: number; pendingOrders: number; pendingTotal: number;
}
interface Instance {
  instanceName: string; slotNumber: number; userId: number;
  email: string; name: string; createdAt: string; connected: boolean; phone: string | null;
}
interface UserRow { id: number; email: string; name: string; whatsapp: string | null; plan: string; isAdmin: boolean; createdAt: string; }
interface SubscriberRow { id: number; email: string; name: string; whatsapp: string | null; planType: string; maxSlots: number; purchasedAt: string; slotsRegistered: number; slotsConnected: number; }
interface OrderRow { id: number; email: string; name: string; planType: string; valueCents: number; status: string; createdAt: string; }

type Tab = "instancias" | "clientes" | "assinantes" | "pedidos";

const PLAN: Record<string, string> = { iniciante: "Iniciante", intermediario: "Intermediário", empresa: "Empresa" };
const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tab, setTab] = useState<Tab>("instancias");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState<number | null>(null);

  async function handleImpersonate(userId: number) {
    setGenerating(userId);
    try {
      const r = await fetch(`/api/admin/impersonate/${userId}`, { method: "POST", credentials: "include" });
      const data = await r.json() as { url?: string; error?: string };
      if (data.error || !data.url) { alert(data.error ?? "Erro ao gerar link"); return; }
      await navigator.clipboard.writeText(data.url);
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 3000);
    } catch { alert("Erro ao copiar link"); }
    finally { setGenerating(null); }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats",       { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/instances",   { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/users",       { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/subscribers", { credentials: "include" }).then(r => r.json()),
      fetch("/api/admin/orders",      { credentials: "include" }).then(r => r.json()),
    ]).then(([st, ins, us, sub, ord]) => {
      if (st.error) { setError(st.error); return; }
      setStats(st);
      setInstances(ins.instances ?? []);
      setUsers(us.users ?? []);
      setSubscribers(sub.subscribers ?? []);
      setOrders(ord.orders ?? []);
    }).catch(() => setError("Falha ao carregar dados"))
      .finally(() => setLoading(false));
  }, []);

  function switchTab(t: Tab) { setTab(t); setPage(1); }

  const tabData: Record<Tab, unknown[]> = {
    instancias: instances, clientes: users, assinantes: subscribers, pedidos: orders,
  };
  const rows = tabData[tab];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <AdminLayout>
      <div style={{
        display: "flex", flexDirection: "column",
        height: "calc(100vh - 48px)",
        padding: "20px 24px 16px", gap: 16, overflow: "hidden",
        boxSizing: "border-box",
      }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111", letterSpacing: -0.5 }}>
            Dashboard Master
          </h1>
          <span style={{ fontSize: 12, color: "#aaa" }}>Neon DB + Evolution API · dados em tempo real</span>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: 13, flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* ── Stats row ── */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, flexShrink: 0 }}>
            <MiniStat label="Cadastrados" value={stats.totalUsers} />
            <MiniStat label="Assinantes" value={stats.totalSubscribers} accent />
            <MiniStat label="Sem plano" value={stats.noPlanUsers} />
            <MiniStat label="Conectados" value={`${stats.connectedInstances}/${stats.totalInstancesEvo}`} accent />
            <MiniStat label="Pedidos pagos" value={stats.paidOrders} />
            <MiniStat label="Receita" value={fmt(stats.paidTotal)} />
          </div>
        )}

        {loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: 13 }}>
            Carregando…
          </div>
        )}

        {!loading && stats && (
          <>
            {/* ── Tabs ── */}
            <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e8eaed", flexShrink: 0, paddingBottom: 0 }}>
              {([
                ["instancias", "Instâncias", instances.length],
                ["clientes",   "Clientes",   users.length],
                ["assinantes", "Assinantes", subscribers.length],
                ["pedidos",    "Pedidos",    orders.length],
              ] as [Tab, string, number][]).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => switchTab(key)}
                  style={{
                    padding: "8px 16px", border: "none", background: "none",
                    fontSize: 13, fontWeight: tab === key ? 700 : 500,
                    color: tab === key ? "#111" : "#888",
                    cursor: "pointer", borderBottom: tab === key ? "2px solid #111" : "2px solid transparent",
                    marginBottom: -1, transition: "all 0.1s",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                    background: tab === key ? "#111" : "#f1f5f9",
                    color: tab === key ? "#fff" : "#888",
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Table ── */}
            <div style={{
              flex: 1, background: "#fff", border: "1px solid #e8eaed",
              borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
              minHeight: 0,
            }}>
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: COLS[tab],
                padding: "10px 20px",
                background: "#fafafa",
                borderBottom: "1px solid #f0f0f0",
                flexShrink: 0,
              }}>
                {HEADERS[tab].map(h => (
                  <div key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {pageRows.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "#bbb", fontSize: 13 }}>
                    Nenhum registro encontrado
                  </div>
                ) : (
                  pageRows.map((row, i) => (
                    <TableRow
                      key={i} tab={tab} row={row as any} last={i === pageRows.length - 1}
                      onImpersonate={handleImpersonate}
                      copiedId={copiedId} generating={generating}
                    />
                  ))
                )}
              </div>

              {/* Pagination */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 20px", borderTop: "1px solid #f0f0f0",
                flexShrink: 0, background: "#fafafa",
              }}>
                <span style={{ fontSize: 12, color: "#bbb" }}>
                  {rows.length} registro{rows.length !== 1 ? "s" : ""}
                  {totalPages > 1 ? ` · pág ${page} de ${totalPages}` : ""}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <PagBtn label="‹" disabled={page === 1} onClick={() => setPage(p => p - 1)} />
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                      <PagBtn key={n} label={String(n)} active={n === page} onClick={() => setPage(n)} />
                    ))}
                    <PagBtn label="›" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

const COLS: Record<Tab, string> = {
  instancias: "140px 1fr 140px 130px 90px",
  clientes:   "1fr 1fr 120px 80px",
  assinantes: "1fr 130px 120px 130px 110px 44px",
  pedidos:    "1fr 130px 120px 120px 90px",
};

const HEADERS: Record<Tab, string[]> = {
  instancias: ["Instância", "Conta", "Número", "Desde", "Status"],
  clientes:   ["Nome / Email", "WhatsApp", "Cadastro", "Status"],
  assinantes: ["Nome / Email", "WhatsApp", "Plano", "Comprado em", "Slots", ""],
  pedidos:    ["Cliente", "Plano", "Valor", "Data", "Status"],
};

function TableRow({ tab, row, last, onImpersonate, copiedId, generating }: {
  tab: Tab; row: any; last: boolean;
  onImpersonate: (id: number) => void;
  copiedId: number | null;
  generating: number | null;
}) {
  const border = last ? "none" : "1px solid #f5f5f5";
  const base: React.CSSProperties = {
    display: "grid", gridTemplateColumns: COLS[tab],
    padding: "11px 20px", borderBottom: border, alignItems: "center",
  };

  if (tab === "instancias") {
    const r = row as Instance;
    return (
      <div style={base}>
        <div style={{ fontSize: 11.5, fontFamily: "monospace", color: "#555" }}>{r.instanceName}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: "#aaa" }}>{r.email}</div>
        </div>
        <div style={{ fontSize: 13, color: r.phone ? "#111" : "#ccc" }}>
          {r.phone ? `+${r.phone}` : "—"}
        </div>
        <div style={{ fontSize: 12, color: "#888" }}>{fmtDate(r.createdAt)}</div>
        <Pill on={r.connected} labelOn="Conectado" labelOff="Offline" />
      </div>
    );
  }

  if (tab === "clientes") {
    const r = row as UserRow;
    return (
      <div style={base}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: "#aaa" }}>{r.email}</div>
        </div>
        <div style={{ fontSize: 13, color: r.whatsapp ? "#111" : "#ccc" }}>{r.whatsapp || "—"}</div>
        <div style={{ fontSize: 12, color: "#888" }}>{fmtDate(r.createdAt)}</div>
        <Pill on={false} labelOn="" labelOff="Sem plano" />
      </div>
    );
  }

  if (tab === "assinantes") {
    const r = row as SubscriberRow;
    const isCopied = copiedId === r.id;
    const isGenerating = generating === r.id;
    return (
      <div style={base}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: "#aaa" }}>{r.email}</div>
        </div>
        <div style={{ fontSize: 13, color: r.whatsapp ? "#111" : "#ccc" }}>{r.whatsapp || "—"}</div>
        <div>
          <span style={{
            fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
            background: "#111", color: "#fff",
          }}>
            {PLAN[r.planType] ?? r.planType} · {r.maxSlots}x
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#888" }}>{fmtDate(r.purchasedAt)}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
          {r.slotsConnected}/{r.maxSlots}
          <span style={{ fontSize: 11, color: "#aaa", fontWeight: 400, marginLeft: 4 }}>ativos</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => onImpersonate(r.id)}
            disabled={isGenerating}
            title={isCopied ? "Link copiado!" : "Entrar como este usuario (link 15min)"}
            style={{
              width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isCopied ? "#dcfce7" : "#f4f4f5",
              color: isCopied ? "#16a34a" : "#555",
              fontSize: 15, transition: "all 0.15s",
              opacity: isGenerating ? 0.5 : 1,
            }}
          >
            {isCopied ? "✓" : isGenerating ? "…" : "🚪"}
          </button>
        </div>
      </div>
    );
  }

  // pedidos
  const r = row as OrderRow;
  const paid = r.status === "COMPLETED";
  return (
    <div style={base}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{r.name}</div>
        <div style={{ fontSize: 11.5, color: "#aaa" }}>{r.email}</div>
      </div>
      <div style={{ fontSize: 13, color: "#111" }}>{PLAN[r.planType] ?? r.planType}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{fmt(r.valueCents)}</div>
      <div style={{ fontSize: 12, color: "#888" }}>{fmtDate(r.createdAt)}</div>
      <Pill on={paid} labelOn="Pago" labelOff="Pendente" />
    </div>
  );
}

function Pill({ on, labelOn, labelOff }: { on: boolean; labelOn: string; labelOff: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11.5, fontWeight: 700,
      background: on ? "#111" : "#f1f5f9",
      color: on ? "#fff" : "#94a3b8",
    }}>
      {on ? labelOn : labelOff}
    </span>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? "#111" : "#fff",
      border: accent ? "none" : "1px solid #e8eaed",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: accent ? "#888" : "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "#fff" : "#111", letterSpacing: -0.5, lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
    </div>
  );
}

function PagBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, padding: "0 6px",
        border: "1px solid #e8eaed", borderRadius: 6,
        fontSize: 12.5, fontWeight: active ? 700 : 500,
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : disabled ? "#ccc" : "#555",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
