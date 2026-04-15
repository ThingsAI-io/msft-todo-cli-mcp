# Microsoft To Do CLI + MCP Server — Implementation Spec

## Purpose

Build a **CLI-first** tool for managing Microsoft To Do tasks, with an optional thin MCP server wrapper. Any agent with `execute` tool access can use the CLI directly — no MCP configuration needed. The MCP server is a secondary interface for agents that support it natively.

AI agents excel at planning, breaking down tasks, and tracking follow-ups — but they need a write path into the user's actual task management system. Without one, plans live in chat and die there.

**Why CLI-first:**
- Any agent with terminal access can use it — no MCP config per agent/editor
- Works outside Copilot too: scripts, cron jobs, shell aliases, other AI tools
- Simpler to test: `todo tasks create --list "Tasks" --title "Call dentist" --due tomorrow`
- The MCP wrapper is ~50 lines that maps tools to the same core library

**Key use cases:**
- **Externalize plans**: Convert conversations into tasks with due dates, reminders, and checklist sub-steps
- **Micro-stepping**: Break tasks into small, concrete checklist items
- **Reminder-driven workflow**: Set reminders at key transition points
- **Read back**: Agents can check existing tasks before adding more, preventing overload
- **Structured check-ins**: Morning plan / midday review / evening wrap-up cycles via task reads

## Anti-Patterns (from security audit)

The existing implementation (`jordanburke/microsoft-todo-mcp-server`) was evaluated and found to have these issues. **Do not repeat any of them:**

1. **Plaintext token storage** — `tokens.json` stores `clientId`, `clientSecret`, and tokens in cleartext JSON. If the file leaks, the attacker gets full OAuth credentials. **→ Encrypt tokens at rest using DPAPI (Windows) / Keychain (macOS) / `libsecret` (Linux), or at minimum AES-256 with a machine-derived key.**

2. **Client secret in a public client** — The existing implementation uses `ConfidentialClientApplication` (MSAL) with a client secret. For a desktop/CLI tool, use **public client with PKCE** — no client secret at all.

3. **PII logging enabled** — `piiLoggingEnabled: true` in MSAL config pipes user identifiers to stdout. **→ Set `piiLoggingEnabled: false`. Never log PII.**

4. **Overly broad scopes** — Requests `Tasks.Read.Shared`, `Tasks.ReadWrite.Shared`, `User.Read`, `profile`, `openid` beyond what's needed. **→ Request only `Tasks.ReadWrite` and `offline_access`.**

5. **Auto-modifies external application configs** — Writes tokens into Claude Desktop's `claude_desktop_config.json` without consent. **→ Never modify another application's configuration files.**

6. **Debug tool ships in production** — `test-graph-api-exploration` exposes arbitrary Graph API probing. **→ No debug/exploration tools in the production build.**

7. **API response content logged to stderr** — Truncated response bodies (first 200 chars) could contain task content. **→ Log only status codes and error types, never response bodies.**

8. **No tests** — Zero automated test coverage. **→ Test token refresh logic, Graph API request construction, and MCP tool schemas.**

## Existing Solutions Comparison

Two existing Microsoft To Do MCP servers were investigated. Full security audits:
- [`spec/audits/2026-04-12-microsoft-todo-mcp-server.md`](audits/2026-04-12-microsoft-todo-mcp-server.md) (jordanburke)
- [`spec/audits/2026-04-12-todomcp.md`](audits/2026-04-12-todomcp.md) (jhirono)

| Dimension | jhirono/todomcp | jordanburke/microsoft-todo-mcp-server | **Our Spec** |
|---|---|---|---|
| Interface | MCP only | MCP only | **CLI + MCP** |
| Auth | ConfidentialClient + secret | ConfidentialClient + secret | **Public client + PKCE (no secret)** |
| Token storage | Plaintext JSON | Plaintext JSON (**secret in file**) | **Encrypted (AES-256-GCM)** |
| Scopes | 8 | 8 | **2** (`Tasks.ReadWrite` + `offline_access`) |
| PII logging | Enabled | Enabled | **Disabled** |
| Auto-modify external config | No | Yes (Claude Desktop) | **No** |
| Dependencies | 82 direct | ~30 | **2 runtime** (`@modelcontextprotocol/sdk`, `zod`) |
| MSAL | v1 (EOL) | v3 | **None — raw fetch + PKCE** |
| Tests | None | None | **Yes (vitest)** |
| Tools | 13 | 16 | **13** |
| Debug tools exposed | No | Yes | **No** |
| Last commit | Mar 2025 (13mo) | Nov 2025 (5mo) | — |
| License | **None** | MIT | MIT |

