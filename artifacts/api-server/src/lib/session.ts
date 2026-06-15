import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";

const PgStore = pgSession(session);

const DB_URL = process.env.NEON_URL_DATABASE ?? process.env.DATABASE_URL ?? "";

const sessionPool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const sessionMiddleware = session({
  store: new PgStore({
    pool: sessionPool,
    createTableIfMissing: true,
    tableName: "user_sessions",
    ttl: SESSION_TTL_MS / 1000,
  }),
  secret: process.env.SESSION_SECRET ?? "combozap-dev-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
});
