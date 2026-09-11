// MCP tools: budget lines, the income plan, and budget-vs-actual.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { FREQUENCIES, PAYMENT_METHODS, normalizedMonthly } from "@/lib/budget-shared";
import { toBudgetLineDTO } from "@/lib/budget";
import { budgetVsActual } from "@/lib/analytics";
import { minorToMajor, majorToMinor } from "@/lib/money";
import {
  formatBudgetPeriod,
  parseBudgetPeriodLabel,
  resolveBudgetPeriod,
} from "@/lib/period";
import { defineTool, ToolError } from "@/lib/mcp/types";
import { requireAccount, requireBudgetStartDay, requireCategory, toMinor } from "@/lib/mcp/shared";

const REPORTING_CURRENCY = process.env.REPORTING_CURRENCY ?? "JMD";

const BUDGET_INCLUDE = { category: true, fundingAccount: true } as const;

function budgetLineView(line: Parameters<typeof toBudgetLineDTO>[0]) {
  const dto = toBudgetLineDTO(line);
  return {
    id: dto.id,
    name: dto.name,
    categoryId: dto.categoryId,
    category: dto.categoryName,
    amount: minorToMajor(dto.amount),
    frequency: dto.frequency,
    /** How the line is paid: "cash" out of an account, or "credit" on a card. */
    paymentMethod: dto.paymentMethod,
    fundingAccountId: dto.fundingAccountId,
    fundingAccount: dto.fundingAccountName,
    currency: dto.fundingAccountCurrency,
    /** amount × occurrences per year ÷ 12 — what the line really costs each month. */
    monthlyEquivalent: minorToMajor(dto.normalizedMonthly),
    active: dto.active,
  };
}

