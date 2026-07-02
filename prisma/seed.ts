import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, CategoryKind } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EXPENSE_GROUPS = [
  "Housing",
  "Food",
  "Transportation",
  "Loans",
  "Insurance",
  "Health and Beauty",
  "Personal Spending",
  "Savings and Investments",
  "Miscellaneous",
  "Entertainment",
  "Credit Card",
];

const INCOME_GROUPS = ["Salary", "Other Income"];

async function main() {
  // Single user from env
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`User ready: ${email}`);

  // Default categories (editable/deletable by the user)
  for (const name of EXPENSE_GROUPS) {
    await prisma.category.upsert({
      where: { name_kind: { name, kind: CategoryKind.expense } },
      update: {},
      create: { name, kind: CategoryKind.expense, isDefault: true },
    });
  }
  for (const name of INCOME_GROUPS) {
    await prisma.category.upsert({
      where: { name_kind: { name, kind: CategoryKind.income } },
      update: {},
      create: { name, kind: CategoryKind.income, isDefault: true },
    });
  }
  await prisma.category.upsert({
    where: { name_kind: { name: "Transfer", kind: CategoryKind.both } },
    update: {},
    create: { name: "Transfer", kind: CategoryKind.both, isDefault: true },
  });
  console.log("Categories seeded");

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
