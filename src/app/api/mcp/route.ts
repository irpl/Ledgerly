// MCP endpoint (Streamable HTTP, stateless JSON).
//
// Auth is a personal API token — `Authorization: Bearer ldg_…`, minted in
// Settings → Claude / MCP access. Session cookies are deliberately NOT accepted
// here: a cookie-authenticated endpoint that mutates the ledger would be
// reachable by any site the user's browser visits. A bearer token can only be
// sent by something the user gave it to.
import { NextRequest, NextResponse } from "next/server";
import {
  authenticateToken,
  bearerFromHeader,
  touchToken,
} from "@/lib/api-tokens";
import {
  ErrorCode,
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  handleRpcMessage,
  type JsonRpcResponse,
} from "@/lib/mcp/protocol";
import type { ToolContext } from "@/lib/mcp/types";

/** This route reads per-request auth headers; it must never be prerendered. */
export const dynamic = "force-dynamic";

const UNAUTHORIZED_HEADERS = {
  "WWW-Authenticate": 'Bearer realm="Ledgerly MCP", error="invalid_token"',
};

function rpcError(code: number, message: string, status: number) {
  return NextResponse.json(
    { jsonrpc: JSONRPC_VERSION, id: null, error: { code, message } },
    { status }
  );
}

export async function POST(req: NextRequest) {
  const raw = bearerFromHeader(req.headers.get("authorization"));
  if (!raw) {
    return NextResponse.json(
      {
        jsonrpc: JSONRPC_VERSION,
        id: null,
        error: {
          code: ErrorCode.InvalidRequest,
          message:
            "Missing bearer token. Send `Authorization: Bearer <token>` using a token from " +
            "Ledgerly → Settings → Claude / MCP access.",
        },
      },
      { status: 401, headers: UNAUTHORIZED_HEADERS }
    );
  }

  const token = await authenticateToken(raw);
  if (!token) {
    return NextResponse.json(
      {
        jsonrpc: JSONRPC_VERSION,
        id: null,
        error: {
          code: ErrorCode.InvalidRequest,
          message: "That API token is unknown, revoked, or expired.",
        },
      },
      { status: 401, headers: UNAUTHORIZED_HEADERS }
    );
  }
  touchToken(token.tokenId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(ErrorCode.ParseError, "Request body is not valid JSON.", 400);
  }

  const ctx: ToolContext = { userId: token.userId, scope: token.scope };

  // A batch is answered with a batch; older clients (protocol 2025-03-26 and
  // earlier) may still send one.
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return rpcError(ErrorCode.InvalidRequest, "Empty JSON-RPC batch.", 400);
    }
    const responses: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleRpcMessage(message, ctx);
      if (response) responses.push(response);
    }
    // Nothing but notifications: acknowledge with no body, per the spec.
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses, { headers: jsonHeaders() });
  }

  const response = await handleRpcMessage(body, ctx);
  if (!response) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response, { headers: jsonHeaders() });
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    // Tokens travel in the request; nothing here is cacheable or shareable.
    "Cache-Control": "no-store",
  };
}

/**
 * The spec lets a server decline the optional server-initiated SSE stream.
 * This one is stateless — every exchange is a single POST — so there is
 * nothing to stream and no session to terminate with DELETE.
 */
export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      jsonrpc: JSONRPC_VERSION,
      id: null,
      error: {
        code: ErrorCode.InvalidRequest,
        message:
          "This MCP server is stateless: POST JSON-RPC requests to this URL. " +
          "It offers no server-initiated event stream.",
      },
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