### Patterns to Adopt from Existing Implementations

1. **Personal account detection** (jhirono) — Proactive `MailboxNotEnabledForRESTAPI` warning before the user hits the error. Add to our auth setup flow.
2. **OData query parameters** (jhirono) — `filter`, `select`, `orderby`, `top`, `skip`, `count` on task listing. Our spec already has `$filter`, `$orderby`, `$top` — add `$select` and `$count`.
3. **Empty-string-to-null pattern** (jhirono) — Clearing date fields via empty string in `update-task`. Adopt for our `update-task` tool.
4. **To Do hierarchy in tool descriptions** (jhirono) — Explain the list→task→checklist model in tool descriptions for agents unfamiliar with To Do's structure.

### Gaps in Both That We Close

- **No CLI interface** — both are MCP-only. Our CLI-first approach makes it accessible to any agent with terminal access.
- **Client secret required** — both use confidential client flow. Our PKCE approach eliminates the secret entirely.
- **Plaintext credentials** — neither encrypts tokens. We use AES-256-GCM.
- **No tests** — neither has any. We ship with vitest coverage.
- **Excessive scopes** — both request 8 scopes. We need 2.
- **Dead dependencies** — jhirono has unused `express-rate-limit` and `pkce-challenge`. We have 2 runtime deps total.

## Architecture

### Dual Interface: CLI + MCP

The core logic lives in a shared library. Two thin entry points expose it:

1. **CLI** (primary) — `todo <command> [options]`. Used by any agent via `execute` tool or by the user directly in a terminal.
2. **MCP server** (secondary) — launched via `todo serve`. Stdio transport, runs as a child process for MCP clients. Same binary, single install.

Both interfaces share: Graph API client, auth/token management, input validation, response formatting.

- No HTTP server in production (auth uses a temporary localhost callback only during initial setup)

### OAuth Flow
- **OAuth 2.0 Authorization Code with PKCE** (public client — no client secret)
- Azure AD app registration as a **public client** with `http://localhost:3847/callback` redirect URI
- Tenant: `consumers` (personal Microsoft accounts) or `common` (both personal + org) — configurable via env var
- One-time interactive auth via system browser → localhost callback → store tokens
- **Auto-auth from MCP serve**: When `todo serve` detects no stored tokens and `TODO_MCP_CLIENT_ID` is available, it auto-triggers the OAuth browser flow inline. All auth messages go to **stderr** (not stdout) to keep the MCP JSON-RPC stdio transport clean. This means MCP users never need to run `todo setup` separately — the first tool call handles everything.

### Token Storage
- Tokens stored in platform-specific secure storage:
  - **Windows**: DPAPI via `node:crypto` (`crypto.createCipheriv` with a machine-scoped key derived from `DPAPI`)
  - **Cross-platform fallback**: AES-256-GCM encryption with a key derived from machine identity (hostname + username + a salt), stored in the user's config directory
- Token file location: `~/.config/todo-mcp/tokens.enc` (Linux/macOS) or `%APPDATA%/todo-mcp/tokens.enc` (Windows)
- **Never store tokens in plaintext. Never store client secrets (there are none — public client).**

### Azure AD App Registration

Users need an Azure AD app registration to get a client ID. The README and docs must include both methods:

**Azure Portal:**
1. Go to Azure Portal → App registrations → New registration
2. Name: anything (e.g., "Todo MCP Server")
3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
4. Redirect URI: Platform = "Mobile and desktop applications", URI = `http://localhost:3847/callback`
5. Under API permissions → Add → Microsoft Graph → Delegated → `Tasks.ReadWrite`
6. Copy the Application (client) ID

**Azure CLI (one-liner):**
```bash
az ad app create \
  --display-name "Todo MCP Server" \
  --public-client-redirect-uris "http://localhost:3847/callback" \
  --sign-in-audience "AzureADandPersonalMicrosoftAccount" \
  --query appId -o tsv
```
Then add the permission:
```bash
az ad app permission add \
  --id <APP_ID> \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 2219042f-cab5-40cc-b0d2-16b1540b4c5f=Scope
```

### Project Structure

