import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";

interface OrderRow {
  id: number;
  userId: number;
  email: string;
  name: string;
  planType: string;
  valueCents: number;
  status: string;
  createdAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediario",
  empresa: "Empresa",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/orders", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setOrders(d.orders ?? []);
      })
      .catch(() => setError("Falha ao carregar pedidos"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = orders.filter(o =>
    !search ||
    o.email.toLowerCase().includes(search.toLowerCase()) ||
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const paid = filtered.filter(o => o.status === "COMPLETED");
  const pending = filtered.filter(o => o.status !== "COMPLETED");
  const totalPaid = paid.reduce((s, o) => s + o.valueCents, 0);

  return (
    <AdminLayout>
      <div style={{ padding: "32px 28px", maxWidth: 1100 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, letterSpacing: -0.5 }}>
            Pedidos
          </h1>
          <p style={{ fontSize: 13.5, color: "#777", margin: "4px 0 0" }}>
            Todos os pedidos de plano gerados
          </p>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <SummaryBadge label="Pagos" value={`${paid.length} pedidos`} sub={fmtMoney(totalPaid)} />
          <SummaryBadge label="Pendentes" value={`${pending.length} pedidos`} sub="" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
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
          <div style={{ color: "#999", fontSize: 14 }}>Carregando...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 130px 120px 100px",
              padding: "12px 20px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}>
              {["Cliente", "Plano", "Valor", "Data", "Status"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 14 }}>
                Nenhum pedido encontrado
              </div>
            ) : (
              filtered.map((o, i) => (
                <div key={o.id} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 130px 120px 100px",
                  padding: "14px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f5" : "none",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111" }}>{o.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{o.email}</div>
                  </div>
                  <div style={{ fontSize: 13.5, color: "#111" }}>
                    {PLAN_LABELS[o.planType] ?? o.planType}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111" }}>
                    {fmtMoney(o.valueCents)}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#666" }}>{fmtDate(o.createdAt)}</div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11.5, fontWeight: 700,
                      background: o.status === "COMPLETED" ? "#111" : "#f1f5f9",
                      color: o.status === "COMPLETED" ? "#fff" : "#64748b",
                    }}>
                      {o.status === "COMPLETED" ? "Pago" : "Pendente"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && !error && (
          <div style={{ fontSize: 12.5, color: "#bbb", marginTop: 12 }}>
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""} no total
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryBadge({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 10, padding: "14px 20px", minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
