// Серверные переменные окружения. Не импортируйте этот модуль в клиентские компоненты.

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  get appUrl() {
    return (opt("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get sessionSecret() {
    const s = opt("SESSION_SECRET");
    if (!s || s.length < 32) {
      throw new Error("SESSION_SECRET не задан или короче 32 символов");
    }
    return s;
  },
  get setupToken() {
    return opt("SETUP_TOKEN");
  },
  get vkIdClientId() {
    return opt("VK_ID_CLIENT_ID");
  },
  get vkIdBaseUrl() {
    return (opt("VK_ID_BASE_URL") ?? "https://id.vk.ru").replace(/\/+$/, "");
  },
  get vkGroupId() {
    return opt("VK_GROUP_ID");
  },
  get vkGroupToken() {
    return opt("VK_GROUP_TOKEN");
  },
  get vkCallbackConfirmation() {
    return opt("VK_CALLBACK_CONFIRMATION");
  },
  get vkCallbackSecret() {
    return opt("VK_CALLBACK_SECRET");
  },
  get vkApiBaseUrl() {
    return (opt("VK_API_BASE_URL") ?? "https://api.vk.ru/method").replace(/\/+$/, "");
  },
  get vkApiVersion() {
    return opt("VK_API_VERSION") ?? "5.199";
  },
  get googleFormsSecret() {
    return opt("GOOGLE_FORMS_SECRET");
  },
  get cronSecret() {
    return opt("CRON_SECRET");
  },
  /** Вход без VK ID — только вне production и только при явном включении. */
  get devLoginEnabled() {
    return process.env.NODE_ENV !== "production" && opt("DEV_LOGIN_ENABLED") === "true";
  },
};
