// MCP tools: the parser rules that turn bank-alert emails into transactions.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parserRuleInput } from "@/lib/validation";
import { defineTool, ToolError } from "@/lib/mcp/types";
import { requireAccount } from "@/lib/mcp/shared";

const BODY_PATTERN_HELP =
  "JavaScript regular expression with named groups. (?<amount>…) is required; (?<date>…), " +
  "(?<merchant>…) and (?<direction>…) are optional and fill in the rest of the transaction.";

/** Reuse the app's own regex validation so rules behave identically everywhere. */
function assertValidRule(input: unknown) {
  const parsed = parserRuleInput.partial().safeParse(input);
  if (!parsed.success) {
    throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid parser rule.");
  }
  return parsed.data;
}

export const listParserRules = defineTool({
  name: "list_parser_rules",
  title: "List parser rules",
  description:
    "The rules that match incoming bank alerts and turn them into pending transactions, with how many emails " +
    "each has matched. A sender whose alerts keep landing in the review queue unmatched needs a new rule.",
  readOnly: true,
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const rules = await prisma.parserRule.findMany({
      where: { userId: ctx.userId },
      include: {
        account: { select: { id: true, name: true } },
        _count: { select: { rawEmails: true } },
      },
      orderBy: { name: "asc" },
    });
    return {
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        senderMatch: r.senderMatch,
        subjectPattern: r.subjectPattern,
        bodyPattern: r.bodyPattern,
        accountId: r.account.id,
        account: r.account.name,
        defaultDirection: r.defaultDirection,
        matchedEmails: r._count.rawEmails,
      })),
    };
  },
});

export const createParserRule = defineTool({
  name: "create_parser_rule",
  title: "Create parser rule",
  description:
    "Teach Ledgerly to read a bank's alert emails. `senderMatch` picks the emails (substring of the sender " +
    "address), `bodyPattern` pulls the fields out of the body. Write the pattern against a real email from " +
    "list_review_queue, then check it with reparse_email. " +
    BODY_PATTERN_HELP,
  readOnly: false,
  inputSchema: z.object({
    name: z.string().trim().min(1).max(200),
    senderMatch: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe('Substring of the sender address, e.g. "alerts@ncb.com".'),
    subjectPattern: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .describe("Optional regex the subject must match, to narrow the rule further."),
    bodyPattern: z.string().trim().min(1).max(2000).describe(BODY_PATTERN_HELP),
    accountId: z.string().describe("Account the matched transactions belong to."),
    defaultDirection: z
      .enum(["outflow", "inflow"])
      .default("outflow")
      .describe("Used when the pattern has no (?<direction>…) group."),
  }),
  handler: async (args, ctx) => {
    await requireAccount(ctx, args.accountId);
    assertValidRule(args);
    const rule = await prisma.parserRule.create({
      data: {
        userId: ctx.userId,
        name: args.name,
        senderMatch: args.senderMatch,
        subjectPattern: args.subjectPattern || null,
        bodyPattern: args.bodyPattern,
        accountId: args.accountId,
        defaultDirection: args.defaultDirection,
      },
    });
    return { rule };
  },
});

export const updateParserRule = defineTool({
  name: "update_parser_rule",
  title: "Update parser rule",
  description:
    "Fix a rule that matches the wrong emails or extracts the wrong fields, then re-test it with reparse_email " +
    "against an email in the review queue. " +
    BODY_PATTERN_HELP,
  readOnly: false,
  inputSchema: z.object({
    ruleId: z.string(),
    name: z.string().trim().min(1).max(200).optional(),
    senderMatch: z.string().trim().min(1).max(500).optional(),
    subjectPattern: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional()
      .describe("null removes the subject condition."),
    bodyPattern: z.string().trim().min(1).max(2000).optional(),
    accountId: z.string().optional(),
    defaultDirection: z.enum(["outflow", "inflow"]).optional(),
  }),
  handler: async (args, ctx) => {
    const existing = await prisma.parserRule.findFirst({
      where: { id: args.ruleId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No parser rule with id "${args.ruleId}".`);
    if (args.accountId) await requireAccount(ctx, args.accountId);
    assertValidRule(args);

    const rule = await prisma.parserRule.update({
      where: { id: existing.id },
      data: {
        name: args.name,
        senderMatch: args.senderMatch,
        subjectPattern: args.subjectPattern !== undefined ? args.subjectPattern : undefined,
        bodyPattern: args.bodyPattern,
        accountId: args.accountId,
        defaultDirection: args.defaultDirection,
      },
    });
    return { rule };
  },
});

export const deleteParserRule = defineTool({
  name: "delete_parser_rule",
  title: "Delete parser rule",
  description:
    "Remove a parser rule. Transactions it already created stay; future alerts from that sender land in the " +
    "review queue unmatched.",
  readOnly: false,
  destructive: true,
  inputSchema: z.object({ ruleId: z.string() }),
  handler: async (args, ctx) => {
    const existing = await prisma.parserRule.findFirst({
      where: { id: args.ruleId, userId: ctx.userId },
    });
    if (!existing) throw new ToolError(`No parser rule with id "${args.ruleId}".`);
    await prisma.parserRule.delete({ where: { id: existing.id } });
    return { deleted: true, name: existing.name };
  },
});
