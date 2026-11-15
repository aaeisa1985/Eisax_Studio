// Standalone migration runner (no TS imports needed):
//   npm run db:migrate
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

mkdirSync(path.resolve(process.cwd(), ".data"), { recursive: true });
const client = new PGlite(path.resolve(process.cwd(), ".data", "pg"));
await client.waitReady;

await client.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
const applied = await client.query<{ name: string }>("SELECT name FROM _migrations");
const appliedNames = new Set(applied.rows.map((r) => r.name));

const dir = path.resolve(process.cwd(), "src", "lib", "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;
for (const f of files) {
  if (appliedNames.has(f)) continue;
  const sql = readFileSync(path.join(dir, f), "utf8");
  await client.transaction(async (tx) => {
    await tx.exec(sql);
    await tx.query("INSERT INTO _migrations (name) VALUES ($1)", [f]);
  });
  console.log(`applied ${f}`);
  ran++;
}
console.log(ran === 0 ? "migrations up to date" : `applied ${ran} migration(s)`);
await client.close();
