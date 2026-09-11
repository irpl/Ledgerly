// Model Context Protocol over JSON-RPC 2.0.
//
// This is a stateless server: every request carries its own bearer token and
// is answered on the spot, so there is no session to resume, no SSE stream to
// keep open, and nothing to clean up if a client disappears. The HTTP shell
// lives in src/app/api/mcp/route.ts; everything here is transport-agnostic and
// unit-testable.
import { z } from "zod";
import { APP_VERSION } from "@/lib/version";
import { findTool, listTools } from "@/lib/mcp/registry";
import { ToolError, ToolInputError, type ToolContext } from "@/lib/mcp/types";

export const LATEST_PROTOCOL_VERSION = "2025-06-18";

/** Older revisions we still answer, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  "2025-03-26",
  "2024-11-05",
];

export const SERVER_INFO = {
  name: "ledgerly",
  title: "Ledgerly",
  version: APP_VERSION,
};

/**
 * Shown to the model once, at connection. It carries the conventions that are
 * easy to get wrong and expensive when wrong: what the signs mean, which
 * figures are planned versus actual, and when to ask before writing.
 */
export const SERVER_INSTRUCTIONS = [
  "Ledgerly is the user's personal finance ledger: accounts, transactions, budget and debts.",
  "",
  "Conventions:",
  "- Every amount is in major units (4512.35), never cents. Each account carries its own currency;",
  "  never add figures from different currencies together.",
  "- Transaction amounts are signed: money out is negative, money in is positive. create_transaction takes a",
  "  positive amount plus a direction.",
  "- Moving money between the user's own accounts — including paying a credit card or loan — is a transfer,",
  "  not an expense. Use create_transfer so both legs stay linked and stay out of income/expense rollups.",
  "- Transactions parsed from bank alerts start as pending_review and do not affect balances until",
  "  confirm_transaction accepts them. Check list_review_queue when the user asks what needs attention.",
  "- Budget lines and the income plan are the *plan*; list_transactions and get_financial_overview are what",
  "  actually happened. get_budget_vs_actual compares them over the user's own budget period, which may not",
  "  be a calendar month.",
  "",
  "Working with this ledger:",
  "- Start with get_profile or list_accounts to learn the account ids, currencies and period anchor.",
  "- Ask the user before deleting anything or editing history you were not asked to touch. Deletions cannot",
  "  be undone; accounts are archived rather than deleted.",
  "- This is real financial data. Report the figures as they are, and say so when something looks wrong",
  "  rather than correcting it silently.",
].join("\n");

// ---------- JSON-RPC envelope ----------

export const JSONRPC_VERSION = "2.0";

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export type JsonRpcId = string | number | null;

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

const requestSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  // Absent on notifications, which expect no response.
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, result: value };
}

function failure(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, ...(data ? { data } : {}) } };
}

/** Tool results are text content; a failed call is flagged rather than thrown. */
function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

// ---------- Method handlers ----------

function handleInitialize(params: unknown) {
  const requested =
    typeof params === "object" && params !== null && "protocolVersion" in params
      ? String((params as { protocolVersion: unknown }).protocolVersion)
      : null;
  return {
    // Echo the client's revision when we speak it, else offer our newest and
    // let the client decide whether it can continue.
    protocolVersion:
      requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: SERVER_INSTRUCTIONS,
  };
}

const callParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

type ToolCallOutcome =
  | { kind: "invalid-params"; message: string }
  | { kind: "result"; payload: ReturnType<typeof toolResult> };

async function handleToolCall(params: unknown, ctx: ToolContext): Promise<ToolCallOutcome> {
  const parsedParams = callParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    return {
      kind: "invalid-params",
      message: "tools/call needs a tool `name` and an `arguments` object.",
    };
  }
  const { name, arguments: rawArgs } = parsedParams.data;

  const tool = findTool(name);
  if (!tool) {
    return { kind: "result", payload: toolResult({ error: `Unknown tool "${name}".` }, true) };
  }
  if (!tool.readOnly && ctx.scope === "read") {
    return {
      kind: "result",
      payload: toolResult(
        {
          error:
            `This API token is read-only, so "${name}" is not available. ` +
            "Create a full-access token in Ledgerly under Settings → Claude / MCP access.",
        },
        true
      ),
    };
  }

  try {
    return { kind: "result", payload: toolResult(await tool.run(rawArgs ?? {}, ctx)) };
  } catch (error) {
    if (error instanceof ToolInputError) {
      return {
        kind: "result",
        payload: toolResult(
          { error: `Invalid arguments for "${name}".`, issues: error.issues },
          true
        ),
      };
    }
    if (error instanceof ToolError) {
      return { kind: "result", payload: toolResult({ error: error.message }, true) };
    }
    // A bug or a database failure: keep the detail server-side, tell the model
    // enough to stop and report rather than retry blindly.
    console.error(`[mcp] tool "${name}" failed`, error);
    return {
      kind: "result",
      payload: toolResult(
        { error: `"${name}" failed unexpectedly. The error was logged on the server.` },
        true
      ),
    };
  }
}

/**
 * Answer one JSON-RPC message. Returns null for notifications, which by
 * definition get no reply.
 */
export async function handleRpcMessage(
  message: unknown,
  ctx: ToolContext
): Promise<JsonRpcResponse | null> {
  const parsed = requestSchema.safeParse(message);
  if (!parsed.success) {
    return failure(null, ErrorCode.InvalidRequest, "Not a valid JSON-RPC 2.0 request.");
  }
  const { id, method, params } = parsed.data;
  const isNotification = id === undefined;
  const responseId: JsonRpcId = id ?? null;

  // Notifications are acknowledged by silence; unknown ones are ignored on
  // purpose, so a chatty client never gets an error it cannot act on.
  if (isNotification) return null;

  switch (method) {
    case "initialize":
      return result(responseId, handleInitialize(params));
    case "ping":
      return result(responseId, {});
    case "tools/list":
      return result(responseId, { tools: listTools(ctx.scope) });
    case "tools/call": {
      const outcome = await handleToolCall(params, ctx);
      return outcome.kind === "invalid-params"
        ? failure(responseId, ErrorCode.InvalidParams, outcome.message)
        : result(responseId, outcome.payload);
    }
    default:
      return failure(responseId, ErrorCode.MethodNotFound, `Unknown method "${method}".`);
  }
}
