import "./lib/load-env.js"; // must be first — loads .env.production before other modules read process.env
import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./lib/migrate.js";
import { setupCallSignaling } from "./lib/call-signaling.js";
import { startCallReminders } from "./lib/call-reminders.js";

const port = parseInt(process.env.PORT ?? "8001", 10);

const httpServer = createServer(app);
setupCallSignaling(httpServer);

runMigrations()
  .then(() => {
    httpServer.listen(port, () => {
      logger.info({ port }, "ComboZap API running");
      startCallReminders();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migrations failed — starting anyway");
    httpServer.listen(port, () => {
      logger.info({ port }, "ComboZap API running (migrations skipped)");
    });
  });
