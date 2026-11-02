import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL не задан");
  // Небольшой пул: на serverless каждая функция держит свои соединения.
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type Db = PrismaClient | Tx;
