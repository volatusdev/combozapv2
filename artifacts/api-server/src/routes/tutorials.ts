import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { db } from "@workspace/db";

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPool = () => (db as any).$client as import("pg").Pool;

async function q<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

async function getAllModulesWithLessons() {
  const mods = await q<{ id: number; title: string; description: string; sort_order: number }>(
    "SELECT id, title, description, sort_order FROM tutorials_modules ORDER BY sort_order ASC, created_at ASC"
  );
  const lsns = await q<{ id: number; module_id: number; title: string; youtube_url: string; sort_order: number }>(
    "SELECT id, module_id, title, youtube_url, sort_order FROM tutorials_lessons ORDER BY sort_order ASC, created_at ASC"
  );
  return mods.map(m => ({
    id: Number(m.id),
    title: m.title,
    description: m.description ?? "",
    sortOrder: Number(m.sort_order),
    lessons: lsns
      .filter(l => Number(l.module_id) === Number(m.id))
      .map(l => ({
        id: Number(l.id),
        moduleId: Number(l.module_id),
        title: l.title,
        youtubeUrl: l.youtube_url,
        sortOrder: Number(l.sort_order),
      })),
  }));
}

// Client: view all modules + lessons (requires login)
router.get("/tutorials", requireAuth, async (_req, res) => {
  try {
    const modules = await getAllModulesWithLessons();
    res.json({ modules });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// Admin: list modules + lessons
router.get("/admin/tutorials", requireAdmin, async (_req, res) => {
  try {
    const modules = await getAllModulesWithLessons();
    res.json({ modules });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// Admin: create module
router.post("/admin/tutorials/modules", requireAdmin, async (req, res) => {
  try {
    const { title, description } = req.body as { title: string; description?: string };
    if (!title?.trim()) { res.status(400).json({ error: "Título obrigatório" }); return; }
    const [{ count }] = await q<{ count: string }>("SELECT COUNT(*)::int AS count FROM tutorials_modules");
    const [mod] = await q<{ id: number; title: string; description: string; sort_order: number }>(
      "INSERT INTO tutorials_modules (title, description, sort_order) VALUES ($1, $2, $3) RETURNING id, title, description, sort_order",
      [title.trim(), description?.trim() ?? "", Number(count ?? 0)]
    );
    res.json({ module: { id: Number(mod.id), title: mod.title, description: mod.description, sortOrder: Number(mod.sort_order), lessons: [] } });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

// Admin: update module
router.put("/admin/tutorials/modules/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { title, description } = req.body as { title: string; description?: string };
    if (!title?.trim()) { res.status(400).json({ error: "Título obrigatório" }); return; }
    await q("UPDATE tutorials_modules SET title=$1, description=$2, updated_at=NOW() WHERE id=$3", [title.trim(), description?.trim() ?? "", id]);
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

// Admin: delete module (cascades lessons via FK)
router.delete("/admin/tutorials/modules/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await q("DELETE FROM tutorials_modules WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

// Admin: create lesson in module
router.post("/admin/tutorials/modules/:moduleId/lessons", requireAdmin, async (req, res) => {
  try {
    const moduleId = parseInt(String(req.params.moduleId), 10);
    const { title, youtubeUrl } = req.body as { title: string; youtubeUrl: string };
    if (!title?.trim() || !youtubeUrl?.trim()) { res.status(400).json({ error: "Título e URL obrigatórios" }); return; }
    const [{ count }] = await q<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM tutorials_lessons WHERE module_id=$1", [moduleId]
    );
    const [lesson] = await q<{ id: number; module_id: number; title: string; youtube_url: string; sort_order: number }>(
      "INSERT INTO tutorials_lessons (module_id, title, youtube_url, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, module_id, title, youtube_url, sort_order",
      [moduleId, title.trim(), youtubeUrl.trim(), Number(count ?? 0)]
    );
    res.json({ lesson: { id: Number(lesson.id), moduleId: Number(lesson.module_id), title: lesson.title, youtubeUrl: lesson.youtube_url, sortOrder: Number(lesson.sort_order) } });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

// Admin: update lesson
router.put("/admin/tutorials/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { title, youtubeUrl } = req.body as { title: string; youtubeUrl: string };
    if (!title?.trim() || !youtubeUrl?.trim()) { res.status(400).json({ error: "Título e URL obrigatórios" }); return; }
    await q("UPDATE tutorials_lessons SET title=$1, youtube_url=$2, updated_at=NOW() WHERE id=$3", [title.trim(), youtubeUrl.trim(), id]);
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

// Admin: delete lesson
router.delete("/admin/tutorials/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await q("DELETE FROM tutorials_lessons WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: String(err) }); }
});

export default router;