```
system/src/todo-mcp-server/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── src/
│   ├── cli.ts                # Single entry point — parses args, routes to core or starts MCP server
│   ├── mcp.ts                # MCP server setup — registers tools, wires stdio transport
│   ├── core/
│   │   ├── task-lists.ts     # Task list CRUD operations
│   │   ├── tasks.ts          # Task CRUD operations
│   │   └── checklist-items.ts # Checklist item CRUD operations
│   ├── graph/
│   │   └── client.ts         # Microsoft Graph API client (fetch wrapper)
│   ├── auth/
│   │   ├── token-manager.ts  # Token load/save/refresh logic
│   │   ├── token-store.ts    # Encrypted token persistence
│   │   └── setup.ts          # One-time interactive OAuth PKCE flow
│   ├── format.ts             # Output formatting (human-readable for CLI, structured for MCP)
│   └── types.ts              # Shared TypeScript interfaces
└── tests/
    ├── graph-client.test.ts
    ├── token-manager.test.ts
    ├── core.test.ts
    └── cli.test.ts
```

## Microsoft Graph API Reference

Base URL: `https://graph.microsoft.com/v1.0`

### Scopes Required
- `Tasks.ReadWrite` — read and write the user's tasks and task lists
- `offline_access` — obtain a refresh token for long-lived access

**No other scopes.** Do not request `User.Read`, `Tasks.Read.Shared`, `Tasks.ReadWrite.Shared`, `profile`, or `openid`.

### Endpoints

#### Task Lists

| Operation | Method | URL | Request Body | Response |
|---|---|---|---|---|
| List all | `GET` | `/me/todo/lists` | — | `{ value: TodoTaskList[] }` |
| Get one | `GET` | `/me/todo/lists/{listId}` | — | `TodoTaskList` |
| Create | `POST` | `/me/todo/lists` | `{ displayName: string }` | `TodoTaskList` |
| Update | `PATCH` | `/me/todo/lists/{listId}` | `{ displayName: string }` | `TodoTaskList` |
| Delete | `DELETE` | `/me/todo/lists/{listId}` | — | `204 No Content` |

**TodoTaskList shape:**
```json
{
  "id": "string",
  "displayName": "string",
  "isOwner": true,
  "isShared": false,
  "wellknownListName": "none" | "defaultList" | "flaggedEmails"
}
```

#### Tasks

| Operation | Method | URL | Request Body | Response |
|---|---|---|---|---|
| List | `GET` | `/me/todo/lists/{listId}/tasks` | — | `{ value: TodoTask[] }` |
| Get one | `GET` | `/me/todo/lists/{listId}/tasks/{taskId}` | — | `TodoTask` |
| Create | `POST` | `/me/todo/lists/{listId}/tasks` | See below | `TodoTask` |
| Update | `PATCH` | `/me/todo/lists/{listId}/tasks/{taskId}` | Partial `TodoTask` | `TodoTask` |
| Delete | `DELETE` | `/me/todo/lists/{listId}/tasks/{taskId}` | — | `204 No Content` |

**TodoTask shape (relevant properties):**
```json
{
  "id": "string",
  "title": "string",
  "status": "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred",
  "importance": "low" | "normal" | "high",
  "isReminderOn": false,
  "body": {
    "content": "string",
    "contentType": "text"
  },
  "dueDateTime": {
    "dateTime": "2026-04-15T00:00:00.0000000",
    "timeZone": "UTC"
  },
  "reminderDateTime": {
    "dateTime": "2026-04-15T09:00:00.0000000",
    "timeZone": "UTC"
  },
  "startDateTime": {
    "dateTime": "2026-04-14T00:00:00.0000000",
    "timeZone": "UTC"
  },
  "completedDateTime": {
    "dateTime": "2026-04-15T14:30:00.0000000",
    "timeZone": "UTC"
  },
  "categories": ["string"],
  "createdDateTime": "string",
  "lastModifiedDateTime": "string"
}
```

**OData query support for GET tasks:**
- `$filter` — e.g., `status eq 'notStarted'`
- `$orderby` — e.g., `dueDateTime/dateTime asc`
- `$top` / `$skip` — pagination
- `$select` — field selection

#### Checklist Items

