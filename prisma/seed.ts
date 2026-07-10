import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDefaultCategories } from "../src/lib/default-categories";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Admin user from env
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "admin" },
    create: { email, passwordHash, role: "admin" },
  });
  console.log(`Admin user ready: ${email}`);

  // Default categories for the admin — count-guarded so reboots never
  // resurrect categories the user deliberately deleted.
  const categoryCount = await prisma.category.count({ where: { userId: admin.id } });
  if (categoryCount === 0) {
    await createDefaultCategories(prisma, admin.id);
    console.log("Default categories created for admin");
  } else {
    console.log("Categories already present, skipping");
  }

  // Example FX rate (only used if the optional combined view is enabled)
  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);
  await prisma.fxRate.upsert({
    where: {
      fromCurrency_toCurrency_asOf: {
        fromCurrency: "USD",
        toCurrency: "JMD",
        asOf,
      },
    },
    update: {},
    create: {
      fromCurrency: "USD",
      toCurrency: "JMD",
      rate: 155,
      asOf,
      source: "manual",
    },
  });
  console.log("FX rate seeded (USD→JMD 155)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
