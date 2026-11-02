import { describe, expect, it } from "vitest";
import { cooldownEndsAt, isWithinCooldown } from "@/server/services/cooldown";
import { parseVkLink } from "@/server/services/vk-link";
import { mapFormFields } from "@/server/services/applications";
import { settingsSchema } from "@/server/settings";
import { formatApplicationMessage, parseButtonPayload } from "@/server/services/vk-bot";
import { pkcePair, randomToken, signValue, unsignValue } from "@/server/crypto";
import { createHash } from "node:crypto";

const H = 3600_000;

describe("Ограничение 5 суток (чистая логика)", () => {
  const failed = new Date("2026-10-27T12:00:00Z"); // 15:00 МСК

  it("пример из ТЗ: провал 27.10 15:00 МСК → подача разрешена 01.11 15:00 МСК", () => {
    expect(cooldownEndsAt(failed).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
  it("2 дня — ограничение действует", () => {
    expect(isWithinCooldown(failed, new Date(failed.getTime() + 48 * H))).toBe(true);
  });
  it("4 дня — ограничение действует", () => {
    expect(isWithinCooldown(failed, new Date(failed.getTime() + 96 * H))).toBe(true);
  });
  it("за 1 мс до 120 часов — ограничение действует", () => {
    expect(isWithinCooldown(failed, new Date(failed.getTime() + 120 * H - 1))).toBe(true);
  });
  it("ровно 120 часов — подача разрешена", () => {
    expect(isWithinCooldown(failed, new Date(failed.getTime() + 120 * H))).toBe(false);
  });
  it("6 дней — подача разрешена", () => {
    expect(isWithinCooldown(failed, new Date(failed.getTime() + 144 * H))).toBe(false);
  });
  it("29 октября — автоотказ", () => {
    expect(isWithinCooldown(failed, new Date("2026-10-29T09:00:00Z"))).toBe(true);
  });
});

describe("Разбор ссылки VK", () => {
  it.each([
    ["https://vk.com/id123456", { kind: "id", vkId: "123456" }],
    ["vk.com/id123456", { kind: "id", vkId: "123456" }],
    ["https://m.vk.com/id42?from=x", { kind: "id", vkId: "42" }],
    ["https://vk.ru/id7/", { kind: "id", vkId: "7" }],
    ["123456", { kind: "id", vkId: "123456" }],
    ["@durov", { kind: "screen", screenName: "durov" }],
    ["https://vk.com/Durov", { kind: "screen", screenName: "durov" }],
  ])("%s", (input, expected) => {
    expect(parseVkLink(input)).toEqual(expected);
  });
  it("сообщество — некорректно", () => {
    expect(parseVkLink("https://vk.com/club123").kind).toBe("invalid");
  });
  it("чужой сайт — некорректно", () => {
    expect(parseVkLink("https://evil.com/id123").kind).toBe("invalid");
  });
  it("пусто", () => {
    expect(parseVkLink("  ").kind).toBe("empty");
  });
});

describe("Сопоставление полей Google Forms", () => {
  const map = settingsSchema.shape["googleForms.fieldMap"].parse(undefined);
  it("находит поля по названиям вопросов без учёта регистра и двоеточий", () => {
    const r = mapFormFields(
      [
        { question: "Ваш ник:", answer: "Ivan" },
        { question: "ссылка на vk", answer: "vk.com/id1" },
        { question: "Код подтверждения VK", answer: "ABCD-EFGH" },
        { question: "Возраст", answer: "18" },
      ],
      map,
    );
    expect(r.nickname).toBe("Ivan");
    expect(r.vkProfile).toBe("vk.com/id1");
    expect(r.linkCode).toBe("ABCD-EFGH");
    // Код подтверждения не попадает в анкету, которую видят сотрудники.
    expect(r.answers.map((a) => a.question)).toEqual(["Ваш ник:", "ссылка на vk", "Возраст"]);
  });
});

describe("VK-бот: форматирование и кнопки", () => {
  it("сообщение содержит номер, кандидата, VK и анкету", () => {
    const text = formatApplicationMessage(
      {
        id: 1052,
        nickname: "Иван Иванов",
        fullName: null,
        vkId: "123456",
        vkProfileRaw: null,
        submittedAt: new Date("2026-10-29T10:00:00Z"),
        answers: [{ position: 1, question: "Вопрос", answer: "Ответ" }],
      },
      "Ожидает рассмотрения.",
    );
    expect(text).toContain("ANTYOBZHELP | НОВАЯ ЗАЯВКА");
    expect(text).toContain("Номер: #1052");
    expect(text).toContain("VK: vk.com/id123456");
    expect(text).toContain("Дата: 29.10.2026");
    expect(text).toContain("Вопрос 1: Вопрос\nОтвет: Ответ");
    expect(text).toContain("Статус: Ожидает рассмотрения.");
  });
  it("разбор payload кнопки", () => {
    expect(parseButtonPayload('{"a":"approve","id":5}')).toEqual({ a: "approve", id: 5 });
    expect(parseButtonPayload({ a: "reject", id: 7 })).toEqual({ a: "reject", id: 7 });
    expect(parseButtonPayload({ a: "drop", id: 7 })).toBeNull();
    expect(parseButtonPayload("{bad")).toBeNull();
  });
});

describe("Криптография", () => {
  it("state для VK ID — не короче 32 символов из допустимого алфавита", () => {
    const s = randomToken(24);
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("PKCE S256", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
  it("подпись cookie отклоняет подделку", () => {
    const s = signValue("k".repeat(32), "data");
    expect(unsignValue("k".repeat(32), s)).toBe("data");
    expect(unsignValue("k".repeat(32), s.replace("data", "date"))).toBeNull();
    expect(unsignValue("x".repeat(32), s)).toBeNull();
  });
});
