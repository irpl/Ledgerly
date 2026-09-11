// Protocol-level tests for the MCP server: the JSON-RPC envelope, the
// handshake, and the shape of the published tool catalog. Nothing here touches
// the database — tool *behaviour* is covered by tests/integration/mcp-tools.
import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  LATEST_PROTOCOL_VERSION,
  SERVER_INFO,
  handleRpcMessage,
} from "@/lib/mcp/protocol";
import { TOOLS, describeTool, listTools } from "@/lib/mcp/registry";
import type { ToolContext } from "@/lib/mcp/types";

const FULL: ToolContext = { userId: "user_1", scope: "full" };
const READ: ToolContext = { userId: "user_1", scope: "read" };

function request(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: "2.0" as const, id, method, ...(params ? { params } : {}) };
}

/** Narrow a response to its result, failing loudly when it carried an error. */
function resultOf(response: unknown): Record<string, unknown> {
  const value = response as { result?: Record<string, unknown>; error?: unknown };
  expect(value.error, JSON.stringify(value.error)).toBeUndefined();
  return value.result!;
}

/** The JSON payload a tool call returns, parsed back out of its text content. */
function toolPayload(response: unknown) {
  const result = resultOf(response) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  return { ...JSON.parse(result.content[0].text), isError: result.isError ?? false };
}

describe("MCP handshake", () => {
  it("echoes a protocol version it supports", async () => {
    const response = await handleRpcMessage(
      request("initialize", { protocolVersion: "2025-03-26", capabilities: {} }),
      FULL
    );
    const result = resultOf(response);
    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.serverInfo).toEqual(SERVER_INFO);
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(String(result.instructions)).toContain("major units");
  });

  it("falls back to the newest version for an unknown one", async () => {
    const response = await handleRpcMessage(
      request("initialize", { protocolVersion: "1999-01-01" }),
      FULL
    );
    expect(resultOf(response).protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("answers ping", async () => {
    expect(resultOf(await handleRpcMessage(request("ping"), FULL))).toEqual({});
  });

  it("stays silent on notifications", async () => {
    const response = await handleRpcMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      FULL
    );
    expect(response).toBeNull();
  });

  it("rejects a malformed envelope", async () => {
    const response = (await handleRpcMessage({ hello: "world" }, FULL)) as {
      error: { code: number };
    };
    expect(response.error.code).toBe(ErrorCode.InvalidRequest);
  });

  it("reports unknown methods", async () => {
    const response = (await handleRpcMessage(request("resources/list"), FULL)) as {
      error: { code: number };
    };
    expect(response.error.code).toBe(ErrorCode.MethodNotFound);
  });
});

describe("tool catalog", () => {
  it("publishes every tool with a schema a client can use", () => {
    for (const tool of TOOLS) {
      const descriptor = describeTool(tool);
      expect(descriptor.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(descriptor.description.length).toBeGreaterThan(40);
      expect(descriptor.inputSchema.type).toBe("object");
      expect(descriptor.inputSchema.properties).toBeTypeOf("object");
      // No meta-schema pointer on the wire, and no open-world claims.
      expect(descriptor.inputSchema.$schema).toBeUndefined();
      expect(descriptor.annotations.openWorldHint).toBe(false);
    }
  });

  it("has no duplicate tool names", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("hides writing tools from a read-only token", () => {
    const readable = listTools("read");
    const full = listTools("full");
    expect(readable.length).toBeLessThan(full.length);
    expect(readable.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    expect(full.some((tool) => tool.name === "create_transaction")).toBe(true);
    expect(readable.some((tool) => tool.name === "create_transaction")).toBe(false);
  });

  it("serves the catalog over tools/list", async () => {
    const result = resultOf(await handleRpcMessage(request("tools/list"), FULL));
    expect((result.tools as unknown[]).length).toBe(TOOLS.length);
  });
});

describe("tools/call guards", () => {
  it("refuses a write tool on a read-only token", async () => {
    const payload = toolPayload(
      await handleRpcMessage(
        request("tools/call", { name: "delete_transaction", arguments: { transactionId: "x" } }),
        READ
      )
    );
    expect(payload.isError).toBe(true);
    expect(payload.error).toContain("read-only");
  });

  it("reports an unknown tool as a tool error, not a protocol error", async () => {
    const payload = toolPayload(
      await handleRpcMessage(request("tools/call", { name: "make_me_rich" }), FULL)
    );
    expect(payload.isError).toBe(true);
    expect(payload.error).toContain("Unknown tool");
  });

  it("explains invalid arguments field by field", async () => {
    const payload = toolPayload(
      await handleRpcMessage(
        request("tools/call", {
          name: "create_transaction",
          // Missing accountId and occurredAt; amount must be positive.
          arguments: { amount: -5, direction: "sideways" },
        }),
        FULL
      )
    );
    expect(payload.isError).toBe(true);
    const fields = (payload.issues as { field: string }[]).map((issue) => issue.field);
    expect(fields).toContain("accountId");
    expect(fields).toContain("amount");
    expect(fields).toContain("direction");
  });

  it("rejects a call without a tool name at the protocol level", async () => {
    const response = (await handleRpcMessage(request("tools/call", { nope: true }), FULL)) as {
      error: { code: number };
    };
    expect(response.error.code).toBe(ErrorCode.InvalidParams);
  });
});
