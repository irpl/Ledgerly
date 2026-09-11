# MCP server (connect Claude to your ledger)

Ledgerly exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server at **`POST {APP_BASE_URL}/api/mcp`**. Point Claude (or any MCP client) at
it and it can read your accounts, search transactions, record spending, manage
the budget and work the email review queue — the same operations the web UI
offers, minus the ones that would let a token take over the account.

Flow: **MCP client → `POST /api/mcp` with a bearer token → tool call → the same
Prisma queries the web app uses**.

## 1. Mint a token

Settings → **Claude / MCP access** → name it, pick the access level, create.

- **Full access** — every tool, including creating and deleting transactions.
- **Read-only** — the reading tools only. Writing tools are not even listed, so
  the model cannot attempt them. Good default for "answer questions about my
  money" without giving anything write access.

Optionally give the token an expiry (30 days / 90 days / 1 year). The secret is
shown **once**; only its SHA-256 hash is stored, so it cannot be recovered — mint
a new one and revoke the old if you lose it. Revoking takes effect immediately.

A token acts as you. Treat it like a password: it is not scoped to a device, and
anyone holding it can reach your ledger from anywhere.

## 2. Connect a client

**Claude Code** (the command is offered ready-to-paste when you create a token):

```bash
claude mcp add --transport http ledgerly https://your-host/api/mcp \
  --header "Authorization: Bearer ldg_…"
```

**Claude Desktop / claude.ai custom connector**: add a custom connector with the
URL `https://your-host/api/mcp` and the header
`Authorization: Bearer ldg_…`.

**Anything else**: the endpoint is Streamable HTTP with JSON responses. Send
JSON-RPC 2.0 over `POST`, with `Authorization: Bearer …` and
`Content-Type: application/json`. A quick check:

```bash
curl -s -X POST https://your-host/api/mcp \
  -H "Authorization: Bearer ldg_…" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. What the model can do

37 tools, grouped:

| Area | Tools |
|---|---|
| Orientation | `get_profile`, `get_financial_overview` |
| Accounts | `list_accounts`, `get_account`, `create_account`, `update_account`, `set_account_archived` |
| Transactions | `list_transactions`, `get_transaction`, `create_transaction`, `update_transaction`, `delete_transaction`, `create_transfer` |
| Categories & vendors | `list_categories`, `create_category`, `update_category`, `delete_category`, `list_vendors` |
| Budget | `list_budget_lines`, `create_budget_line`, `update_budget_line`, `delete_budget_line`, `get_income_plan`, `add_income_plan_entry`, `update_income_plan_entry`, `delete_income_plan_entry`, `get_budget_vs_actual` |
| Reporting | `get_liabilities`, `get_balance_history` |
| Email ingestion | `list_review_queue`, `confirm_transaction`, `reparse_email`, `list_parser_rules`, `create_parser_rule`, `update_parser_rule`, `delete_parser_rule` |
| Preferences | `update_profile` |

Things worth knowing when reading the output:

- **Amounts are major units at the MCP boundary** (4512.35), not the signed
  minor units the database stores. Conversion happens in `src/lib/mcp/shared.ts`;
  the rest of the app is unchanged.
- **Signs are preserved**: money out is negative, money in is positive. A card
  or loan you owe on has a negative balance.
- **Per currency, always.** Totals are keyed by currency and never summed across
  currencies — there is no FX conversion (spec §3.1 is still unbuilt).
- **Transfers are not spending.** `create_transfer` writes both legs, and every
  income/expense rollup excludes them.
- **Email-sourced transactions arrive `pending_review`** and do not move a
  balance until `confirm_transaction`.

The server also sends `instructions` at connection time (see
`SERVER_INSTRUCTIONS` in `src/lib/mcp/protocol.ts`) so the model gets these
conventions without being told.

## 4. Deliberate limits

Not exposed through MCP, on purpose:

- **Changing the login email or password.** A token must not be able to lock you
  out of your own account.
- **Creating or revoking tokens.** Token management is session-only
  (`/api/me/tokens`), so a leaked token cannot mint itself a replacement or a
  wider scope.
- **Admin user management.** Admin APIs re-check the role against the database
  and are outside the MCP surface entirely.
- **Deleting accounts.** Accounts archive (`set_account_archived`); history is
  never destroyed.

Everything a tool does is scoped to the token's own user: ids are loaded with a
`userId` filter, so another tenant's id simply reads as "not found"
(`tests/integration/mcp-tools.test.ts` pins this down).

## 5. How it is built

| File | Role |
|---|---|
| `src/app/api/mcp/route.ts` | HTTP shell: bearer auth, JSON-RPC in, JSON out |
| `src/lib/mcp/protocol.ts` | JSON-RPC 2.0 + MCP methods (`initialize`, `tools/list`, `tools/call`, `ping`) |
| `src/lib/mcp/registry.ts` | The tool catalog and Zod → JSON Schema publication |
| `src/lib/mcp/tools/*.ts` | The tools themselves |
| `src/lib/mcp/shared.ts` | Unit conversion, ownership guards, result shapes |
| `src/lib/api-tokens.ts` | Minting, hashing and verifying bearer tokens |

The server is **stateless**: no session id, no server-initiated SSE stream —
every exchange is one `POST`. `GET` and `DELETE` answer `405`. Protocol
revisions `2025-06-18`, `2025-03-26` and `2024-11-05` are accepted; the client's
version is echoed when we speak it.

There is no MCP SDK dependency. The protocol surface used here is small, and
implementing it directly keeps the Docker image and the dependency tree as they
were.

`/api/mcp` is excluded from the proxy matcher in `src/proxy.ts` so an
unauthenticated call gets a JSON `401` with `WWW-Authenticate`, not an HTML
redirect to `/login` that an MCP client cannot read. Session cookies are **not**
accepted on `/api/mcp`: bearer-only means a random website your browser visits
cannot drive your ledger.

### Adding a tool

1. Write it in the right `src/lib/mcp/tools/*.ts` with `defineTool` — a Zod
   input schema (`.describe()` every field; the model reads those) and a handler
   that takes the parsed args plus `{ userId, scope }`.
2. Load any id through `requireAccount` / `requireCategory` so ownership is
   checked, and convert money with `toMinor` / `toMajor`.
3. Throw `ToolError` for anything the model should see and act on.
4. Add it to `TOOLS` in `src/lib/mcp/registry.ts`, and set `readOnly` honestly —
   that flag is what read-only tokens are filtered on.

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| `401` with `WWW-Authenticate` | Missing, revoked or expired token — mint a new one in Settings |
| A write tool is missing from `tools/list` | The token is read-only |
| `405` | You sent `GET`/`DELETE`; this server is `POST`-only |
| Client shows an HTML login page | The request did not reach `/api/mcp` (check the URL and that the proxy matcher still excludes `api/mcp`) |
| "No account with id …" | The id belongs to another user, or does not exist |
