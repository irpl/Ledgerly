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
  await prisma.forwardAddress.deleteMany();
  await prisma.user.deleteMany();
}

// bcrypt hash of "test-password-123" (cost 4 — cheap on purpose; tests only).
export const TEST_PASSWORD = "test-password-123";
export const TEST_PASSWORD_HASH = "$2b$04$fgDhN.dj8sNTgxo.55Jk.O61w2aifFqC3EreDnFqlLn15CW.LdCTG";

let userCounter = 0;

/** Create a test user; every tenant-scoped fixture needs one. */
export async function createTestUser(overrides?: { email?: string; role?: "admin" | "user" }) {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: overrides?.email ?? `test-user-${userCounter}@example.com`,
      passwordHash: TEST_PASSWORD_HASH,
      role: overrides?.role ?? "user",
    },
  });
}
