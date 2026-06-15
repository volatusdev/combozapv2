---
name: VPS deploy setup
description: combozap.com VPS deploy via GitHub Actions; critical env vars, port conflicts, secrets
---

## Key constraints

- GitHub repo: volatusdev-netizen/combozap; deploy workflow: push/dispatch to main → SSH to VPS
- VPS serves combozap-api on port 3001; nginx proxies app.combozap.com/api/ → 127.0.0.1:3001
- `volatusnet-api` (old app) also runs on PM2 — deploy must `pm2 delete volatusnet-api` first or combozap-api cannot bind port 3001

## GitHub Actions secrets required
- `DATABASE_URL` — Neon pooler URL (sa-east-1.aws.neon.tech)
- `SESSION_SECRET` — express-session secret
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — Firebase Admin SDK
- `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `GH_PAT`

## Hardcoded defaults in code (no secret needed)
- `EVO_URL` defaults to `http://2.25.180.138:8080`
- `EVO_KEY` defaults to `katrivo-evolution-secret-2025`

## Non-secret env injected by deploy script
- `APP_DOMAIN=app.combozap.com` — MUST be set or webhook URLs point to volatusnet.com (wrong)

**Why:** resolveAppDomain() falls back to "volatusnet.com" if APP_DOMAIN not set — no messages arrive in prod.
**How to apply:** deploy.yml already injects APP_DOMAIN after DATABASE_URL injection block.
