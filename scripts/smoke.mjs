// Сквозная проверка через HTTP против запущенного dev-сервера (npm run dev).
// Требует DEV_LOGIN_ENABLED=true, SETUP_TOKEN и GOOGLE_FORMS_SECRET в .env. Только для локальной базы!
import "dotenv/config";
import { createHmac } from "node:crypto";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const SECRET = process.env.GOOGLE_FORMS_SECRET;
let failures = 0;

function check(cond, msg) {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) failures++;
}

class Client {
  cookies = new Map();
  async req(path, { method, body } = {}) {
    method ??= body ? "POST" : "GET";
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const [k, ...v] = kv.split("=");
      this.cookies.set(k.trim(), v.join("="));
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }
}

async function postForm(vk, nickname) {
  const payload = JSON.stringify({
    responseId: `smoke-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    answers: [
      { question: "Ник", answer: nickname },
      { question: "Ссылка на VK", answer: vk },
      { question: "Почему вы хотите в КП?", answer: "Хочу помогать" },
    ],
  });
  const ts = String(Date.now());
  const sig = createHmac("sha256", SECRET).update(`${ts}.${payload}`).digest("hex");
  const res = await fetch(`${BASE}/api/integrations/google-forms`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-aoh-timestamp": ts, "x-aoh-signature": sig },
    body: payload,
  });
  return { status: res.status, json: await res.json() };
}

const suffix = String(Date.now()).slice(-6);
const admin = new Client();
const caller = new Client();

// 1. Страницы отдаются
for (const p of ["/login", "/link", "/dashboard", "/reports", "/queue"]) {
  const r = await new Client().req(p);
  check(r.status === 200, `страница ${p} → ${r.status}`);
}

// 2. Без входа API закрыт
check((await new Client().req("/api/dashboard")).status === 401, "API без сессии → 401");

// 3. Вход администратора и первоначальная настройка
let r = await admin.req("/api/auth/dev-login", { body: { vkId: `9${suffix}`, firstName: "Админ", lastName: "Смоук" } });
check(r.status === 200, `dev-login администратора (${r.json?.status})`);
let me = (await admin.req("/api/auth/me")).json;
if (me.user.status !== "ACTIVE") {
  if (me.setupAvailable) {
    r = await admin.req("/api/auth/setup", { body: { token: process.env.SETUP_TOKEN } });
    check(r.status === 200, `первоначальная настройка администратора → ${r.status} ${r.json?.error?.message ?? ""}`);
  } else {
    console.log("! Администратор уже существует — используйте его вход. Пропуск остальных шагов.");
    process.exit(failures ? 1 : 0);
  }
}
me = (await admin.req("/api/auth/me")).json;
check(me.user.status === "ACTIVE" && me.user.permissions.includes("system.manage"), "администратор активен и имеет system.manage");
check(me.setupAvailable === false, "повторная настройка недоступна");

// 4. Регистрация обзвонщика
r = await caller.req("/api/auth/dev-login", { body: { vkId: `8${suffix}`, firstName: "Обзвонщик", lastName: "Смоук" } });
check(r.json?.status === "PENDING", "новый сотрудник получает статус PENDING");
check((await caller.req("/api/dashboard")).status === 403, "сотрудник без одобрения не имеет доступа");
const regs = (await admin.req("/api/registrations")).json.rows;
const reg = regs.find((x) => x.user.vkId === `8${suffix}`);
const roles = (await admin.req("/api/roles")).json.roles;
const helper = roles.find((x) => x.key === "helper");
const junior = roles.find((x) => x.key === "junior_caller");
r = await admin.req(`/api/registrations/${reg.id}`, { body: { approve: true, mainRoleId: helper.id, callerRoleId: junior.id } });
check(r.status === 200, "администратор одобрил регистрацию с должностями");
const callerMe = (await caller.req("/api/auth/me")).json.user;
check(callerMe.status === "ACTIVE" && callerMe.permissions.includes("applications.assign"), "обзвонщик активен, право applications.assign");
check(!callerMe.permissions.includes("applications.approve"), "у обзвонщика нет права принимать заявки");

// 5. Анкета → решение → очередь → обзвон «Не прошёл»
const candVk = `7${suffix}`;
let f = await postForm(`https://vk.com/id${candVk}`, `Кандидат ${suffix}`);
check(f.status === 200, `анкета принята → ${f.json?.status}`);
const appId = f.json.applicationId;
// В STRICT-режиме ссылка не подтверждает владение — но ограничений нет, заявка идёт руководству
check(f.json.status === "PENDING_REVIEW", "заявка ожидает рассмотрения");
r = await caller.req(`/api/applications/${appId}/decision`, { body: { decision: "APPROVED" } });
check(r.status === 403, "обзвонщик не может принять заявку (403)");
r = await admin.req(`/api/applications/${appId}/decision`, { body: { decision: "APPROVED" } });
check(r.json?.status === "APPROVED_WAITING_CALLER", "администратор принял заявку");
r = await admin.req(`/api/applications/${appId}/decision`, { body: { decision: "REJECTED" } });
check(r.status === 409 && r.json?.error?.message === "Заявка уже обработана", "повторное решение → «Заявка уже обработана»");
const queue = (await caller.req("/api/applications?view=queue")).json.rows;
check(queue.some((x) => x.id === appId), "заявка в очереди обзвонщиков");
r = await caller.req(`/api/applications/${appId}/claim`, { method: "POST" });
check(r.status === 200, "обзвонщик взял заявку");
r = await admin.req(`/api/applications/${appId}/claim`, { method: "POST" });
check(r.status === 409, "второй раз взять заявку нельзя (409)");
const my = (await caller.req("/api/applications?view=my")).json.rows;
check(my.some((x) => x.id === appId), "заявка в «Мои заявки»");
r = await caller.req(`/api/applications/${appId}/call`, { body: { action: "start" } });
check(r.status === 200, "обзвон начат");
r = await caller.req(`/api/applications/${appId}/call`, { body: { action: "finish", outcome: "FAILED", reason: "Не ответил на вопросы" } });
check(r.status === 200, `обзвон завершён «Не прошёл» (длительность ${r.json?.durationSec} с)`);

// 6. Повторная подача → в STRICT-режиме проверка VK ID, после подтверждения — автоотказ
f = await postForm(`https://vk.com/id${candVk}`, `Кандидат ${suffix}`);
check(f.json.status === "IDENTITY_CHECK", `повторная анкета по неподтверждённой ссылке → ${f.json.status}`);
r = await admin.req(`/api/applications/${f.json.applicationId}/identity`, { body: { vkId: candVk, comment: "smoke" } });
check(r.json?.status === "AUTO_REJECTED_COOLDOWN", "после подтверждения VK → автоотказ AUTO_REJECTED_COOLDOWN");

// 7. Отчёт и история
const report = (await admin.req(`/api/reports/applications?vkId=${candVk}`)).json;
check(report.total === 2, "в отчёте 2 заявки кандидата");
const auto = report.rows.find((x) => x.status === "AUTO_REJECTED_COOLDOWN");
check(auto?.decisionSource === "SYSTEM", "автоотказ: решение «Система»");
const approved = report.rows.find((x) => x.id === appId);
check(approved?.decidedBy?.nickname === "Админ Смоук", "принятая: указан ник принявшего");
const hist = (await admin.req(`/api/candidates/${candVk}`)).json;
check(hist.restriction.active === true && !!hist.restriction.allowedFrom, `ограничение действует до ${hist.restriction.allowedFrom}`);
check((await caller.req(`/api/reports/applications`)).status === 403, "младший обзвонщик не видит отчёт (403)");

// 8. «Кандидат уведомлён»
r = await admin.req(`/api/applications/${appId}/notified`, { body: { notified: true } });
check(r.status === 200, "отметка «Кандидат уведомлён» сохранена");

// 9. Дашборд, рейтинг, журнал, CSV
check((await caller.req("/api/dashboard")).json?.caller?.failed >= 1, "дашборд обзвонщика считает неуспешную проверку");
check((await admin.req("/api/rating?period=today")).status === 200, "рейтинг доступен");
check((await admin.req("/api/audit")).json?.total > 0, "журнал действий заполнен");
r = await admin.req(`/api/reports/applications/export?vkId=${candVk}`);
check(r.status === 200 && r.text.includes(candVk), "экспорт CSV");

console.log(failures ? `\n${failures} проверок не прошло` : "\nВсе сквозные проверки пройдены");
process.exit(failures ? 1 : 0);
