import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "../components/Layout";
import { useAuth } from "../lib/use-auth";
import type { RolePermissions, PermLevel } from "../lib/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRole {
  id: number;
  name: string;
  permissions: string;
  createdAt: string;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  roleId: number | null;
  isActive: boolean;
  createdAt: string;
}

type Section = keyof RolePermissions;

const SECTIONS: { key: Section; label: string }[] = [
  { key: "atendimento", label: "Central de Atendimento" },
  { key: "contatos",    label: "Contatos" },
  { key: "tags",        label: "Tags de Identificação" },
  { key: "disparo",     label: "Disparo Inteligente" },
  { key: "conexao",     label: "Conexão WhatsApp" },
  { key: "plano",       label: "Meu Plano SDR" },
  { key: "agentes",     label: "Agente SDR" },
];

const PERM_OPTIONS: { value: PermLevel; label: string; color: string }[] = [
  { value: "none", label: "Sem acesso", color: "#ef4444" },
  { value: "view", label: "Somente leitura", color: "#f59e0b" },
  { value: "edit", label: "Leitura e edição", color: "#22c55e" },
];

const DEFAULT_PERMS: RolePermissions = {
  atendimento: "none", contatos: "none", tags: "none",
  disparo: "none", conexao: "none", plano: "none", agentes: "none", funil: "none",
  respostas: "none",
};

function parsePerms(raw: string): RolePermissions {
  try { return { ...DEFAULT_PERMS, ...JSON.parse(raw) }; } catch { return { ...DEFAULT_PERMS }; }
}

