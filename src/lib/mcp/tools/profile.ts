// MCP tools: profile and preferences.
//
// Deliberately absent: changing the login email or password, and minting or
// revoking API tokens. A token must not be able to take over the account it
// was issued for or extend its own reach — those live in the web UI, behind a
// session and the current password.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MAX_BUDGET_START_DAY, MIN_BUDGET_START_DAY, formatBudgetPeriod, resolveBudgetPeriod } from "@/lib/period";
import { defineTool, ToolError } from "@/lib/mcp/types";

export const getProfile = defineTool({
  name: "get_profile",
  title: "Get profile",
  description:
    "Who this token belongs to, their budget-period anchor day and the current period's date range, the " +
    "inbound address bank alerts are forwarded to, and a count of what is stored. Good first call for " +
    "orienting yourself in an unfamiliar ledger.",
  readOnly: true,
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        inboundKey: true,
        budgetStartDay: true,
        createdAt: true,
        forwardAddresses: { select: { address: true }, orderBy: { address: "asc" } },
        _count: {
          select: {
            accounts: true,
            categories: true,
            vendors: true,
            budgetLines: true,
            parserRules: true,
          },
        },
      },
    });
    if (!user) throw new ToolError("This token's user no longer exists.");

    const period = resolveBudgetPeriod(user.budgetStartDay);
    const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN ?? null;

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        memberSince: user.createdAt.toISOString(),
      },
      budgetPeriod: {
        startDay: user.budgetStartDay,
        current: period.label,
        range: formatBudgetPeriod(period),
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      emailIngestion: {
        inboundAddress: inboundDomain ? `${user.inboundKey}@${inboundDomain}` : null,
        forwardFromAddresses: user.forwardAddresses.map((f) => f.address),
      },
      counts: user._count,
      tokenScope: ctx.scope,
    };
  },
});

export const updateProfile = defineTool({
  name: "update_profile",
  title: "Update profile",
  description:
    "Change the display name or the budget-period anchor day. The anchor day is the day of the month budget " +
    "periods start on — 25 means periods run the 25th to the 24th, matching a pay cycle; 1 means calendar " +
    "months. Short months clamp (31 becomes the 28th in February). The login email and password can only be " +
    "changed in the web app.",
  readOnly: false,
  inputSchema: z.object({
    displayName: z.string().trim().max(100).nullable().optional(),
    budgetStartDay: z
      .number()
      .int()
      .min(MIN_BUDGET_START_DAY)
      .max(MAX_BUDGET_START_DAY)
      .optional(),
  }),
  handler: async (args, ctx) => {
    if (args.displayName === undefined && args.budgetStartDay === undefined) {
      throw new ToolError("Pass displayName, budgetStartDay, or both.");
    }
    const user = await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        displayName: args.displayName !== undefined ? args.displayName : undefined,
        budgetStartDay: args.budgetStartDay,
      },
      select: { id: true, email: true, displayName: true, budgetStartDay: true },
    });
    const period = resolveBudgetPeriod(user.budgetStartDay);
    return {
      user,
      budgetPeriod: { current: period.label, range: formatBudgetPeriod(period) },
    };
  },
});
