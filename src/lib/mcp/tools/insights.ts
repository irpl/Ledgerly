// MCP tools: the read-only rollups behind the dashboards.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toAccountDTO } from "@/lib/accounts";
import { availableCredit, totalsByCurrency } from "@/lib/account-shared";
import { categorySpend, monthlyIncomeExpense, periodTotals, runningBalance } from "@/lib/analytics";
import { getLiabilityRows } from "@/lib/liabilities";
import { minorToMajor } from "@/lib/money";
import { PERIOD_PRESETS, resolvePeriod } from "@/lib/period";
import { defineTool } from "@/lib/mcp/types";
import { accountView, requireAccount, toMajor } from "@/lib/mcp/shared";

export const getFinancialOverview = defineTool({
  name: "get_financial_overview",
  title: "Financial overview",
  description:
    "The dashboard in one call: net worth per currency, income and expense totals for the chosen period, " +
    "spending by category, and the month-by-month trend. Transfers between the user's own accounts are " +
    "excluded from every income/expense figure. Answers 'how am I doing' without paging through transactions.",
  readOnly: true,
  inputSchema: z.object({
    period: z.enum(PERIOD_PRESETS).default("this-month"),
  }),
  handler: async (args, ctx) => {
    const period = resolvePeriod(args.period);
    const [accounts, overTime, byCategory, totals] = await Promise.all([
      prisma.account.findMany({
        where: { userId: ctx.userId, archived: false },
        include: { loanDetails: true },
        orderBy: { createdAt: "asc" },
      }),
      monthlyIncomeExpense(ctx.userId, period.chartMonths),
      categorySpend(ctx.userId, period.start, period.end),
      periodTotals(ctx.userId, period.start, period.end),
    ]);
    const dtos = accounts.map(toAccountDTO);

    return {
      period: period.preset,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      netWorthByCurrency: Object.fromEntries(
        [...totalsByCurrency(dtos)].map(([currency, minor]) => [currency, minorToMajor(minor)])
      ),
      periodTotalsByCurrency: Object.fromEntries(
        [...totals].map(([currency, t]) => [
          currency,
          {
            income: minorToMajor(t.income),
            expense: minorToMajor(t.expense),
            net: Number((minorToMajor(t.income) - minorToMajor(t.expense)).toFixed(2)),
          },
        ])
      ),
      spendByCategory: Object.fromEntries(
        [...byCategory].map(([currency, rows]) => [
          currency,
          rows.map((r) => ({
            categoryId: r.categoryId,
            category: r.name,
            spent: minorToMajor(r.spent),
          })),
        ])
      ),
      monthlyTrend: Object.fromEntries(
        [...overTime].map(([currency, months]) => [
          currency,
          months.map((m) => ({
            month: m.month,
            income: minorToMajor(m.income),
            expense: minorToMajor(m.expense),
          })),
        ])
      ),
      accounts: dtos.map((dto) => ({
        id: dto.id,
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        balance: minorToMajor(dto.currentBalance),
      })),
    };
  },
});

export const getLiabilities = defineTool({
  name: "get_liabilities",
  title: "Debts and credit cards",
  description:
    "Every credit card and loan with what is owed, available credit, loan terms and payoff progress, plus this " +
    "calendar month's activity against the planned monthly amount. For cards, activity means purchases; for " +
    "loans, payments received.",
  readOnly: true,
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const rows = await getLiabilityRows(ctx.userId);
    return {
      liabilities: rows.map(({ account, budget, spent, remaining }) => ({
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          balance: minorToMajor(account.currentBalance),
          creditLimit: toMajor(account.creditLimit),
          availableCredit: toMajor(availableCredit(account)),
          loan: account.loanDetails
            ? {
                kind: account.loanDetails.loanKind,
                interestRate: account.loanDetails.interestRate,
                monthlyPayment: minorToMajor(account.loanDetails.monthlyPayment),
                termMonths: account.loanDetails.termMonths,
                nextPaymentDate: account.loanDetails.nextPaymentDate,
                lender: account.loanDetails.lender,
              }
            : null,
        },
        plannedMonthly: toMajor(budget),
        thisMonth: minorToMajor(spent),
        remaining: toMajor(remaining),
      })),
      totalOwedByCurrency: rows.reduce<Record<string, number>>((acc, { account }) => {
        const owed = Math.abs(Math.min(account.currentBalance, 0));
        if (owed === 0) return acc;
        acc[account.currency] = Number(
          ((acc[account.currency] ?? 0) + minorToMajor(owed)).toFixed(2)
        );
        return acc;
      }, {}),
    };
  },
});

export const getBalanceHistory = defineTool({
  name: "get_balance_history",
  title: "Account balance history",
  description:
    "Day-by-day balance for one account, walked backwards from today's balance. Use it to see how a balance " +
    "moved over a stretch of time — whether a card is climbing, whether a loan is coming down.",
  readOnly: true,
  inputSchema: z.object({
    accountId: z.string(),
    days: z.number().int().min(2).max(365).default(30),
  }),
  handler: async (args, ctx) => {
    const account = await requireAccount(ctx, args.accountId);
    const points = await runningBalance(account.id, args.days);
    return {
      account: accountView(account),
      days: args.days,
      history: points.map((p) => ({ date: p.date, balance: minorToMajor(p.balance) })),
    };
  },
});
