import { readFileSync } from "fs";

// PM2 cluster workers don't inherit --env-file node arg, so we load explicitly
if (process.env.NODE_ENV === "production") {
  try {
    const lines = readFileSync("/var/www/combozap/.env.production", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {}
}
