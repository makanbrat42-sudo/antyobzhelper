import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI (миграции) использует прямое подключение (DIRECT_URL), если оно задано —
// например, для Supabase, где DATABASE_URL указывает на пулер соединений.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: url ?? "postgresql://invalid:invalid@localhost:5432/invalid",
  },
});