| Operation | Method | URL | Request Body | Response |
|---|---|---|---|---|
| List | `GET` | `/me/todo/lists/{listId}/tasks/{taskId}/checklistItems` | — | `{ value: ChecklistItem[] }` |
| Create | `POST` | `/me/todo/lists/{listId}/tasks/{taskId}/checklistItems` | `{ displayName, isChecked? }` | `ChecklistItem` |
| Update | `PATCH` | `/me/todo/lists/{listId}/tasks/{taskId}/checklistItems/{itemId}` | Partial | `ChecklistItem` |
| Delete | `DELETE` | `/me/todo/lists/{listId}/tasks/{taskId}/checklistItems/{itemId}` | — | `204 No Content` |

**ChecklistItem shape:**
```json
{
  "id": "string",
  "displayName": "string",
  "isChecked": false,
  "createdDateTime": "string"
}
```

## MCP Tools (complete list)

### 1. `list-task-lists`

**Description:** Get all Microsoft To Do task lists. Returns list names, IDs, and metadata.

**Input schema:**
```json
{}
```

**Graph API:** `GET /me/todo/lists`

**Response format:** Formatted text listing each list with ID, name, and flags (default, shared).

---

### 2. `create-task-list`

**Description:** Create a new task list in Microsoft To Do.

**Input schema:**
```json
{
  "displayName": { "type": "string", "description": "Name of the new task list" }
}
```

**Graph API:** `POST /me/todo/lists` with `{ "displayName": "..." }`

**Response format:** Confirmation with list ID and name.

---

### 3. `update-task-list`

**Description:** Rename an existing task list.

**Input schema:**
```json
{
  "listId": { "type": "string", "description": "ID of the task list" },
  "displayName": { "type": "string", "description": "New name for the task list" }
}
```

**Graph API:** `PATCH /me/todo/lists/{listId}` with `{ "displayName": "..." }`

**Response format:** Confirmation with updated name.

---

### 4. `delete-task-list`

**Description:** Delete a task list and all tasks within it. Irreversible.

**Input schema:**
```json
{
  "listId": { "type": "string", "description": "ID of the task list to delete" }
}
```

**Graph API:** `DELETE /me/todo/lists/{listId}`

**Response format:** Confirmation message.

---

### 5. `list-tasks`

**Description:** Get tasks from a specific list. Supports filtering by status, sorting by due date, and pagination.

**Input schema:**
```json
{
  "listId": { "type": "string", "description": "ID of the task list" },
  "status": { "type": "string", "enum": ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"], "description": "Filter by task status", "optional": true },
  "top": { "type": "number", "description": "Maximum number of tasks to return", "optional": true }
}
```

**Graph API:** `GET /me/todo/lists/{listId}/tasks` with optional `$filter`, `$orderby`, `$top` query params.

**Response format:** Formatted text listing each task with ID, title, status icon (✓/○), due date, importance, and body preview.

---

### 6. `create-task`

**Description:** Create a new task in a list. Supports title, body, due date, reminder, importance, and status.

**Input schema:**
```json
{
  "listId": { "type": "string", "description": "ID of the task list" },
  "title": { "type": "string", "description": "Task title — should be a concrete next action, not a vague intention" },
  "body": { "type": "string", "description": "Task description/notes", "optional": true },
  "dueDateTime": { "type": "string", "description": "Due date in ISO 8601 format (e.g., 2026-04-15T17:00:00Z)", "optional": true },
  "reminderDateTime": { "type": "string", "description": "Reminder date/time in ISO 8601 format", "optional": true },
  "importance": { "type": "string", "enum": ["low", "normal", "high"], "optional": true },
  "startDateTime": { "type": "string", "description": "Start date in ISO 8601 format", "optional": true },
  "status": { "type": "string", "enum": ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"], "optional": true },
  "categories": { "type": "array", "items": { "type": "string" }, "description": "Category tags", "optional": true }
}
```

**Graph API:** `POST /me/todo/lists/{listId}/tasks`

**Response format:** Confirmation with task ID and title.

---

### 7. `update-task`

**Description:** Update any properties of an existing task — title, status, due date, reminder, importance, body, categories.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" },
  "title": { "type": "string", "optional": true },
  "body": { "type": "string", "optional": true },
  "dueDateTime": { "type": "string", "optional": true },
  "reminderDateTime": { "type": "string", "optional": true },
  "importance": { "type": "string", "enum": ["low", "normal", "high"], "optional": true },
  "startDateTime": { "type": "string", "optional": true },
  "status": { "type": "string", "enum": ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"], "optional": true },
  "categories": { "type": "array", "items": { "type": "string" }, "optional": true }
}
```

**Graph API:** `PATCH /me/todo/lists/{listId}/tasks/{taskId}`

**Response format:** Confirmation with updated task summary.

---

### 8. `delete-task`

**Description:** Delete a task and all its checklist items. Irreversible.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" }
}
```

