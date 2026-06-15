import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/AdminLayout";

interface Lesson { id: number; title: string; youtubeUrl: string; sortOrder: number; }
interface Module { id: number; title: string; description: string; sortOrder: number; lessons: Lesson[]; }

const apiFetch = (url: string, opts?: RequestInit) =>
  fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });

export function AdminTutorials() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newModTitle, setNewModTitle] = useState("");
  const [newModDesc, setNewModDesc] = useState("");
  const [savingMod, setSavingMod] = useState(false);

  const [lessonForm, setLessonForm] = useState<{ moduleId: number; title: string; url: string } | null>(null);
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonError, setLessonError] = useState("");

  const [editMod, setEditMod] = useState<{ id: number; title: string; description: string } | null>(null);
  const [editLesson, setEditLesson] = useState<{ id: number; moduleId: number; title: string; url: string } | null>(null);

  async function load() {
    try {
      const r = await apiFetch("/api/admin/tutorials");
      if (!r.ok) { setError(`Erro ${r.status}`); return; }
      const d = await r.json() as { modules: Module[] };
      setModules(d.modules ?? []);
    } catch (e) {
      setError("Erro ao carregar: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createModule() {
    if (!newModTitle.trim()) return;
    setSavingMod(true);
    try {
      const r = await apiFetch("/api/admin/tutorials/modules", {
        method: "POST",
        body: JSON.stringify({ title: newModTitle.trim(), description: newModDesc.trim() }),
      });
      if (!r.ok) { alert("Erro ao criar módulo"); return; }
      setNewModTitle(""); setNewModDesc("");
      await load();
    } catch (e) {
      alert("Erro: " + String(e));
    } finally {
      setSavingMod(false);
    }
  }

  async function saveEditMod() {
    if (!editMod || !editMod.title.trim()) return;
    try {
      await apiFetch(`/api/admin/tutorials/modules/${editMod.id}`, {
        method: "PUT",
        body: JSON.stringify({ title: editMod.title.trim(), description: editMod.description.trim() }),
      });
      setEditMod(null);
      await load();
    } catch (e) { alert("Erro: " + String(e)); }
  }

  async function deleteModule(id: number) {
    if (!confirm("Deletar módulo e todas as aulas?")) return;
    try {
      await apiFetch(`/api/admin/tutorials/modules/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { alert("Erro: " + String(e)); }
  }

  async function createLesson() {
    if (!lessonForm || !lessonForm.title.trim() || !lessonForm.url.trim()) return;
    setSavingLesson(true);
    setLessonError("");
    try {
      const r = await apiFetch(`/api/admin/tutorials/modules/${lessonForm.moduleId}/lessons`, {
        method: "POST",
        body: JSON.stringify({ title: lessonForm.title.trim(), youtubeUrl: lessonForm.url.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setLessonError(d.error ?? `Erro ${r.status}`);
        return;
      }
      setLessonForm(null);
      await load();
    } catch (e) {
      setLessonError("Erro: " + String(e));
    } finally {
      setSavingLesson(false);
    }
  }

  async function saveEditLesson() {
    if (!editLesson || !editLesson.title.trim() || !editLesson.url.trim()) return;
    try {
      await apiFetch(`/api/admin/tutorials/lessons/${editLesson.id}`, {
        method: "PUT",
        body: JSON.stringify({ title: editLesson.title.trim(), youtubeUrl: editLesson.url.trim() }),
      });
      setEditLesson(null);
      await load();
    } catch (e) { alert("Erro: " + String(e)); }
  }

  async function deleteLesson(id: number) {
    if (!confirm("Deletar esta aula?")) return;
    try {
      await apiFetch(`/api/admin/tutorials/lessons/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { alert("Erro: " + String(e)); }
  }

  const INPUT: React.CSSProperties = {
    width: "100%", padding: "9px 12px", border: "1px solid #e8eaed",
    borderRadius: 8, fontSize: 13.5, outline: "none", boxSizing: "border-box",
    color: "#111", background: "#fff",
  };

  return (
    <AdminLayout>
      <div style={{ padding: "24px", maxWidth: 860, boxSizing: "border-box" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0, letterSpacing: -0.5 }}>
            Video Aulas
          </h1>
          <p style={{ fontSize: 13, color: "#aaa", margin: "4px 0 0" }}>
            Crie módulos e adicione aulas em vídeo para os assinantes
          </p>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", borderRadius: 8, color: "#991b1b", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── Criar módulo ── */}
        <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "20px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>
            Novo módulo
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              style={{ ...INPUT, flex: "1 1 200px" }}
              placeholder="Título do módulo"
              value={newModTitle}
              onChange={e => setNewModTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createModule()}
            />
            <input
              style={{ ...INPUT, flex: "2 1 300px" }}
              placeholder="Descrição (opcional)"
              value={newModDesc}
              onChange={e => setNewModDesc(e.target.value)}
            />
            <button
              onClick={createModule}
              disabled={savingMod || !newModTitle.trim()}
              style={{
                padding: "9px 20px", borderRadius: 8, border: "none",
                background: "#111", color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: savingMod || !newModTitle.trim() ? "not-allowed" : "pointer",
                opacity: savingMod || !newModTitle.trim() ? 0.5 : 1, whiteSpace: "nowrap",
              }}
            >
              {savingMod ? "Criando..." : "+ Criar módulo"}
            </button>
          </div>
        </div>

        {loading && <div style={{ color: "#bbb", fontSize: 13 }}>Carregando...</div>}

        {/* ── Lista de módulos ── */}
        {modules.map((mod, mi) => (
          <div key={mod.id} style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
            {/* Module header */}
            <div style={{ padding: "16px 20px", background: "#fafafa", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "#111", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {mi + 1}
              </div>
              {editMod?.id === mod.id ? (
                <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ ...INPUT, flex: "1 1 160px" }} value={editMod.title} onChange={e => setEditMod({ ...editMod, title: e.target.value })} />
                  <input style={{ ...INPUT, flex: "2 1 220px" }} value={editMod.description} onChange={e => setEditMod({ ...editMod, description: e.target.value })} placeholder="Descrição" />
                  <button onClick={saveEditMod} style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#111", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => setEditMod(null)} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid #e8eaed", background: "#fff", color: "#666", fontSize: 12.5, cursor: "pointer" }}>Cancelar</button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{mod.title}</div>
                  {mod.description && <div style={{ fontSize: 12.5, color: "#aaa", marginTop: 2 }}>{mod.description}</div>}
                </div>
              )}
              {!editMod && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <ActionBtn label="Editar" onClick={() => setEditMod({ id: mod.id, title: mod.title, description: mod.description })} />
                  <ActionBtn label="Deletar" danger onClick={() => deleteModule(mod.id)} />
                </div>
              )}
            </div>

            {/* Lessons */}
            <div style={{ padding: "12px 20px" }}>
              {mod.lessons.length === 0 && (
                <div style={{ fontSize: 12.5, color: "#ccc", marginBottom: 10 }}>Nenhuma aula ainda</div>
              )}
              {mod.lessons.map((lesson, li) => (
                <div key={lesson.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: li < mod.lessons.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "#f1f5f9", color: "#888", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {li + 1}
                  </div>
                  {editLesson?.id === lesson.id ? (
                    <div style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input style={{ ...INPUT, flex: "1 1 140px", padding: "7px 10px" }} value={editLesson.title} onChange={e => setEditLesson({ ...editLesson, title: e.target.value })} />
                      <input style={{ ...INPUT, flex: "2 1 200px", padding: "7px 10px" }} value={editLesson.url} onChange={e => setEditLesson({ ...editLesson, url: e.target.value })} placeholder="URL YouTube" />
                      <button onClick={saveEditLesson} style={{ padding: "7px 12px", borderRadius: 7, border: "none", background: "#111", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                      <button onClick={() => setEditLesson(null)} style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #e8eaed", background: "#fff", color: "#666", fontSize: 12, cursor: "pointer" }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111" }}>{lesson.title}</div>
                        <div style={{ fontSize: 11.5, color: "#bbb", fontFamily: "monospace" }}>{lesson.youtubeUrl.slice(0, 56)}{lesson.youtubeUrl.length > 56 ? "…" : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <ActionBtn label="Editar" small onClick={() => setEditLesson({ id: lesson.id, moduleId: mod.id, title: lesson.title, url: lesson.youtubeUrl })} />
                        <ActionBtn label="✕" small danger onClick={() => deleteLesson(lesson.id)} />
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Add lesson form */}
              {lessonForm?.moduleId === mod.id ? (
                <div style={{ marginTop: 12 }}>
                  {lessonError && (
                    <div style={{ padding: "6px 10px", background: "#fef2f2", borderRadius: 6, color: "#dc2626", fontSize: 12, marginBottom: 8 }}>
                      {lessonError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      style={{ ...INPUT, flex: "1 1 140px", padding: "8px 10px" }}
                      placeholder="Título da aula"
                      value={lessonForm.title}
                      onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })}
                    />
                    <input
                      style={{ ...INPUT, flex: "2 1 200px", padding: "8px 10px" }}
                      placeholder="URL do YouTube (ex: https://youtu.be/xxx)"
                      value={lessonForm.url}
                      onChange={e => setLessonForm({ ...lessonForm, url: e.target.value })}
                    />
                    <button
                      onClick={createLesson}
                      disabled={savingLesson || !lessonForm.title.trim() || !lessonForm.url.trim()}
                      style={{
                        padding: "8px 14px", borderRadius: 7, border: "none",
                        background: "#111", color: "#fff", fontSize: 12.5, fontWeight: 700,
                        cursor: savingLesson ? "not-allowed" : "pointer",
                        opacity: savingLesson ? 0.6 : 1,
                      }}
                    >
                      {savingLesson ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => { setLessonForm(null); setLessonError(""); }}
                      style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid #e8eaed", background: "#fff", color: "#666", fontSize: 12.5, cursor: "pointer" }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setLessonForm({ moduleId: mod.id, title: "", url: "" }); setLessonError(""); }}
                  style={{
                    marginTop: 10, padding: "7px 14px", borderRadius: 7,
                    border: "1px dashed #d1d5db", background: "transparent",
                    color: "#888", fontSize: 12.5, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Adicionar aula
                </button>
              )}
            </div>
          </div>
        ))}

        {!loading && modules.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#bbb", fontSize: 13.5 }}>
            Nenhum módulo criado ainda. Crie o primeiro acima.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function ActionBtn({ label, onClick, danger, small }: { label: string; onClick: () => void; danger?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? "5px 10px" : "6px 12px",
      borderRadius: 7, border: `1px solid ${danger ? "#fecaca" : "#e8eaed"}`,
      background: danger ? "#fef2f2" : "#fff",
      color: danger ? "#dc2626" : "#555",
      fontSize: small ? 11.5 : 12.5, fontWeight: 600, cursor: "pointer",
      whiteSpace: "nowrap",
    }}>
      {label}
    </button>
  );
}
