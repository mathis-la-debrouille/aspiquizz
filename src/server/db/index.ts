import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/server/db/schema";

/**
 * Falls back to a local libSQL file when DATABASE_URL is unset, so the app
 * runs with zero external services — see CLAUDE.md / brief §15.
 */
const url = process.env["DATABASE_URL"]?.trim() || "file:./local.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"]?.trim() || undefined;

export const client = createClient({ url, ...(authToken ? { authToken } : {}) });

export const db = drizzle(client, { schema });

export type Database = typeof db;
