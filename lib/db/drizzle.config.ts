import { defineConfig } from "drizzle-kit";
import path from "path";

const dbUrl = process.env.NEON_URL_DATABASE ?? process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL or NEON_URL_DATABASE, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