export const listBudgetLines = defineTool({
  name: "list_budget_lines",
  title: "List budget lines",
  description:
    "The planned-spending lines with their monthly equivalent (any frequency is annualized then divided by 12), " +
    "plus totals per currency split into cash and credit, planned income, and the resulting monthly surplus " +
    `or deficit (reported in ${REPORTING_CURRENCY}). This is the plan — get_budget_vs_actual compares it to ` +
    "what actually happened.",
  readOnly: true,
  inputSchema: z.object({
    includeInactive: z.boolean().default(false).describe("Include paused budget lines."),
  }),
  handler: async (args, ctx) => {
    const [lines, income] = await Promise.all([
      prisma.budgetLine.findMany({
        where: { userId: ctx.userId, ...(args.includeInactive ? {} : { active: true }) },
        include: BUDGET_INCLUDE,
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      prisma.incomePlan.findMany({ where: { userId: ctx.userId } }),
    ]);

    // Cash/credit split and totals, grouped by funding-account currency (§5.4).
    const byCurrency = new Map<string, { total: number; cash: number; credit: number }>();
    for (const line of lines) {
      if (!line.active) continue;
      const currency = line.fundingAccount.currency;
      const entry = byCurrency.get(currency) ?? { total: 0, cash: 0, credit: 0 };
      const monthly = minorToMajor(line.normalizedMonthly);
      entry.total += monthly;
      if (line.paymentMethod === "cash") entry.cash += monthly;
      else entry.credit += monthly;
      byCurrency.set(currency, entry);
    }

    const plannedIncome = income.reduce((sum, i) => sum + minorToMajor(i.monthlyAmount), 0);
    const reportingExpenses = byCurrency.get(REPORTING_CURRENCY)?.total ?? 0;

    return {
      budgetLines: lines.map(budgetLineView),
      plannedMonthlyByCurrency: Object.fromEntries(byCurrency),
      plannedMonthlyIncome: plannedIncome,
      /** Planned income − planned expenses, in the reporting currency. */
      monthlySurplus: Number((plannedIncome - reportingExpenses).toFixed(2)),
      reportingCurrency: REPORTING_CURRENCY,
    };
  },
});

export const createBudgetLine = defineTool({
  name: "create_budget_line",
  title: "Create budget line",
  description:
    "Add a planned expense. `amount` is the amount per occurrence and `frequency` how often it recurs — a " +
    "20,000 quarterly bill becomes a 6,666.67 monthly equivalent automatically. `fundingAccountId` is the " +
    "account or card it is paid from, and `paymentMethod` records whether it comes out of cash or goes on credit.",
  readOnly: false,
  inputSchema: z.object({
    name: z.string().trim().min(1).max(200),
    categoryId: z.string(),
    amount: z.number().positive().describe("Per occurrence, major units."),
    frequency: z.enum(FREQUENCIES),
    paymentMethod: z.enum(PAYMENT_METHODS),
    fundingAccountId: z.string(),
    active: z.boolean().default(true),
  }),
  handler: async (args, ctx) => {
    await requireCategory(ctx, args.categoryId);
    await requireAccount(ctx, args.fundingAccountId);
    const amountMinor = majorToMinor(args.amount);

    const line = await prisma.budgetLine.create({
      data: {
        userId: ctx.userId,
        name: args.name,
        categoryId: args.categoryId,
        amount: BigInt(amountMinor),
        frequency: args.frequency,
        paymentMethod: args.paymentMethod,
        fundingAccountId: args.fundingAccountId,
        normalizedMonthly: BigInt(normalizedMonthly(amountMinor, args.frequency)),
        active: args.active,
      },
      include: BUDGET_INCLUDE,
    });
    return { budgetLine: budgetLineView(line) };
  },
});

export const updateBudgetLine = defineTool({
  name: "update_budget_line",
  title: "Update budget line",
  description:
    "Change a budget line. Editing the amount or frequency recomputes the monthly equivalent. Set `active` to " +
    "false to pause a line — it keeps its history but stops counting toward the plan.",
  readOnly: false,
  inputSchema: z.object({
    budgetLineId: z.string(),
    name: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().optional(),
    amount: z.number().positive().optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    fundingAccountId: z.string().optional(),
    active: z.boolean().optional(),
  }),
  handler: async (args, ctx) => {
    const existing = await prisma.budgetLine.findFirst({
      where: { id: args.budgetLineId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No budget line with id "${args.budgetLineId}".`);
    if (args.categoryId) await requireCategory(ctx, args.categoryId);
    if (args.fundingAccountId) await requireAccount(ctx, args.fundingAccountId);

    const nextAmount =
      args.amount !== undefined ? majorToMinor(args.amount) : Number(existing.amount);
    const nextFrequency = args.frequency ?? existing.frequency;

    const line = await prisma.budgetLine.update({
      where: { id: existing.id },
      data: {
        name: args.name,
        categoryId: args.categoryId,
        amount: args.amount !== undefined ? BigInt(nextAmount) : undefined,
        frequency: args.frequency,
        paymentMethod: args.paymentMethod,
        fundingAccountId: args.fundingAccountId,
        normalizedMonthly: BigInt(normalizedMonthly(nextAmount, nextFrequency)),
        active: args.active,
      },
      include: BUDGET_INCLUDE,
    });
    return { budgetLine: budgetLineView(line) };
  },
});

export const deleteBudgetLine = defineTool({
  name: "delete_budget_line",
  title: "Delete budget line",
  description:
    "Remove a budget line from the plan. Transactions are untouched — this only changes what is planned. " +
    "To keep the line for later, update it with active=false instead.",
  readOnly: false,
  destructive: true,
  inputSchema: z.object({ budgetLineId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.budgetLine.findFirst({
      where: { id: args.budgetLineId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No budget line with id "${args.budgetLineId}".`);
    await prisma.budgetLine.delete({ where: { id: existing.id } });
    return { deleted: true, name: existing.name };
  },
});

export const getIncomePlan = defineTool({
  name: "get_income_plan",
  title: "Get the income plan",
  description:
    "Planned monthly income entries (salary, rent received, …) and their total. This is the plan the budget " +
    "surplus is measured against, not actual income — for that, use list_transactions with direction \"in\".",
  readOnly: true,
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const entries = await prisma.incomePlan.findMany({
      where: { userId: ctx.userId },
      orderBy: { label: "asc" },
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        label: e.label,
        monthlyAmount: minorToMajor(e.monthlyAmount),
      })),
      totalMonthly: entries.reduce((sum, e) => sum + minorToMajor(e.monthlyAmount), 0),
      reportingCurrency: REPORTING_CURRENCY,
    };
  },
});

export const addIncomePlanEntry = defineTool({
  name: "add_income_plan_entry",
  title: "Add planned income",
  description:
    `Add a planned monthly income line, in ${REPORTING_CURRENCY}. Use the monthly figure: a fortnightly pay ` +
    "packet is the amount × 26 ÷ 12.",
  readOnly: false,
  inputSchema: z.object({
    label: z.string().trim().min(1).max(200).describe('e.g. "Salary" or "Rental income".'),
    monthlyAmount: z.number().nonnegative().describe("Major units, per month."),
  }),
  handler: async (args, ctx) => {
    const entry = await prisma.incomePlan.create({
      data: {
        userId: ctx.userId,
        label: args.label,
        monthlyAmount: toMinor(args.monthlyAmount),
      },
    });
    return {
      entry: {
        id: entry.id,
        label: entry.label,
        monthlyAmount: minorToMajor(entry.monthlyAmount),
      },
    };
  },
});

export const updateIncomePlanEntry = defineTool({
  name: "update_income_plan_entry",
  title: "Update planned income",
  description: "Rename a planned income line or change its monthly amount.",
  readOnly: false,
  inputSchema: z.object({
    entryId: z.string(),
    label: z.string().trim().min(1).max(200).optional(),
    monthlyAmount: z.number().nonnegative().optional(),
  }),
  handler: async (args, ctx) => {
    const existing = await prisma.incomePlan.findFirst({
      where: { id: args.entryId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No income plan entry with id "${args.entryId}".`);
    const entry = await prisma.incomePlan.update({
      where: { id: existing.id },
      data: {
        label: args.label,
        monthlyAmount:
          args.monthlyAmount !== undefined ? toMinor(args.monthlyAmount) : undefined,
      },
    });
    return {
      entry: {
        id: entry.id,
        label: entry.label,
        monthlyAmount: minorToMajor(entry.monthlyAmount),
      },
    };
  },
});

export const deleteIncomePlanEntry = defineTool({
  name: "delete_income_plan_entry",
  title: "Delete planned income",
  description: "Remove a planned income line. The budget surplus is recalculated without it.",
  readOnly: false,
  destructive: true,
  inputSchema: z.object({ entryId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.incomePlan.findFirst({
      where: { id: args.entryId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No income plan entry with id "${args.entryId}".`);
    await prisma.incomePlan.delete({ where: { id: existing.id } });
    return { deleted: true, label: existing.label };
  },
});

export const getBudgetVsActual = defineTool({
  name: "get_budget_vs_actual",
  title: "Budget vs actual",
  description:
    "Planned versus actual spending per category for one budget period. Periods follow the user's own anchor " +
    "day (Settings → Budget period), so they are not always calendar months — the returned range says exactly " +
    "what was measured. Only confirmed, non-transfer expenses count as actual.",
  readOnly: true,
  inputSchema: z.object({
    period: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe('Period label "YYYY-MM" (the month the period starts in). Defaults to the current one.'),
  }),
  handler: async (args, ctx) => {
    const startDay = await requireBudgetStartDay(ctx);
    const period = args.period
      ? parseBudgetPeriodLabel(args.period, startDay)
      : resolveBudgetPeriod(startDay);
    if (!period) throw new ToolError('`period` must look like "2026-09".');

    // budgetVsActual also materializes the period's BudgetPeriodActual snapshot,
    // exactly as opening /budget in the web app does. That write is derived data
    // — recomputed from the same transactions on every call — so the tool is
    // still annotated read-only and stays open to read-scoped tokens.
    const rows = await budgetVsActual(ctx.userId, period.label, period.start, period.end);
    const budgeted = rows.reduce((sum, r) => sum + minorToMajor(r.budgeted), 0);
    const spent = rows.reduce((sum, r) => sum + minorToMajor(r.spent), 0);

    return {
      period: period.label,
      range: formatBudgetPeriod(period),
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      rows: rows.map((r) => ({
        categoryId: r.categoryId,
        category: r.name,
        budgeted: minorToMajor(r.budgeted),
        spent: minorToMajor(r.spent),
        remaining: Number((minorToMajor(r.budgeted) - minorToMajor(r.spent)).toFixed(2)),
      })),
      totals: {
        budgeted: Number(budgeted.toFixed(2)),
        spent: Number(spent.toFixed(2)),
        remaining: Number((budgeted - spent).toFixed(2)),
      },
      reportingCurrency: REPORTING_CURRENCY,
    };
  },
});
