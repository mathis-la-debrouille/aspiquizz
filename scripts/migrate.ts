/**
 * Applies pending Drizzle migrations. Runs standalone (`pnpm db:migrate`) and
 * is also called at server boot (brief §15) before the HTTP server starts
 * listening.
 */
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, client } from "@/server/db";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./src/server/db/migrations" });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runMigrations()
    .then(() => {
      console.log(JSON.stringify({ event: "migrate_complete" }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "migrate_failed", error: String(error) }));
      process.exit(1);
    });
}
