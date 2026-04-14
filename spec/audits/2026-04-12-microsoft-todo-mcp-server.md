---
type: solution
date: 2026-04-12
source: https://github.com/jordanburke/microsoft-todo-mcp-server
status: evaluated
tags: [mcp, microsoft-todo, task-management, security-audit]
---

# Microsoft To Do MCP Server

## What It Is

An MCP server by Jordan Burke (fork of jhirono/todoMCP) that lets AI assistants (Claude, Cursor, Copilot) interact with Microsoft To Do via Microsoft Graph API. Written in TypeScript, published on npm as `microsoft-todo-mcp-server`. Provides 15 MCP tools for CRUD operations on task lists, tasks, and checklist items, plus an archiving tool and a diagnostic API exploration tool.

## How It Works

- **MCP Server** (`todo-index.ts`): Registers tools with `@modelcontextprotocol/sdk`, uses stdio transport. All API calls go through a single `makeGraphRequest()` helper that contacts `https://graph.microsoft.com/v1.0`.
- **Token Manager** (`token-manager.ts`): Loads tokens from env vars or `tokens.json` stored in `%APPDATA%/microsoft-todo-mcp/tokens.json`. Handles refresh via direct `POST` to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`.
- **Auth Server** (`auth-server.ts`): Express server on `localhost:3000` for the OAuth 2.0 authorization code flow using `@azure/msal-node`. Runs only during initial setup.
- **Setup** (`setup.ts`): Interactive CLI to create `.env`, run auth flow, and configure Claude Desktop config.

## Security Assessment

### Credential Handling

| Area | Finding | Severity |
|---|---|---|
| Token storage | `tokens.json` on disk in plaintext. **Includes `clientId` and `clientSecret` alongside tokens.** No encryption. | ⚠️ Medium |
| Token logging | Access tokens are explicitly `[REDACTED]` in `makeGraphRequest()`. Auth server logs token structure keys but not values. `console.error` logs truncated API responses (first 200 chars — could contain task content). | ⚠️ Low |
| PII logging | `auth-server.ts` sets `piiLoggingEnabled: true` on MSAL logger, which pipes through `console.log`. This can expose user identifiers in logs. | ⚠️ Medium |
| Claude config auto-update | `token-manager.ts` and `setup.ts` auto-write tokens into Claude Desktop's `claude_desktop_config.json` — modifying another application's config file without explicit consent. | ⚠️ Medium |
| Env vars | Tokens can be passed via `MS_TODO_ACCESS_TOKEN` / `MS_TODO_REFRESH_TOKEN` env vars — standard pattern, acceptable. | ✅ OK |

### Scope of Access (Microsoft Graph API)

Scopes requested during auth flow (`auth-server.ts`):

| Scope | Purpose | Least-privilege? |
|---|---|---|
| `Tasks.Read` | Read user's tasks | ✅ Needed |
| `Tasks.ReadWrite` | Read/write user's tasks | ✅ Needed |
| `Tasks.Read.Shared` | Read shared tasks | ⚠️ Broader than needed |
| `Tasks.ReadWrite.Shared` | Read/write shared tasks | ⚠️ Broader than needed |
| `User.Read` | Read user profile | ✅ Used for account type detection |
| `offline_access` | Refresh tokens | ✅ Standard |
| `openid` | OpenID Connect | ✅ Standard |
| `profile` | Profile info | ⚠️ Not strictly needed |

**Verdict**: Not fully least-privilege. The `.Shared` scopes grant access to tasks shared with the user across the organization — broader than personal To Do access. The `profile` scope is unnecessary.

### Data Exfiltration Risk

**All network endpoints contacted (exhaustive list)**:

1. `https://graph.microsoft.com/v1.0/me/todo/lists` — Microsoft Graph API (tasks)
2. `https://graph.microsoft.com/v1.0/me` — Microsoft Graph API (user info)
3. `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` — Microsoft OAuth
4. `https://login.microsoftonline.com/{tenantId}` — MSAL authority
5. `http://localhost:3000/callback` — Local auth callback only

**No telemetry, no analytics, no phone-home, no third-party endpoints.** All traffic goes exclusively to Microsoft's official endpoints or localhost. Verified by full grep of all source files.

### Dependencies

5 runtime dependencies, 167 total packages after resolution:

| Package | Purpose | Risk |
|---|---|---|
| `@azure/msal-node` ^3.8.1 | Microsoft auth library (official) | ✅ Trusted |
| `@modelcontextprotocol/sdk` ^1.21.1 | MCP protocol SDK (official) | ✅ Trusted |
| `dotenv` ^16.6.1 | Env var loading | ✅ Standard |
| `express` ^5.1.0 | Auth server (local only) | ✅ Standard |
| `zod` ^3.25.76 | Schema validation | ✅ Standard |

