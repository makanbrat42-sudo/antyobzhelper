// Резервная копия базы в ./backups.
//  • Если доступен pg_dump (PATH или PG_DUMP) — дамп в формате custom (восстановление: pg_restore).
//  • Иначе — логическая выгрузка всех таблиц в JSON (без внешних утилит).
// Использует DIRECT_URL (или DATABASE_URL).
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

const dir = path.resolve("backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function tryPgDump() {
  const file = path.join(dir, `antyobzhelp-${stamp}.dump`);
  try {
    execFileSync(process.env.PG_DUMP ?? "pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, url], { stdio: "inherit" });
    return file;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function jsonExport() {
  const file = path.join(dir, `antyobzhelp-${stamp}.json`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
    );
    const { rows: mig } = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`);
    const data = { createdAt: new Date().toISOString(), migrations: mig.map((m) => m.migration_name), tables: {} };
    for (const { tablename } of tables) {
      const { rows } = await client.query(`SELECT * FROM "${tablename}"`);
      data.tables[tablename] = rows;
    }
    await client.query("COMMIT");
    writeFileSync(file, JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    return file;
  } finally {
    await client.end();
  }
}

const file = tryPgDump() ?? (console.log("[backup] pg_dump не найден — выгрузка в JSON"), await jsonExport());
console.log(`[backup] сохранено: ${file}`);

// Храним последние N копий.
const keep = Number(process.env.BACKUP_KEEP ?? 14);
const files = readdirSync(dir).filter((f) => /\.(dump|json)$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(path.join(dir, f));