**Graph API:** `DELETE /me/todo/lists/{listId}/tasks/{taskId}`

**Response format:** Confirmation message.

---

### 9. `complete-task`

**Description:** Mark a task as completed. Convenience wrapper that sets `status: "completed"`. Designed for quick CoS-driven task closure during accountability check-ins.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" }
}
```

**Graph API:** `PATCH /me/todo/lists/{listId}/tasks/{taskId}` with `{ "status": "completed" }`

**Response format:** Confirmation message.

---

### 10. `list-checklist-items`

**Description:** Get the checklist items (sub-steps) for a task.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" }
}
```

**Graph API:** `GET /me/todo/lists/{listId}/tasks/{taskId}/checklistItems`

**Response format:** Formatted text with each item's name, checked status (✓/○), and ID.

---

### 11. `create-checklist-item`

**Description:** Add a checklist sub-step to a task.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" },
  "displayName": { "type": "string", "description": "Text of the checklist item — should be a concrete micro-step" },
  "isChecked": { "type": "boolean", "optional": true }
}
```

**Graph API:** `POST /me/todo/lists/{listId}/tasks/{taskId}/checklistItems`

**Response format:** Confirmation with item ID.

---

### 12. `update-checklist-item`

**Description:** Update a checklist item's text or checked status.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" },
  "checklistItemId": { "type": "string" },
  "displayName": { "type": "string", "optional": true },
  "isChecked": { "type": "boolean", "optional": true }
}
```

**Graph API:** `PATCH /me/todo/lists/{listId}/tasks/{taskId}/checklistItems/{checklistItemId}`

**Response format:** Confirmation with updated item summary.

---

### 13. `delete-checklist-item`

**Description:** Delete a checklist item from a task.

**Input schema:**
```json
{
  "listId": { "type": "string" },
  "taskId": { "type": "string" },
  "checklistItemId": { "type": "string" }
}
```

**Graph API:** `DELETE /me/todo/lists/{listId}/tasks/{taskId}/checklistItems/{checklistItemId}`

**Response format:** Confirmation message.

---

**Tools NOT included (by design):**
- No `auth-status` tool — authentication is invisible; errors surface in tool responses
- No `get-task-lists-organized` — hardcoded emoji-pattern grouping is user-specific; the CoS agent can do this in its own logic
- No `archive-completed-tasks` — bulk operations should be composed by the agent from primitive CRUD tools
- No `test-graph-api-exploration` — debug tool, must not ship

## Authentication Flow

### Azure AD App Registration Requirements

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. **New registration**:
   - Name: `Todo MCP Server` (or similar)
   - Supported account types: Select based on account type:
     - "Personal Microsoft accounts only" for consumer accounts
     - "Accounts in any organizational directory and personal Microsoft accounts" for both
   - Redirect URI: **Public client/native** → `http://localhost:3847/callback`
3. Under **Authentication**:
   - Enable "Allow public client flows" = **Yes**
   - No client secret needed (public client)
4. Under **API permissions**:
   - Add `Microsoft Graph` → Delegated → `Tasks.ReadWrite`
   - `offline_access` is implicit and does not need to be added in the portal
   - **Remove** any default `User.Read` permission
5. Record the **Application (client) ID** — this is the only credential needed

### OAuth PKCE Flow (Step-by-Step)

1. **User runs setup command**: `todo setup`
2. **Generate PKCE challenge**:
   - Create a random `code_verifier` (43–128 chars, URL-safe)
   - Derive `code_challenge` = base64url(SHA-256(`code_verifier`))
3. **Start temporary localhost HTTP server** on port `3847` (only runs during auth)
4. **Open system browser** to Microsoft authorization URL:
   ```
   https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
     ?client_id={clientId}
     &response_type=code
     &redirect_uri=http://localhost:3847/callback
     &scope=Tasks.ReadWrite offline_access
     &code_challenge={code_challenge}
     &code_challenge_method=S256
     &response_mode=query
   ```
