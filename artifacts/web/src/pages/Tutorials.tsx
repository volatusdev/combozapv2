import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";

interface Lesson { id: number; title: string; youtubeUrl: string; sortOrder: number; }
interface Module { id: number; title: string; description: string; lessons: Lesson[]; }

function getEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    let videoId = "";
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("?")[0];
    } else if (u.hostname.includes("youtube.com")) {
      if (u.pathname.includes("/embed/")) {
        videoId = u.pathname.replace("/embed/", "").split("?")[0];
      } else {
        videoId = u.searchParams.get("v") ?? "";
      }
    }
    if (videoId) return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=0`;
  } catch {}
  return url;
}

export function Tutorials() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [openModules, setOpenModules] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/tutorials", { credentials: "include" })
      .then(r => r.json())
      .then((d: { modules: Module[] }) => {
        const mods = d.modules ?? [];
        setModules(mods);
        if (mods.length > 0) {
          setOpenModules(new Set([mods[0].id]));
          if (mods[0].lessons.length > 0) setActiveLesson(mods[0].lessons[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleModule(id: number) {
    setOpenModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);

  return (
    <Layout>
      <div style={{
        display: "flex", height: "calc(100vh - 48px)", background: "#0d0d0d",
        overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

        {/* ── Left: Player ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Player area */}
          <div style={{ background: "#000", aspectRatio: "16/9", maxHeight: "calc(100vh - 180px)", position: "relative", flexShrink: 0 }}>
            {loading ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14 }}>
                Carregando...
              </div>
            ) : activeLesson ? (
              <iframe
                key={activeLesson.id}
                src={getEmbedUrl(activeLesson.youtubeUrl)}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#555" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <div style={{ marginTop: 12, fontSize: 14 }}>Nenhuma aula disponível</div>
              </div>
            )}
          </div>

          {/* Lesson info */}
          <div style={{ flex: 1, padding: "20px 24px", background: "#111", borderTop: "1px solid #1f1f1f" }}>
            {activeLesson ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: -0.3 }}>
                  {activeLesson.title}
                </div>
                <div style={{ fontSize: 12.5, color: "#555" }}>
                  {totalLessons} aula{totalLessons !== 1 ? "s" : ""} · {modules.length} módulo{modules.length !== 1 ? "s" : ""}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "#555" }}>Selecione uma aula ao lado</div>
            )}
          </div>
        </div>

        {/* ── Right: Modules + Lessons list ── */}
        <div style={{
          width: 320, flexShrink: 0, background: "#161616",
          borderLeft: "1px solid #1f1f1f", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1f1f1f", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: -0.2 }}>Conteúdo do Curso</div>
            <div style={{ fontSize: 11.5, color: "#555", marginTop: 2 }}>
              {modules.length} módulo{modules.length !== 1 ? "s" : ""} · {totalLessons} aula{totalLessons !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: 24, color: "#555", fontSize: 13 }}>Carregando...</div>
            )}
            {!loading && modules.length === 0 && (
              <div style={{ padding: 24, color: "#555", fontSize: 13, textAlign: "center" }}>
                Nenhuma aula disponível ainda
              </div>
            )}
            {modules.map((mod, mi) => {
              const isOpen = openModules.has(mod.id);
              return (
                <div key={mod.id} style={{ borderBottom: "1px solid #1f1f1f" }}>
                  {/* Module header */}
                  <button
                    onClick={() => toggleModule(mod.id)}
                    style={{
                      width: "100%", padding: "14px 20px", background: "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 10,
                    }}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "#222", color: "#888", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {mi + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd", lineHeight: 1.3 }}>{mod.title}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{mod.lessons.length} aula{mod.lessons.length !== 1 ? "s" : ""}</div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {/* Lessons */}
                  {isOpen && (
                    <div>
                      {mod.lessons.map((lesson, li) => {
                        const isActive = activeLesson?.id === lesson.id;
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => setActiveLesson(lesson)}
                            style={{
                              width: "100%", padding: "11px 20px 11px 40px",
                              background: isActive ? "#222" : "transparent",
                              border: "none", cursor: "pointer", textAlign: "left",
                              display: "flex", alignItems: "center", gap: 10,
                              borderLeft: isActive ? "3px solid #22c55e" : "3px solid transparent",
                              transition: "background 0.1s",
                            }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: isActive ? "#22c55e" : "#1f1f1f", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {isActive ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#555" }}>{li + 1}</span>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : "#aaa", lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {lesson.title}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {mod.lessons.length === 0 && (
                        <div style={{ padding: "10px 20px 10px 40px", fontSize: 12, color: "#444" }}>Nenhuma aula neste módulo</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