`npm audit`: **0 vulnerabilities** found. All dependencies are well-known, mainstream packages.

### Code Quality and Trust

- **~1900 lines of TypeScript** across 6 source files — fully readable and auditable in one sitting
- Fork of jhirono/todoMCP with significant additions by Jordan Burke
- 31 commits, 2 contributors, last commit **November 10, 2025** (5 months ago — moderate staleness)
- CI with GitHub Actions (lint + typecheck + build across Node 18/20/22)
- **No tests** beyond CI build checks (`"test": "echo \"Error: no test specified\" && exit 1"`)
- MIT license
- Published on npm with CI-gated publishing
- Contains a `test-api-exploration.js` debug file and a `test-graph-api-exploration` MCP tool — these are debug artifacts that shouldn't ship

### MCP Protocol Compliance

Uses `@modelcontextprotocol/sdk` properly:
- `McpServer` instantiation with name/version
- `StdioServerTransport` for communication
- Tools registered via `server.tool()` with Zod schemas for parameter validation
- Proper content response format (`{ content: [{ type: "text", text: ... }] }`)

### MCP Tools Exposed (15)

1. `auth-status` — Check authentication status
2. `get-task-lists` — Get all task lists
3. `get-task-lists-organized` — Get lists grouped by category/emoji patterns
4. `create-task-list` — Create a new list
5. `update-task-list` — Rename a list
6. `delete-task-list` — Delete a list
7. `get-tasks` — Get tasks with OData query support
8. `create-task` — Create a task (full property support)
9. `update-task` — Update a task
10. `delete-task` — Delete a task
11. `get-checklist-items` — Get subtasks
12. `create-checklist-item` — Create a subtask
13. `update-checklist-item` — Update a subtask
14. `delete-checklist-item` — Delete a subtask
15. `archive-completed-tasks` — Bulk move completed tasks between lists
16. `test-graph-api-exploration` — Debug tool (should not be exposed in production)

## Red Flags

1. **Client secret stored in plaintext** alongside tokens in `tokens.json` — if this file leaks, attacker gets full OAuth credentials
2. **`piiLoggingEnabled: true`** in MSAL config — logs personally identifiable information to stdout during auth
3. **Auto-modifies Claude Desktop config** without explicit user consent — writes tokens into another application's configuration
4. **No tests** — zero automated test coverage
5. **Shared scopes** (`Tasks.Read.Shared`, `Tasks.ReadWrite.Shared`) — grants access to organizational shared tasks beyond personal To Do
6. **Debug tool ships in production** — `test-graph-api-exploration` exposes Graph API probing capability
7. **5 months since last commit** — not abandoned but not actively maintained
8. **Token in `console.error` data** — truncated API responses logged to stderr could contain task content (not tokens, but user data)

## Relevance to Us

Potential integration for managing Microsoft To Do tasks through GitHub Copilot MCP. Would allow AI assistants to read/create/update tasks in the user's To Do lists.

## Assessment

- **Maturity**: active (but slowing — last commit Nov 2025)
- **Quality**: low-medium — readable code, proper MCP SDK usage, but no tests, debug artifacts in production, PII logging enabled
- **Fit**: partial — does what we need functionally, but security posture needs hardening before use with a real Microsoft account
- **Adoption Effort**: moderate — requires Azure app registration, OAuth flow, and ideally forking to fix security issues

## Trade-offs

**Gains**: Full Microsoft To Do CRUD via MCP, automatic token refresh, organized list views, bulk archiving.

**Costs**: Plaintext credential storage, overly broad scopes, no tests to verify behavior, auto-modifying external configs. Would need a fork to harden before trusted use.

## Recommendation

**CAUTION — use with hardening, not as-is.**

The code is honest — it does what it claims, contacts only Microsoft endpoints, has no telemetry or exfiltration vectors. The dependency tree is clean and minimal. However, it stores OAuth client secrets in plaintext, enables PII logging, requests broader scopes than needed, and auto-modifies external application configs. These are not malicious, but they reflect a prototype-quality security posture.

**If adopting**, fork and fix:
1. Remove `clientSecret` from `tokens.json` — use env vars or OS keychain
2. Set `piiLoggingEnabled: false`
3. Remove `Tasks.Read.Shared` and `Tasks.ReadWrite.Shared` scopes (unless shared tasks are needed)
4. Remove `profile` scope
5. Remove `test-graph-api-exploration` tool
6. Remove auto-modification of Claude Desktop config (or make it opt-in)
7. Reduce `console.error` API response logging
