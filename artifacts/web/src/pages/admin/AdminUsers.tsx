import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";

interface UserRow {
  id: number;
  email: string;
  name: string;
  whatsapp: string | null;
  plan: string;
  isAdmin: boolean;
  createdAt: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/users", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setUsers(d.users ?? []);
      })
      .catch(() => setError("Falha ao carregar usuarios"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.whatsapp ?? "").includes(search)
  );

  return (
    <AdminLayout>
      <div style={{ padding: "32px 28px", maxWidth: 1100 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, letterSpacing: -0.5 }}>
            Usuarios
          </h1>
          <p style={{ fontSize: 13.5, color: "#777", margin: "4px 0 0" }}>
            Cadastros sem plano ativo
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
          <div style={{ color: "#999", fontSize: 14 }}>Carregando...</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 140px 120px",
              padding: "12px 20px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fafafa",
            }}>
              {["Nome / Email", "WhatsApp", "Cadastro", "Status"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 14 }}>
                Nenhum usuario encontrado
              </div>
            ) : (
              filtered.map((u, i) => (
                <div key={u.id} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 140px 120px",
                  padding: "14px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #f5f5f5" : "none",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111" }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{u.email}</div>
                    {u.isAdmin && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>Admin</div>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: u.whatsapp ? "#111" : "#ccc" }}>
                    {u.whatsapp || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>{fmtDate(u.createdAt)}</div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11.5, fontWeight: 600,
                      background: "#f1f5f9", color: "#64748b",
                    }}>
                      Sem plano
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && !error && (
          <div style={{ fontSize: 12.5, color: "#bbb", marginTop: 12 }}>
            {filtered.length} usuario{filtered.length !== 1 ? "s" : ""} sem plano
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
