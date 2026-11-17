import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type EisaxDb = ReturnType<typeof drizzle<typeof schema>>;

interface GlobalDb {
  __eisaxDb?: EisaxDb;
  __eisaxInitializing?: Promise<EisaxDb>;
  __eisaxClient?: PGlite;
  __eisaxShutdownHook?: boolean;
}

const g = globalThis as unknown as GlobalDb;

function dataDir(): string {
  // Isolate Vitest PGlite storage from the local runtime DB to prevent lock/WAL corruption.
  const folder = process.env.EISAX_PG_DATA_DIR || (process.env.VITEST ? "pg-test" : "pg");
  const dir = path.isAbsolute(folder) ? folder : path.resolve(process.env.EISAX_DATA_DIR || path.resolve(process.cwd(), ".data"), folder);
  mkdirSync(path.dirname(dir), { recursive: true });
  return dir;
}

async function runMigrations(client: PGlite): Promise<void> {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const applied = await client.query<{ name: string }>("SELECT name FROM _migrations");
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const migrationsDir = path.resolve(process.cwd(), "src", "lib", "db", "migrations");
  // Deterministic order by filename.
  const entries = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const name of entries) {
    if (appliedNames.has(name)) continue;
    const sql = readFileSync(path.join(migrationsDir, name), "utf8");
    await client.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    });
  }
}

/** Get (and lazily create) the singleton PGlite-backed Drizzle instance. */
export async function getDb(): Promise<EisaxDb> {
  if (g.__eisaxDb) return g.__eisaxDb;
  if (!g.__eisaxInitializing) {
    g.__eisaxInitializing = initializeDb().catch((error) => {
      g.__eisaxInitializing = undefined;
      throw error;
    });
  }
  return g.__eisaxInitializing;
}

async function initializeDb(): Promise<EisaxDb> {
  const client = new PGlite(dataDir());
  await client.waitReady;
  await runMigrations(client);
  const db = drizzle(client, { schema });
  g.__eisaxClient = client;
  g.__eisaxDb = db;
  if (!g.__eisaxShutdownHook) {
    g.__eisaxShutdownHook = true;
    const shutdown = () => {
      void g.__eisaxClient?.close().catch(() => undefined);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
  return db;
}

/** Test helper: returns the underlying client (e.g. to run raw SQL). */
export async function getClient(): Promise<PGlite> {
  await getDb();
  if (!g.__eisaxClient) throw new Error("PGlite client not initialized");
  return g.__eisaxClient;
}