function permBadge(level: PermLevel) {
  const opt = PERM_OPTIONS.find(o => o.value === level)!;
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 7px",
      borderRadius: 10, background: opt.color + "1a", color: opt.color,
    }}>{opt.label}</span>
  );
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api${path}`, {
    method, credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Erro na requisição");
  return data;
}

// ── Cargos tab ────────────────────────────────────────────────────────────────

function CargosTab() {
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TeamRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [roleName, setRoleName] = useState("");
  const [perms, setPerms] = useState<RolePermissions>({ ...DEFAULT_PERMS });

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/team/roles");
      setRoles(d.roles);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null); setRoleName(""); setPerms({ ...DEFAULT_PERMS }); setErr(""); setShowModal(true);
  }
  function openEdit(r: TeamRole) {
    setEditing(r); setRoleName(r.name); setPerms(parsePerms(r.permissions)); setErr(""); setShowModal(true);
  }

  async function save() {
    if (!roleName.trim()) { setErr("Nome é obrigatório"); return; }
    setSaving(true); setErr("");
    try {
      if (editing) {
        await apiFetch(`/team/roles/${editing.id}`, "PUT", { name: roleName, permissions: perms });
      } else {
        await apiFetch("/team/roles", "POST", { name: roleName, permissions: perms });
      }
      setShowModal(false); load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm("Excluir este cargo? Os membros com este cargo perderão as permissões.")) return;
    await apiFetch(`/team/roles/${id}`, "DELETE");
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Cargos</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>
            Defina permissões de acesso por módulo para cada cargo
          </div>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ Novo Cargo</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Carregando…</div>
      ) : roles.length === 0 ? (
        <EmptyState title="Nenhum cargo criado" sub="Crie um cargo para definir permissões de acesso para sua equipe" />
      ) : (
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Cargo", "Permissões", "Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r, i) => {
                const p = parsePerms(r.permissions);
                const editCount = (Object.values(p) as PermLevel[]).filter(v => v === "edit").length;
                const viewCount = (Object.values(p) as PermLevel[]).filter(v => v === "view").length;
                return (
                  <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid #f5f5f5" : undefined }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 13.5, color: "#111" }}>{r.name}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {editCount > 0 && <span style={{ fontSize: 11.5, background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{editCount} edição</span>}
                        {viewCount > 0 && <span style={{ fontSize: 11.5, background: "#fef9c3", color: "#a16207", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{viewCount} somente leitura</span>}
                        {editCount + viewCount === 0 && <span style={{ fontSize: 11.5, background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>Sem acesso</span>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={btnSecondary}>Editar</button>
                        <button onClick={() => del(r.id)} style={btnDanger}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? "Editar Cargo" : "Novo Cargo"} onClose={() => setShowModal(false)} width={620}>
          <div style={{ marginBottom: 16 }}>
            <Label>Nome do Cargo</Label>
            <input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Ex: Atendente, Supervisor, Financeiro…" style={inputStyle} />
          </div>

          <Label>Permissões por Módulo</Label>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden", marginTop: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, width: "35%" }}>Módulo</th>
                  {PERM_OPTIONS.map(o => (
                    <th key={o.value} style={{ padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700, color: o.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{o.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s, i) => (
                  <tr key={s.key} style={{ borderTop: i > 0 ? "1px solid #f5f5f5" : undefined }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, color: "#333" }}>{s.label}</td>
                    {PERM_OPTIONS.map(o => (
                      <td key={o.value} style={{ padding: "10px 8px", textAlign: "center" }}>
                        <input
                          type="radio"
                          name={`perm-${s.key}`}
                          checked={perms[s.key] === o.value}
                          onChange={() => setPerms(p => ({ ...p, [s.key]: o.value }))}
                          style={{ width: 16, height: 16, accentColor: o.color, cursor: "pointer" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {err && <div style={{ marginTop: 12, color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? "Salvando…" : "Salvar Cargo"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Time tab ──────────────────────────────────────────────────────────────────

function TimeTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: "" });

  const load = useCallback(async () => {
    try {
      const [md, rd] = await Promise.all([
        apiFetch("/team/members"),
        apiFetch("/team/roles"),
      ]);
      setMembers(md.members);
      setRoles(rd.roles);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null); setForm({ name: "", email: "", password: "", roleId: "" }); setErr(""); setShowModal(true);
  }
  function openEdit(m: TeamMember) {
    setEditing(m); setForm({ name: m.name, email: m.email, password: "", roleId: m.roleId ? String(m.roleId) : "" }); setErr(""); setShowModal(true);
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { setErr("Nome e e-mail são obrigatórios"); return; }
    if (!editing && !form.password) { setErr("Senha é obrigatória para novo membro"); return; }
    setSaving(true); setErr("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        roleId: form.roleId ? parseInt(form.roleId) : null,
      };
      if (form.password) body.password = form.password;
      if (!editing) body.password = form.password;

      if (editing) {
        await apiFetch(`/team/members/${editing.id}`, "PUT", body);
      } else {
        await apiFetch("/team/members", "POST", body);
      }
      setShowModal(false); load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(m: TeamMember) {
    await apiFetch(`/team/members/${m.id}`, "PUT", { isActive: !m.isActive });
    load();
  }

  async function del(id: number) {
    if (!confirm("Excluir este membro? Ele perderá acesso à plataforma.")) return;
    await apiFetch(`/team/members/${id}`, "DELETE");
    load();
  }

  const getRoleName = (id: number | null) =>
    id ? (roles.find(r => r.id === id)?.name ?? "Cargo removido") : "Sem cargo";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Membros do Time</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>
            Crie logins de acesso para sua equipe com permissões por cargo
          </div>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ Novo Membro</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Carregando…</div>
      ) : members.length === 0 ? (
        <EmptyState title="Nenhum membro cadastrado" sub="Adicione membros da equipe para dar acesso à plataforma com permissões personalizadas" />
      ) : (
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Nome", "E-mail", "Cargo", "Status", "Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} style={{ borderTop: i > 0 ? "1px solid #f5f5f5" : undefined }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 13.5, color: "#111" }}>{m.name}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#555" }}>{m.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, background: "#f0f9ff", color: "#0369a1", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
                      {getRoleName(m.roleId)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => toggleActive(m)}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, border: "none", cursor: "pointer",
                        background: m.isActive ? "#dcfce7" : "#fee2e2",
                        color: m.isActive ? "#16a34a" : "#b91c1c",
                      }}
                    >
                      {m.isActive ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(m)} style={btnSecondary}>Editar</button>
                      <button onClick={() => del(m.id)} style={btnDanger}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? "Editar Membro" : "Novo Membro"} onClose={() => setShowModal(false)} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>Nome completo</Label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: João Silva" style={inputStyle} />
            </div>
            <div>
              <Label>E-mail de acesso</Label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@empresa.com" style={inputStyle} />
            </div>
            <div>
              <Label>{editing ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"} style={inputStyle} />
            </div>
            <div>
              <Label>Cargo</Label>
              <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))} style={{ ...inputStyle, background: "#fff" }}>
                <option value="">Sem cargo (sem acesso)</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                ))}
              </select>
              {roles.length === 0 && (
                <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
                  Crie um cargo primeiro na aba "Cargos" para definir permissões.
                </div>
              )}
            </div>
          </div>

          {err && <div style={{ marginTop: 12, color: "#ef4444", fontSize: 13 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={btnSecondary}>Cancelar</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? "Salvando…" : editing ? "Salvar Alterações" : "Criar Membro"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", border: "2px dashed #f0f0f0", borderRadius: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#333", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#888", maxWidth: 360, margin: "0 auto" }}>{sub}</div>
    </div>
  );
}

function Modal({ title, onClose, children, width = 500 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 600, color: "#555", marginBottom: 6 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e5e5e5", borderRadius: 8,
  fontSize: 13.5, color: "#111", outline: "none", boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  padding: "9px 18px", background: "#16a34a", color: "#fff", border: "none",
  borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "7px 14px", background: "#fff", color: "#555", border: "1px solid #e5e5e5",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "7px 14px", background: "#fff", color: "#ef4444", border: "1px solid #fecaca",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function SdrEquipe() {
  const { isTeamMember } = useAuth();
  const [location] = useLocation();

  const isTime = location.endsWith("/time");
  const isCargos = location.endsWith("/cargos");
  const activeTab = isCargos ? "cargos" : "time";

  if (isTeamMember) {
    return (
      <Layout>
        <div style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#333", marginBottom: 6 }}>Acesso restrito</div>
          <div style={{ fontSize: 13.5, color: "#888" }}>Apenas o titular da conta pode gerenciar a equipe.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: -0.5 }}>
            {isCargos ? "Cargos" : "Time"}
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {isCargos
              ? "Defina permissões de acesso por módulo para cada cargo"
              : "Membros da equipe com acesso à plataforma"}
          </div>
        </div>

        {isCargos ? <CargosTab /> : <TimeTab />}
      </div>
    </Layout>
  );
}
