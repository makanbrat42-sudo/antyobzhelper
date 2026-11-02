// Локальный PostgreSQL для разработки и тестов (без Docker).
// Запуск: npm run db:local  — сервер работает, пока процесс жив (Ctrl+C для остановки).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
// Данные хранятся вне папки проекта, чтобы dev-сервер не реагировал на изменения файлов БД.
const baseDir = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
const dataDir = process.env.LOCAL_PG_DATA ?? path.join(baseDir, "antyobzhelp", "pgdata");
const firstRun = !existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "antyobzhelp",
  password: "antyobzhelp",
  port,
  persistent: true,
  onLog: () => {},
});

if (firstRun) {
  await pg.initialise();
}
await pg.start();

for (const db of ["antyobzhelp", "antyobzhelp_test"]) {
  try {
    await pg.createDatabase(db);
    console.log(`[local-db] создана база ${db}`);
  } catch {
    // уже существует
  }
}

console.log(`[local-db] PostgreSQL запущен: postgresql://antyobzhelp:antyobzhelp@localhost:${port}/antyobzhelp`);

const stop = async () => {
  console.log("[local-db] остановка...");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
