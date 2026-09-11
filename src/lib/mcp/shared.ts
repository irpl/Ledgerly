// Server-only helpers shared by the MCP tools: unit conversion at the model
// boundary, ownership guards, and the shapes tools return.
//
// Convention: the database stores signed minor units (§ AGENTS.md), but every
// amount crossing the MCP boundary — in arguments and in results — is in
// **major units** (4512.35), the way a person would say it. Tool descriptions
// repeat this so the model never has to infer it.
import { prisma } from "@/lib/prisma";
import { minorToMajor, majorToMinor } from "@/lib/money";
import { availableCredit, payoffProgress } from "@/lib/account-shared";
import { toAccountDTO } from "@/lib/accounts";
import type { Account, LoanDetails, Prisma } from "@/generated/prisma/client";
import { ToolError, type ToolContext } from "@/lib/mcp/types";

/** Minor units (or null) → major units, rounded to cents. */
export function toMajor(minor: bigint | number | null): number | null {
  if (minor === null) return null;
  return minorToMajor(minor);
}

/** Major units → signed minor units for the database. */
export function toMinor(major: number): bigint {
  return BigInt(majorToMinor(major));
}

/**
 * Accept either a plain date ("2026-09-11", read as local midnight) or a full
 * ISO timestamp. Plain dates are what a model produces when the user says
 * "yesterday", and `new Date("2026-09-11")` would otherwise parse as UTC and
 * land on the previous day in western timezones.
 */
export function parseDateArg(value: string, field: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const parsed = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ToolError(
      `${field} is not a valid date. Use "YYYY-MM-DD" or a full ISO timestamp.`
    );
  }
  return parsed;
}

// ---------- Ownership guards ----------
//
// Every id a model supplies is untrusted input. These load the row scoped to
// the token's user, so another tenant's id reads as "not found".

export async function requireAccount(
  ctx: ToolContext,
  accountId: string
): Promise<Account & { loanDetails: LoanDetails | null }> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: ctx.userId },
    include: { loanDetails: true },
  });
  if (!account) throw new ToolError(`No account with id "${accountId}".`);
  return account;
}

export async function requireCategory(ctx: ToolContext, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId: ctx.userId },
  });
  if (!category) throw new ToolError(`No category with id "${categoryId}".`);
  return category;
}

export async function requireBudgetStartDay(ctx: ToolContext): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { budgetStartDay: true },
  });
  if (!user) throw new ToolError("This token's user no longer exists.");
  return user.budgetStartDay;
}

// ---------- Result shapes ----------

export type AccountView = ReturnType<typeof accountView>;

export function accountView(account: Account & { loanDetails?: LoanDetails | null }) {
  const dto = toAccountDTO(account);
  const credit = availableCredit(dto);
  const payoff = payoffProgress(dto);
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    currency: dto.currency,
    balance: minorToMajor(dto.currentBalance),
    openingBalance: minorToMajor(dto.openingBalance),
    creditLimit: toMajor(dto.creditLimit),
    availableCredit: credit === null ? null : minorToMajor(credit),
    monthlyBudget: toMajor(dto.monthlyBudget),
    archived: dto.archived,
    createdAt: dto.createdAt,
    loan: dto.loanDetails
      ? {
          kind: dto.loanDetails.loanKind,
          originalPrincipal: minorToMajor(dto.loanDetails.originalPrincipal),
          interestRate: dto.loanDetails.interestRate,
          termMonths: dto.loanDetails.termMonths,
          startDate: dto.loanDetails.startDate,
          monthlyPayment: minorToMajor(dto.loanDetails.monthlyPayment),
          monthlyBudget: toMajor(dto.loanDetails.monthlyBudget),
          lender: dto.loanDetails.lender,
          nextPaymentDate: dto.loanDetails.nextPaymentDate,
          /** 0–1; 1 means paid off. */
          payoffProgress: payoff,
        }
      : null,
  };
}

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { account: true; category: true; vendor: true };
}>;

export const TRANSACTION_INCLUDE = {
  account: true,
  category: true,
  vendor: true,
} as const;

export function transactionView(t: TransactionWithRelations) {
  const amount = minorToMajor(t.amount);
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: t.account.name,
    currency: t.account.currency,
    /** Signed: money out is negative, money in is positive. */
    amount,
    direction: amount < 0 ? "out" : "in",
    occurredAt: t.occurredAt.toISOString(),
    categoryId: t.categoryId,
    category: t.category?.name ?? null,
    vendor: t.vendor?.name ?? null,
    description: t.description,
    notes: t.notes,
    source: t.source,
    status: t.status,
    /** Set on both legs of a transfer; the legs are edited and deleted together. */
    transferGroupId: t.transferGroupId,
  };
}
