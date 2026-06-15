# ComboZap SDR

Plataforma WhatsApp CRM com Evolution API para gestão de atendimento, contatos, tags, disparo em massa e conexões multi-slot.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session encryption key

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + express-session + bcrypt + express-rate-limit
- DB: PostgreSQL + Drizzle ORM
- Frontend: React 19 + Vite + wouter (routing) + @tanstack/react-query
- Styles: pure inline styles (no Tailwind/shadcn in the frontend)
- Build: esbuild (CJS bundle for API)

## Where things live

- `artifacts/api-server/src/` — Express API server
  - `routes/auth.ts` — register, login, logout, me endpoints
  - `routes/sdr-whatsapp.ts` — Evolution API proxy (slots, contacts, messages)
  - `routes/sdr-plan.ts` — user plan management
  - `lib/session.ts` — express-session config
  - `lib/auth.ts` — requireAuth middleware
- `artifacts/web/src/` — React frontend (port 22333, preview path `/`)
  - `pages/` — Landing, SdrAtendimento, SdrConexao, SdrContatos, SdrDisparo, SdrMeuPlano, SdrTags
  - `components/Layout.tsx`, `Sidebar.tsx` — shell layout
  - `lib/api.ts` — raw fetch API client
  - `lib/auth-context.tsx` — auth React context
- `lib/db/src/schema/` — Drizzle schema (users, sdr_tags, sdr_contact_tags, sdr_user_plans, sdr_orders, sdr_slots)

## Architecture decisions

- Contract via raw fetch in `lib/api.ts` (not OpenAPI/codegen) — matches cloned repo's approach.
- Sessions stored server-side via express-session (not JWT) for simplicity and revocability.
- Rate limiting only active in production (`skip: () => !isProd`) to avoid dev friction.
- bcrypt added to `onlyBuiltDependencies` in `pnpm-workspace.yaml` for native compilation.
- Replit shared proxy handles `/api` routing — no Vite proxy config needed.

## Product

- Landing page pública com CTA de cadastro
- Autenticação com registro/login/logout
- SDR Atendimento: inbox de mensagens WhatsApp
- SDR Conexão: gerenciamento de slots/instâncias Evolution API
- SDR Contatos: CRM de contatos WhatsApp
- SDR Disparo: envio de mensagens em massa
- SDR Meu Plano: gestão de plano e créditos
- SDR Tags: categorização de contatos

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/db run push` after any schema change in `lib/db/src/schema/`.
- `bcrypt` requires native build — it's in `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
- The API server listens on port 8080 (controlled by workflow env var `PORT`).
- Session secret must be set as `SESSION_SECRET` env var (already configured as Replit secret).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
