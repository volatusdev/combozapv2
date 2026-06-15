import { useState, useEffect } from "react";
import { Layout } from "../components/Layout";

type Tag = { id: string; name: string; desc: string; createdAt: number };

export function SdrTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    setLoading(true);
    try {
      const res = await fetch("/api/sdr/tags", { credentials: "include" });
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch {
      setTags([]);
    } finally {
      setLoading(false);
    }
  }

  async function createTag() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sdr/tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), desc: newDesc.trim() }),
      });
      const data = await res.json();
      if (data.tag) setTags((prev) => [...prev, data.tag]);
      setNewName("");
      setNewDesc("");
      setCreating(false);
    } catch {
      // silencioso
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(id: string) {
    try {
      await fetch(`/api/sdr/tags/${id}`, { method: "DELETE", credentials: "include" });
      setTags((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silencioso
    }
  }

  return (
    <Layout>
      <div style={{ padding: "32px 36px", maxWidth: 820, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0, marginBottom: 4 }}>Tags de Identificação</h1>
            <p style={{ fontSize: 13.5, color: "#888", margin: 0 }}>Organize seus contatos com etiquetas personalizadas</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: "9px 20px", borderRadius: 9, border: "none",
              background: "#111", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}
          >
            + Nova tag
          </button>
        </div>

        {/* Form de criação */}
        {creating && (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: "22px 24px", marginBottom: 20, background: "#fff" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#111", marginBottom: 16 }}>Nova tag</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 }}>Nome da tag</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createTag()}
                  placeholder="Ex: Lead Quente"
                  style={{
                    width: "100%", padding: "9px 14px", borderRadius: 8,
                    border: "1px solid #e0e0e0", fontSize: 14, outline: "none",
                    color: "#111", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 }}>
                  Descrição <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span>
                </label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Ex: Leads com alta intenção de compra"
                  style={{
                    width: "100%", padding: "9px 14px", borderRadius: 8,
                    border: "1px solid #e0e0e0", fontSize: 14, outline: "none",
                    color: "#111", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={createTag}
                  disabled={!newName.trim() || saving}
                  style={{
                    padding: "9px 22px", borderRadius: 8, border: "none",
                    background: "#111", color: "#fff", fontSize: 13.5, fontWeight: 700,
                    cursor: !newName.trim() || saving ? "not-allowed" : "pointer",
                    opacity: !newName.trim() ? 0.5 : 1,
                  }}
                >
                  {saving ? "Criando..." : "Criar tag"}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                  style={{
                    padding: "9px 22px", borderRadius: 8,
                    border: "1px solid #e0e0e0", background: "#fff",
                    fontSize: 13.5, fontWeight: 600, color: "#555", cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spinner />
          </div>
        )}

        {/* Lista de tags */}
        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tags.map((tag) => (
              <div
                key={tag.id}
                style={{
                  border: "1px solid #e8e8e8", borderRadius: 11, padding: "16px 20px",
                  background: "#fff", display: "flex", alignItems: "center", gap: 16,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <TagIcon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "#111", marginBottom: 2 }}>{tag.name}</div>
                  {tag.desc && (
                    <div style={{ fontSize: 12.5, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tag.desc}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteTag(tag.id)}
                  title="Excluir"
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e5e5",
                    background: "#fafafa", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", color: "#999",
                    flexShrink: 0,
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}

            {tags.length === 0 && !creating && (
              <div style={{
                border: "1px dashed #e0e0e0", borderRadius: 12,
                padding: "56px 20px", textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>Nenhuma tag ainda</div>
                <div style={{ fontSize: 13.5, color: "#888", marginBottom: 20 }}>
                  Crie tags para segmentar e organizar seus contatos do WhatsApp.
                </div>
                <button
                  onClick={() => setCreating(true)}
                  style={{
                    padding: "9px 22px", borderRadius: 9, border: "none",
                    background: "#111", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Criar primeira tag
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function TagIcon() {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}
function TrashIcon() {
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
}
function Spinner() {
  return (
    <div style={{ width: 28, height: 28, border: "2.5px solid #f0f0f0", borderTop: "2.5px solid #111", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
