---
name: Express 5 double-router mount
description: Mounting the same Router instance twice (app level + nested router) in Express 5 causes the chain to continue after a response is sent, overriding async handler responses.
---

## Rule
Never mount the same Router instance at two points in the Express 5 middleware chain.

**Why:** In Express 5, mounting `authRouter` both via `app.use("/api", authRouter)` AND inside a nested `router7.use(authRouter)` causes the chain to continue after the first handler sends a response. For *synchronous* handlers the response is correctly sent (chain stops), but for *async* handlers that `await` before responding, Express 5 continues to the next middleware (which can override the response with, e.g., `requireAuth` → 401 "Unauthorized").

**How to apply:**
- Pick ONE mount point per Router instance: prefer mounting auth routes directly at `app.use("/api", authRouter)` (before the main router) rather than inside a sub-router.
- After adding the app-level mount, remove the duplicate from `routes/index.ts`.
- Use safe string logging in catch blocks inside async handlers: `logger.error({ errMsg: msg }, ...)` instead of `logger.error({ err }, ...)` — Firebase/complex error objects can cause pino to throw, which makes the async handler reject and Express propagates the error past the router (no response sent).

## Diagnostic signs
- Route works for **synchronous** early returns (empty body → 400) but fails for **async** paths (real logic → wrong 401 from a later `requireAuth`).
- The rate limiter headers from a **later** middleware appear on the response, confirming the chain continued past the handler that was supposed to respond.

## Fix applied (June 2026)
- `app.ts`: added `import authRouter from "./routes/auth.js"` and `app.use("/api", authRouter)` before `app.use("/api", router)`.
- `routes/index.ts`: removed `router.use(authRouter)` and its import.
- `routes/auth.ts` catch block: changed `logger.error({ err }, ...)` to `try { logger.error({ errMsg: msg }, ...) } catch {}`.