5. **User authenticates** in browser → Microsoft redirects to `http://localhost:3847/callback?code=...`
6. **Exchange code for tokens**:
   ```
   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   Content-Type: application/x-www-form-urlencoded

   client_id={clientId}
   &grant_type=authorization_code
   &code={authorization_code}
   &redirect_uri=http://localhost:3847/callback
   &code_verifier={code_verifier}
   ```
   Response contains `access_token`, `refresh_token`, `expires_in`.
7. **Encrypt and store tokens** to disk (see Token Storage below)
8. **Shut down localhost server** — it only runs for the auth flow
9. **Print success message** with instructions for configuring MCP client

### Token Refresh Logic

- Before every Graph API call, check if `expiresAt < Date.now() + 5_minutes`
- If expired or near-expiry, refresh:
  ```
  POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
  Content-Type: application/x-www-form-urlencoded

  client_id={clientId}
  &grant_type=refresh_token
  &refresh_token={stored_refresh_token}
  &scope=Tasks.ReadWrite offline_access
  ```
- On success: update stored tokens (both access and refresh — refresh tokens rotate)
- On failure (e.g., refresh token revoked): return a clear error message instructing the user to re-run setup
- **No client secret** in the refresh request (public client flow)

### Secure Token Persistence

Store an encrypted JSON blob containing:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": 1713000000000,
  "clientId": "...",
  "tenant": "..."
}
```

Encryption approach:
- **AES-256-GCM** using Node.js `crypto` module
- Key derived from: `PBKDF2(machineId + username, storedSalt, 100000, 32, 'sha512')`
  - `machineId`: `os.hostname()` (not secret, but adds machine-binding)
  - `username`: `os.userInfo().username`
  - Salt: random 16 bytes, stored alongside the encrypted file
- Store as: `{ salt: hex, iv: hex, tag: hex, data: hex }` in the `.enc` file
- This is not Fort Knox — it prevents casual plaintext exposure and file-copy attacks. For higher security, users can set tokens via env vars instead.

**Environment variable override**: If `TODO_MCP_ACCESS_TOKEN` and `TODO_MCP_REFRESH_TOKEN` are set, use those directly (skip file storage). This supports CI/headless scenarios.

## Security Requirements

1. **No client secret** — public client with PKCE only
2. **Encrypted token storage** — AES-256-GCM with machine-derived key; never plaintext JSON
3. **Minimal scopes** — `Tasks.ReadWrite` + `offline_access` only
4. **Zero PII logging** — `piiLoggingEnabled: false`; never log user identifiers, task content, or token values
5. **No response body logging** — log HTTP status codes and error types only
6. **No telemetry** — no analytics, no phone-home, no third-party endpoints
7. **No external config modification** — never write to Claude Desktop, VS Code, or any other application's config files
8. **No debug tools in production** — no API exploration or diagnostic tools exposed as MCP tools
9. **Input validation** — all tool inputs validated via Zod schemas before use
10. **URL construction safety** — `listId`, `taskId`, `checklistItemId` must be validated as non-empty strings; construct Graph API URLs safely (no template literal injection of unvalidated user input into path segments)
11. **Token refresh race condition** — ensure concurrent requests don't trigger parallel refreshes (use a mutex/promise cache)
12. **Localhost auth server is ephemeral** — starts only for auth flow, shuts down immediately after

## Project Setup

### Directory
```
system/src/todo-mcp-server/
```

### Dependencies (minimal list with justification)

| Package | Purpose | Justification |
|---|---|---|
| `@modelcontextprotocol/sdk` | MCP protocol server + stdio transport | Required — this is what we're building |
| `zod` | Input schema validation for MCP tools | Required by MCP SDK for tool parameter schemas |

**That's it.** Two runtime dependencies.

- **No `@azure/msal-node`** — we're making direct HTTPS calls for OAuth. MSAL is 500KB+ of complexity for a flow that's 2 fetch calls (authorize + token exchange). Use raw `fetch()` with PKCE.
- **No `dotenv`** — use `process.env` directly. Users configure env vars in their MCP client config or shell profile.
- **No `express`** — the temporary auth server uses Node.js built-in `http.createServer()`.

### Dev Dependencies

| Package | Purpose |
|---|---|
| `typescript` | Type checking and compilation |
| `vitest` | Testing |
| `tsx` | Dev execution without build step |
| `@types/node` | Node.js type definitions |

### package.json essentials

```json
{
  "name": "@thingsai/todo-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "description": "CLI-first Microsoft To Do management with MCP server wrapper",
  "main": "dist/cli.js",
  "bin": {
    "todo": "dist/cli.js"
  },
  "files": [
    "dist/**/*.js",
    "dist/**/*.d.ts",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli.js",
    "dev": "tsx src/cli.ts",
    "setup": "tsx src/auth/setup.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["microsoft-todo", "mcp", "cli", "tasks", "graph-api"],
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### tsconfig.json essentials

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### .gitignore

```
node_modules/
dist/
*.enc
.env
```

## Implementation Order

1. **Project scaffolding** — Create directory structure, `package.json`, `tsconfig.json`, `.gitignore`, install dependencies. Verify `tsc` compiles and `vitest` runs.

2. **Types** — Define `TodoTaskList`, `TodoTask`, `ChecklistItem`, `TokenData` interfaces in `src/types.ts`.

3. **Graph API client** — Build `src/graph/client.ts`:
   - `makeGraphRequest<T>(url, token, method?, body?)` function using `fetch()`
   - Automatic 401 retry with token refresh callback
   - Log only status codes, never response bodies
   - Validate HTTP status codes and return typed results

4. **Token store** — Build `src/auth/token-store.ts`:
   - `encrypt(data: TokenData): Buffer` and `decrypt(buffer: Buffer): TokenData`
   - AES-256-GCM with machine-derived key
   - `save(tokens: TokenData)` and `load(): TokenData | null`
   - Write tests for encrypt/decrypt round-trip

5. **Token manager** — Build `src/auth/token-manager.ts`:
   - Loads tokens from env vars or encrypted file
   - `getAccessToken(): Promise<string>` — checks expiry, refreshes if needed
   - Token refresh via raw `fetch()` to Microsoft token endpoint (no MSAL)
   - Mutex to prevent concurrent refresh races
   - Write tests for refresh logic (mock fetch)

6. **Auth setup CLI** — Build `src/auth/setup.ts`:
   - PKCE code verifier/challenge generation
   - Ephemeral `http.createServer()` on port 3847
   - Open system browser (`child_process.exec` with platform detection)
   - Exchange code for tokens
   - Encrypt and save tokens
   - Print MCP configuration snippet
   - Write test for PKCE generation

7. **Core operations — task lists** — Build `src/core/task-lists.ts`:
   - Pure functions: `listTaskLists()`, `createTaskList()`, `updateTaskList()`, `deleteTaskList()`
   - Each takes a `GraphClient` instance, returns typed results
   - Write tests for input validation and response formatting

8. **Core operations — tasks** — Build `src/core/tasks.ts`:
   - `listTasks()`, `createTask()`, `updateTask()`, `deleteTask()`, `completeTask()`
   - Handle date/time formatting (ISO 8601 → Graph API dateTime objects)
   - Write tests for request body construction

9. **Core operations — checklist items** — Build `src/core/checklist-items.ts`:
   - `listChecklistItems()`, `createChecklistItem()`, `updateChecklistItem()`, `deleteChecklistItem()`
   - Write tests for input validation

10. **CLI entry point** — Build `src/cli.ts`:
    - Parse args with a lightweight approach (Node.js `parseArgs` from `node:util` — zero dependencies)
    - Route commands to core functions
    - Human-readable output formatting (tables, status icons)
    - Usage: `todo <command> [options]`
    - Commands mirror core operations:
      ```
      todo lists                                    # list all task lists
      todo lists create "Groceries"                  # create a list
      todo tasks --list <id>                         # list tasks
      todo tasks create --list <id> --title "..." --due 2026-04-15 --importance high
      todo tasks complete --list <id> --task <id>    # mark done
      todo checklist --list <id> --task <id>         # list sub-steps
      todo checklist add --list <id> --task <id> --text "Open doc"
      todo serve                                    # start MCP server on stdio
      todo setup --client-id <id>                    # run interactive OAuth setup
      todo setup --client-id <id> --tenant <tenant>  # setup with custom tenant
      ```
    - `todo serve` delegates to `startMcpServer()` from `src/mcp.ts`
    - `todo setup` accepts `--client-id` and `--tenant` flags so users don't need to set env vars. Falls back to `TODO_MCP_CLIENT_ID` / `TODO_MCP_TENANT` env vars if flags aren't provided.
    - Write tests for arg parsing and command routing

11. **MCP server module** — Build `src/mcp.ts`:
    - Exports `startMcpServer()` — called by `cli.ts` when `todo serve` is invoked
    - Create `McpServer`, register 13 tools, each calls the corresponding core function
    - Wire up `StdioServerTransport`
    - ~50-100 lines of code — all logic lives in core
    - Manual smoke test: run via `echo '...' | todo serve`

12. **README** — Keep the README slim (~50 lines). Quick install, one setup command, one MCP config snippet, link to docs/ for details.

13. **Documentation** — Create a `docs/` folder with detailed guides:
    - `getting-started.md` — Install, create Azure app, authenticate, first command
    - `azure-setup.md` — Step-by-step Azure AD app registration (both Portal and `az cli` methods)
    - `cli-reference.md` — Full command reference with examples for every command
    - `mcp-integration.md` — MCP client configuration for VS Code, Claude Desktop, etc.
    - `configuration.md` — Environment variables, token storage paths, tenant configuration
    - `security.md` — Security model, threat model, what's protected and what's not

14. **End-to-end smoke test** — With a real Azure AD app:
    - Run setup, authenticate
    - CLI: create list → create task with due date + reminder + checklist items → read back → complete → delete
    - MCP: verify same operations work through MCP transport
    - Verify token refresh works (wait for expiry or force it)

## Testing Strategy

### Unit Tests (vitest)

| Area | What to test |
|---|---|
| `token-store.ts` | Encrypt/decrypt round-trip; corrupted file handling; missing file returns null |
| `token-manager.ts` | Env var override; file-based token load; token refresh flow (mock fetch); mutex prevents concurrent refresh; expired token triggers refresh |
| `graph/client.ts` | Request construction (URL, headers, body); 401 retry logic; error response handling; no response body in logs |
| `core/*.ts` | Input validation; request body construction for Graph API; response formatting |
| `cli.ts` | Arg parsing; command routing; output formatting |
| `auth/setup.ts` | PKCE verifier/challenge generation; code challenge is valid base64url SHA-256 |

### Integration Tests (manual, with real Azure AD app)

- Full auth flow: setup → authenticate → verify tokens stored
- Token refresh: force expiry → next API call refreshes
- Each tool: create → read → update → delete cycle for lists, tasks, checklist items
- Error handling: invalid list ID, expired/revoked tokens, network errors

### What NOT to test
- Microsoft Graph API behavior itself (they own that)
- MCP SDK internals (`McpServer`, `StdioServerTransport`)
- HTTPS/TLS behavior

## Definition of Done

- [ ] `npm run build` succeeds with zero errors
- [ ] `npm test` passes — all unit tests green
- [ ] `npm run setup` completes OAuth PKCE flow and stores encrypted tokens
- [ ] `npm start` runs CLI; `todo serve` launches MCP server on stdio
- [ ] CLI commands work for all 13 operations:
- [ ] MCP tools are registered and functional (thin wrapper over CLI core):
  ```
  todo lists / todo tasks / todo checklist — all CRUD operations
  ```
  - `list-task-lists`, `create-task-list`, `update-task-list`, `delete-task-list`
  - `list-tasks`, `create-task`, `update-task`, `delete-task`, `complete-task`
  - `list-checklist-items`, `create-checklist-item`, `update-checklist-item`, `delete-checklist-item`
- [ ] Token storage is encrypted (not plaintext JSON)
- [ ] No PII or task content in logs (grep stderr output during operation)
- [ ] No client secret anywhere in the codebase
- [ ] Only 2 runtime dependencies: `@modelcontextprotocol/sdk`, `zod`
- [ ] Scopes limited to `Tasks.ReadWrite` + `offline_access`
- [ ] README with setup instructions and MCP client config snippet (`"command": "todo", "args": ["serve"]`)
- [ ] `docs/` folder with all 6 documentation pages
- [ ] End-to-end verified: create list → create task with due date + reminder + checklist items → read back → complete → delete
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `*.enc`, `.env`
- [ ] `CHANGELOG.md` created with initial release notes
- [ ] `npm publish --access public` ready (dry-run passes)

## Versioning

- Follow [semver](https://semver.org/). Initial release is `0.1.0`.
- Maintain a `CHANGELOG.md` using [Keep a Changelog](https://keepachangelog.com/) format.
- Every version bump must update both `package.json` version and the version string in `src/mcp.ts` (`McpServer` constructor).
