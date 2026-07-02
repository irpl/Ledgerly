// Shared test-database helpers. vitest.config sets DATABASE_URL to jan_test,
// so importing @/lib/prisma here connects to the test DB, exercising the same
// singleton the app code uses.
import { prisma } from "@/lib/prisma";

export { prisma };

/** Wipe all data (FK-safe order). */
export async function resetDb() {
  await prisma.transaction.deleteMany();
  await prisma.rawEmail.deleteMany();
  await prisma.parserRule.deleteMany();
  await prisma.budgetPeriodActual.deleteMany();
  await prisma.budgetLine.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.incomePlan.deleteMany();
  await prisma.loanDetails.deleteMany();
  await prisma.account.deleteMany();
  await prisma.category.deleteMany();
  await prisma.fxRate.deleteMany();
  await prisma.user.deleteMany();
}
