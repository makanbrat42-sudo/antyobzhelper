// Скриншоты интерфейса для визуальной проверки (локально). Использует dev-login.
import "dotenv/config";
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Вне папки проекта — иначе dev-сервер перезагружает страницу при записи файлов.
const OUT = path.join(os.tmpdir(), "antyobzhelp-screens");

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `SELECT u."vkId", u."firstName", u."lastName" FROM "User" u JOIN "UserRole" ur ON ur."userId" = u.id JOIN "Role" r ON r.id = ur."roleId" WHERE r.key = 'admin' AND u.status = 'ACTIVE' LIMIT 1`,
);
await client.end();
if (!rows[0]) throw new Error("Нет активного администратора");

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const pages = (process.argv[2] ?? "/dashboard,/review,/queue,/my,/reports,/candidates,/employees,/rating,/admin/leadership,/admin/roles,/admin/settings,/admin/audit").split(",");
for (const [label, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.request.post(`${BASE}/api/auth/dev-login`, { data: { vkId: rows[0].vkId, firstName: rows[0].firstName ?? "Админ", lastName: rows[0].lastName ?? "" } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const p of label === "mobile" ? pages.slice(0, 3) : pages) {
    await page.goto(BASE + p, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const name = p.replace(/\//g, "_").replace(/^_/, "") || "root";
    await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`), fullPage: label === "desktop" });
    console.log(`${label} ${p} ok`);
  }
  if (errors.length) console.log("Ошибки в консоли:", [...new Set(errors)].slice(0, 10));
  await ctx.close();
}
await browser.close();
