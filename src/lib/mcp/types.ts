// Shared types for the MCP tool layer.
//
// Tools are plain async functions over a validated argument object. They never
// see HTTP: the route handler authenticates the bearer token, builds a
// ToolContext, and hands the tool its arguments.
import type { z } from "zod";
import type { ApiTokenScope } from "@/generated/prisma/client";

export type ToolContext = {
  /** Owner of the token. Every query in every tool is scoped to this id. */
  userId: string;
  scope: ApiTokenScope;
};

/**
 * A failure the model should see and can act on (bad id, business-rule
 * conflict). It becomes an `isError` tool result rather than a JSON-RPC error,
 * per the MCP spec — the model reads the message and retries or explains.
 * Anything thrown that is *not* a ToolError is treated as a server bug: it is
 * logged server-side and reported generically.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolAnnotations = {
  /** True when the tool only reads. Read-scoped tokens may call only these. */
  readOnly: boolean;
  /** True when a call can destroy data that cannot be reconstructed. */
  destructive?: boolean;
  /** True when repeating the same call has no additional effect. */
  idempotent?: boolean;
};

/** Argument validation failed. Carries field-level detail for the model. */
export class ToolInputError extends Error {
  readonly issues: { field: string; problem: string }[];

  constructor(issues: { field: string; problem: string }[]) {
    super("Invalid arguments.");
    this.name = "ToolInputError";
    this.issues = issues;
  }
}

export type ToolDefinition<Schema extends z.ZodType> = ToolAnnotations & {
  name: string;
  /** Human-readable label shown in client UIs. */
  title: string;
  description: string;
  inputSchema: Schema;
  handler: (args: z.output<Schema>, ctx: ToolContext) => Promise<unknown>;
};

/**
 * A tool as the registry and the dispatcher see it: the schema is still there
 * (tools/list publishes it) but arguments arrive untyped, so `run` owns the
 * parse. That keeps every tool's own handler fully typed without a cast at the
 * dispatch point.
 */
export type McpTool = ToolAnnotations & {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  run: (rawArgs: unknown, ctx: ToolContext) => Promise<unknown>;
};

/** Bind a schema to its handler; `args` stays typed inside `handler`. */
export function defineTool<Schema extends z.ZodType>(
  tool: ToolDefinition<Schema>
): McpTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    readOnly: tool.readOnly,
    destructive: tool.destructive,
    idempotent: tool.idempotent,
    run: async (rawArgs, ctx) => {
      const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        throw new ToolInputError(
          parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "(root)",
            problem: issue.message,
          }))
        );
      }
      return tool.handler(parsed.data, ctx);
    },
  };
}
