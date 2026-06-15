---
name: Firebase Auth integration
description: Owner accounts via Firebase (email+Google), team members keep bcrypt fallback; critical deploy and routing lessons
---

# Firebase Auth integration

## Rule
Owner accounts authenticate via Firebase (email/password + Google). Team members still use the old bcrypt `/api/auth/login` endpoint. The frontend tries Firebase first and falls back to bcrypt on `auth/user-not-found` or `auth/invalid-credential`.

**Why:** Firebase handles password reset, OAuth providers, and security out of the box; bcrypt fallback preserves existing team member sessions without a migration.

## How to apply
- Backend: `POST /api/auth/firebase-sync` — verifies Firebase ID token, finds-or-creates user in DB (by `firebaseUid` OR `email`), sets `req.session.userId`.
- Frontend: `auth-context.tsx` `login()` → Firebase first, fallback to `/api/auth/login`; `loginWithGoogle()` → popup; `register()` → Firebase only.
- DB: `firebase_uid TEXT UNIQUE` column on `users` table (added via raw SQL, not drizzle push, because existing rows need NULL).
- Secrets needed: `FIREBASE_PRIVATE_KEY` (server), `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (client).

## Critical gotcha — duplicate drizzle-orm peer resolution
`firebase-admin` depends on `@opentelemetry/api`, which causes pnpm to create two peer-resolution variants of `drizzle-orm` (with and without opentelemetry). TypeScript sees them as distinct types and fails. Fix: add `"@opentelemetry/api": "1.9.0"` to `overrides` in `pnpm-workspace.yaml`, then run `pnpm install`.

## DB migration note
`drizzle-kit push` fails interactively (TTY required) when existing rows are present and a UNIQUE constraint is being added. Use raw SQL instead:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;
```

## Routing: firebase-sync must NOT be behind requireAuth
- `sdr-agents.ts` has `router.use(requireAuth)` globally — applies to ALL routes that fall through to that sub-router
- `routes/index.ts` mounts: `health → auth → sdr-whatsapp → sdr-plan → sdr-agents → team`
- If `/auth/firebase-sync` is NOT registered in `authRouter`, request falls through to `sdr-agents` and gets 401 "Unauthorized"
- **Root cause of VPS bug**: old GitHub code didn't have the firebase-sync route; Replit had the fix but wasn't pushed

## Error handling — always JSON, never HTML
- Use `logger.error(...)` (from `lib/logger.ts`) in catch blocks, NOT `req.log.error` (can be undefined in some Express contexts)
- Express 5 default error handler returns HTML; always add a 4-parameter `(err, req, res, next)` handler as the LAST middleware in `app.ts`
- Wrap DB operations in public routes (firebase-sync, register) in try/catch returning JSON 503, not letting them bubble to Express default handler

## Deploy: env var injection pattern
- `deploy.yml` creates `.env.production` only on FIRST deploy; subsequent deploys keep existing values EXCEPT for explicitly injected vars
- `DATABASE_URL` placeholder `SENHA` causes register 500 (DB unreachable → Express HTML error page)
- Fixed: deploy.yml now injects DATABASE_URL and SESSION_SECRET from GitHub Actions secrets (base64-encoded, same pattern as Firebase vars)
- GitHub Actions secrets needed: VPS_SSH_KEY, VPS_HOST, VPS_USER, VPS_PORT, GH_PAT, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, **DATABASE_URL**, **SESSION_SECRET**

## Push to GitHub
- Replit `origin` remote URL has placeholder `SEU_TOKEN` — must be updated with real GitHub PAT before pushing
- Deploy triggered by push to `main` on GitHub → GitHub Actions runs deploy.yml → VPS pulls from GitHub, builds, restarts PM2
