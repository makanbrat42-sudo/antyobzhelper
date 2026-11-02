import { z } from "zod";
import { prisma, type Db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB");

export const fieldMapSchema = z.object({
  nickname: z.array(z.string()).default(["Ник", "Ваш ник", "Никнейм", "Игровой ник"]),
  fullName: z.array(z.string()).default(["ФИО", "Имя", "Как вас зовут"]),
  vkProfile: z.array(z.string()).default(["VK", "Ссылка на VK", "Ссылка на ВК", "ВКонтакте", "Профиль VK"]),
  vkId: z.array(z.string()).default(["VK ID", "ID VK"]),
  linkCode: z.array(z.string()).default(["Код подтверждения VK", "Код подтверждения"]),
});

export const settingsSchema = z.object({
  "site.name": z.string().min(1).max(60).default("AntyObzhelp"),
  "site.logoUrl": z.union([z.url(), z.literal("")]).default(""),
  "site.accentColor": hexColor.default("#8B5CF6"),
  "site.accentColor2": hexColor.default("#3B82F6"),
  "discord.inviteUrl": z.union([z.url(), z.literal("")]).default(""),
  /** Срок ограничения повторной подачи после результата «Не прошёл», в часах. */
  "cooldown.hours": z.number().int().min(1).max(24 * 365).default(120),
  /**
   * STRICT — если VK ID взят только из текстовой ссылки (не подтверждён), совпадение с ограничением
   *          отправляет заявку на ручную проверку VK ID, а не в автоотказ.
   * LINK   — ссылка из анкеты считается достаточной для автоотказа.
   */
  "identity.cooldownMode": z.enum(["STRICT", "LINK"]).default("STRICT"),
  "googleForms.fieldMap": fieldMapSchema.default(fieldMapSchema.parse({})),
  "googleForms.enabled": z.boolean().default(true),
  "vkBot.enabled": z.boolean().default(true),
  timezone: z.string().default("Europe/Moscow"),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(settingsSchema.shape) as SettingKey[];

export async function getSettings(db: Db = prisma): Promise<Settings> {
  const rows = await db.systemSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  // Некорректные сохранённые значения заменяются значениями по умолчанию.
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const field = settingsSchema.shape[key];
    const parsed = field.safeParse(raw[key]);
    out[key] = parsed.success ? parsed.data : field.parse(undefined);
  }
  return out as Settings;
}

export async function getSetting<K extends SettingKey>(key: K, db: Db = prisma): Promise<Settings[K]> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  const field = settingsSchema.shape[key];
  const parsed = field.safeParse(row?.value);
  return (parsed.success ? parsed.data : field.parse(undefined)) as Settings[K];
}

export const settingsUpdateSchema = settingsSchema.partial();

export async function updateSettings(patch: Partial<Settings>, userId: string | null, db: Db = prisma) {
  const valid = settingsUpdateSchema.parse(patch);
  for (const [key, value] of Object.entries(valid)) {
    if (value === undefined) continue;
    await db.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: userId },
      update: { value: value as Prisma.InputJsonValue, updatedById: userId },
    });
  }
  return getSettings(db);
}
