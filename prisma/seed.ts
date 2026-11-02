import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapReferenceData } from "../src/server/bootstrap";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  await bootstrapReferenceData(prisma);
  const roles = await prisma.role.count();
  const perms = await prisma.permission.count();
  console.log(`[seed] готово: должностей ${roles}, разрешений ${perms}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
