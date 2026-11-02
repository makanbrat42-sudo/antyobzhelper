import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://antyobzhelp:antyobzhelp@localhost:5433/antyobzhelp_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: "",
      SESSION_SECRET: "test-secret-test-secret-test-secret-123",
      GOOGLE_FORMS_SECRET: "test-gf-secret",
      VK_CALLBACK_SECRET: "test-vk-secret",
      VK_CALLBACK_CONFIRMATION: "confirm123",
      VK_GROUP_ID: "777",
      VK_GROUP_TOKEN: "test-group-token",
      VK_API_BASE_URL: "https://vk-api.test/method",
      APP_URL: "https://antyobzhelp.test",
      SETUP_TOKEN: "setup-token-for-tests",
      DB_POOL_MAX: "10",
    },
  },
});
