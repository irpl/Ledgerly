// Default category set cloned for every new user (seed + admin create-user).
// Relative import so prisma/seed.ts (run via tsx) can use it without `@/` aliases.
import { CategoryKind } from "../generated/prisma/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

export const DEFAULT_EXPENSE_GROUPS = [
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

export const DEFAULT_INCOME_GROUPS = ["Salary", "Other Income"];

type Db = PrismaClient | Prisma.TransactionClient;

/** Create the default (editable/deletable) categories for one user. */
export async function createDefaultCategories(db: Db, userId: string): Promise<void> {
  await db.category.createMany({
    data: [
      ...DEFAULT_EXPENSE_GROUPS.map((name) => ({
        userId,
        name,
        kind: CategoryKind.expense,
        isDefault: true,
      })),
      ...DEFAULT_INCOME_GROUPS.map((name) => ({
        userId,
        name,
        kind: CategoryKind.income,
        isDefault: true,
      })),
      { userId, name: "Transfer", kind: CategoryKind.both, isDefault: true },
    ],
    skipDuplicates: true,
  });
}
