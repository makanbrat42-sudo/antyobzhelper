import { execSync } from "node:child_process";

// Применяет миграции к тестовой базе перед запуском тестов.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://antyobzhelp:antyobzhelp@localhost:5433/antyobzhelp_test";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: "" },
  });
}
