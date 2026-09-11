// The MCP tool catalog: every tool the server exposes, plus the JSON Schema
// the client sees. Adding a tool means adding it to TOOLS — nothing else.
import { z } from "zod";
import type { McpTool } from "@/lib/mcp/types";
import * as accounts from "@/lib/mcp/tools/accounts";
import * as transactions from "@/lib/mcp/tools/transactions";
import * as categories from "@/lib/mcp/tools/categories";
import * as budget from "@/lib/mcp/tools/budget";
import * as insights from "@/lib/mcp/tools/insights";
import * as emailRules from "@/lib/mcp/tools/email-rules";
import * as profile from "@/lib/mcp/tools/profile";

export const TOOLS: McpTool[] = [
  // Orientation
  profile.getProfile,
  insights.getFinancialOverview,

  // Accounts
  accounts.listAccounts,
  accounts.getAccount,
  accounts.createAccount,
  accounts.updateAccount,
  accounts.setAccountArchived,

  // Transactions
  transactions.listTransactions,
  transactions.getTransaction,
  transactions.createTransaction,
  transactions.updateTransaction,
  transactions.deleteTransaction,
  transactions.createTransfer,

  // Categories & vendors
  categories.listCategories,
  categories.createCategory,
  categories.updateCategory,
  categories.deleteCategory,
  categories.listVendors,

  // Budget & income plan
  budget.listBudgetLines,
  budget.createBudgetLine,
  budget.updateBudgetLine,
  budget.deleteBudgetLine,
  budget.getIncomePlan,
  budget.addIncomePlanEntry,
  budget.updateIncomePlanEntry,
  budget.deleteIncomePlanEntry,
  budget.getBudgetVsActual,

  // Reporting
  insights.getLiabilities,
  insights.getBalanceHistory,

  // Email ingestion
  transactions.listReviewQueue,
  transactions.confirmTransaction,
  transactions.reparseEmail,
  emailRules.listParserRules,
  emailRules.createParserRule,
  emailRules.updateParserRule,
  emailRules.deleteParserRule,

  // Preferences
  profile.updateProfile,
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function findTool(name: string): McpTool | undefined {
  return BY_NAME.get(name);
}

export type ToolDescriptor = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    /** This server only ever touches the user's own ledger. */
    openWorldHint: false;
  };
};

/**
 * Zod → JSON Schema for the wire. `io: "input"` describes what the client must
 * send (before defaults and transforms are applied); `unrepresentable: "any"`
 * keeps a schema that cannot be expressed in JSON Schema from breaking
 * tools/list — it degrades to an unconstrained value instead.
 */
function toInputSchema(tool: McpTool): Record<string, unknown> {
  const schema = z.toJSONSchema(tool.inputSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  // Clients read the schema straight from tools/list; the meta-schema pointer
  // is noise there, and object-shaped input is required by the spec.
  delete schema.$schema;
  if (!schema.type) schema.type = "object";
  if (!schema.properties) schema.properties = {};
  return schema;
}

export function describeTool(tool: McpTool): ToolDescriptor {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: toInputSchema(tool),
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive ?? false,
      idempotentHint: tool.idempotent ?? tool.readOnly,
      openWorldHint: false,
    },
  };
}

/** Tool list for a token: read-scoped tokens never see the writing tools. */
export function listTools(scope: "read" | "full"): ToolDescriptor[] {
  return TOOLS.filter((tool) => scope === "full" || tool.readOnly).map(describeTool);
}
