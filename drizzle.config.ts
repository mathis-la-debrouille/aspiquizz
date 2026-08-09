import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"]?.trim() || "file:./local.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"]?.trim();

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "turso",
  dbCredentials: { url, ...(authToken ? { authToken } : {}) },
  strict: true,
  verbose: true,
});
