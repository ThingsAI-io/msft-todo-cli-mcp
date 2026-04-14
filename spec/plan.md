# Implementation Plan — Microsoft To Do CLI + MCP Server

## Overview

Build a CLI-first Microsoft To Do management tool with an optional MCP server wrapper. The implementation follows the spec in `spec/intent.md` exactly. The project lives in the repo root (not `system/src/todo-mcp-server/` as the spec's tree diagram suggests — adjusted since this repo *is* the project).

**Reference documents:**
- Intent/Spec: [`spec/intent.md`](intent.md)
- Security audit (jordanburke): [`spec/audits/2026-04-12-microsoft-todo-mcp-server.md`](audits/2026-04-12-microsoft-todo-mcp-server.md)
- Security audit (jhirono): [`spec/audits/2026-04-12-todomcp.md`](audits/2026-04-12-todomcp.md)

The work is broken into **8 parallelizable work units** designed for `/fleet` execution. Dependencies between units are minimal and noted below.

**Testing philosophy:** Every work unit includes comprehensive unit tests using vitest with mocked dependencies. After all WUs are implemented, a local testing guide enables manual end-to-end verification.

---

## Work Units

### WU-1: Project Scaffolding + Types
**Files:** `package.json`, `tsconfig.json`, `.gitignore` (update), `src/types.ts`
**Dependencies:** None (do this first or in parallel with nothing)

- Create `package.json` with the exact config from spec (name, bin, scripts, engines, type: module)
- Create `tsconfig.json` per spec (ES2022, Node16, strict)
- Update `.gitignore` to add `*.enc` (already has `dist`, `node_modules/`, `.env`)
- Define TypeScript interfaces in `src/types.ts`:
  - `TodoTaskList` — id, displayName, isOwner, isShared, wellknownListName
  - `TodoTask` — id, title, status, importance, isReminderOn, body, dueDateTime, reminderDateTime, startDateTime, completedDateTime, categories, createdDateTime, lastModifiedDateTime
  - `ChecklistItem` — id, displayName, isChecked, createdDateTime
  - `TokenData` — accessToken, refreshToken, expiresAt, clientId, tenant
  - `GraphDateTime` — dateTime, timeZone
  - `GraphResponse<T>` — value: T[]
- Run `npm install` to verify deps install
- Run `tsc --noEmit` to verify types compile

### WU-2: Auth — Token Store (Encrypted Persistence)
**Files:** `src/auth/token-store.ts`, `tests/token-store.test.ts`
**Dependencies:** WU-1 (needs types + package.json)

- Implement `encrypt(data: TokenData): Buffer` and `decrypt(buffer: Buffer): TokenData`
- AES-256-GCM encryption using Node.js `crypto`
- Key derivation: `PBKDF2(hostname + username, salt, 100000, 32, 'sha512')`
- Storage format: `{ salt: hex, iv: hex, tag: hex, data: hex }`
- File location: `%APPDATA%/todo-mcp/tokens.enc` (Windows) or `~/.config/todo-mcp/tokens.enc` (Linux/macOS)
- `save(tokens: TokenData): void` and `load(): TokenData | null`
- Handle missing file (return null), corrupted file (throw clear error)
- Tests (`tests/token-store.test.ts`):
  - Encrypt/decrypt round-trip preserves all TokenData fields exactly
  - Different TokenData values produce different ciphertexts
  - Decrypt with wrong key/corrupted data throws descriptive error
  - `load()` returns null when file doesn't exist
  - `save()` then `load()` round-trip via filesystem
  - Encrypted file is not plaintext (grep for token strings should fail)
  - Salt, IV, and tag are present and correct lengths in stored format

### WU-3: Auth — Token Manager + Refresh
**Files:** `src/auth/token-manager.ts`, `tests/token-manager.test.ts`
**Dependencies:** WU-1 (types), WU-2 (token-store)

- `getAccessToken(): Promise<string>` — main export
- Check env var override first (`TODO_MCP_ACCESS_TOKEN` / `TODO_MCP_REFRESH_TOKEN`)
- Load from encrypted store if no env vars
- Check expiry: if `expiresAt < Date.now() + 5 * 60 * 1000`, refresh
- Token refresh via raw `fetch()` to `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Refresh request body: `client_id`, `grant_type=refresh_token`, `refresh_token`, `scope=Tasks.ReadWrite offline_access` (NO client_secret)
- Update stored tokens on successful refresh (both access + refresh rotate)
- Mutex/promise cache to prevent concurrent refresh races
- On refresh failure: throw clear error telling user to re-run `todo setup`
- Tests (`tests/token-manager.test.ts` — mock fetch with `vi.stubGlobal`):
  - Valid non-expired cached token returns immediately without fetch
  - Expired token (expiresAt in the past) triggers refresh fetch
  - Near-expiry token (within 5-minute window) triggers refresh
  - Refresh response updates both access and refresh tokens in store
  - Env var override (`TODO_MCP_ACCESS_TOKEN`) takes priority over file
  - Env var with `TODO_MCP_REFRESH_TOKEN` enables refresh from env
  - Concurrent `getAccessToken()` calls share single refresh (mutex test)
  - Failed refresh (400/401 from token endpoint) throws with "re-run todo setup" message
  - Network error during refresh throws descriptive error
  - Refresh request body contains correct params (no client_secret!)
  - Refresh request uses correct tenant from stored token data
  - Refresh uses configurable tenant (NOT hardcoded `consumers` — jhirono audit bug)

### WU-4: Auth — Setup (OAuth PKCE Flow)
**Files:** `src/auth/setup.ts`, `tests/setup.test.ts`
**Dependencies:** WU-1 (types), WU-2 (token-store)

- PKCE generation:
  - `code_verifier`: 43-128 random URL-safe chars
  - `code_challenge`: base64url(SHA-256(code_verifier))
- Ephemeral HTTP server on port 3847 using `node:http`
- Open system browser with authorization URL (platform-detect: `start` on Windows, `open` on macOS, `xdg-open` on Linux)
- Authorization URL: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` with params: client_id, response_type=code, redirect_uri, scope, code_challenge, code_challenge_method=S256, response_mode=query
- Callback handler: extract `code` from query params
- Exchange code for tokens via POST to token endpoint (with code_verifier, NO client_secret)
- Encrypt and store tokens
- Print success + MCP config snippet
- Shut down HTTP server
- Auth callback HTML shows success message but NO token content (unlike jhirono which displays partial tokens)
- Read `clientId` and `tenant` from env vars (`TODO_MCP_CLIENT_ID`, `TODO_MCP_TENANT` defaulting to `consumers`)
- Tests (`tests/setup.test.ts`):
  - PKCE verifier is 43-128 chars, URL-safe (matches regex `[A-Za-z0-9\-._~]+`)
  - code_challenge is valid base64url (no `+`, `/`, or `=` padding)
  - code_challenge equals base64url(SHA-256(code_verifier)) — verified by recomputing
  - Multiple calls produce different verifier/challenge pairs (randomness)
  - Authorization URL contains all required params (client_id, response_type, redirect_uri, scope, code_challenge, code_challenge_method)
  - Token exchange request body contains code_verifier and no client_secret

### WU-5: Graph API Client
**Files:** `src/graph/client.ts`, `tests/graph-client.test.ts`
**Dependencies:** WU-1 (types), WU-3 (token-manager)

- `GraphClient` class or module:
  - Constructor takes a `getAccessToken` function
  - `request<T>(method, path, body?): Promise<T>` — builds URL from base `https://graph.microsoft.com/v1.0` + path
  - Sets headers: `Authorization: Bearer {token}`, `Content-Type: application/json`
  - On 401: call `getAccessToken(forceRefresh: true)` and retry once
  - Parse response: check status, return typed JSON or throw
  - Log only status codes and error types — NEVER response bodies
- Tests (`tests/graph-client.test.ts` — mock global fetch with `vi.stubGlobal`):
  - Correct URL construction: base URL + path concatenation
  - Authorization header is `Bearer {token}`
  - Content-Type is `application/json` for POST/PATCH
  - GET requests have no body
  - POST/PATCH requests serialize body to JSON
  - 200 response returns parsed JSON
  - 204 response (DELETE) returns undefined/null
  - 401 response triggers single retry with force-refreshed token
  - 401 retry that succeeds returns data normally
  - 401 retry that fails again throws (no infinite retry loop)
  - 400/403/404/500 responses throw with status code + error type
  - Verify no response body appears in any console/stderr output (spy on console)
  - Query parameters (OData) are appended correctly to URL

### WU-6: Core Operations (Task Lists + Tasks + Checklist Items)
**Files:** `src/core/task-lists.ts`, `src/core/tasks.ts`, `src/core/checklist-items.ts`, `tests/core.test.ts`
**Dependencies:** WU-1 (types), WU-5 (graph client)

**Task Lists** (`src/core/task-lists.ts`):
- `listTaskLists(client)` → GET /me/todo/lists
- `createTaskList(client, displayName)` → POST /me/todo/lists
- `updateTaskList(client, listId, displayName)` → PATCH /me/todo/lists/{listId}
- `deleteTaskList(client, listId)` → DELETE /me/todo/lists/{listId}
- Validate all IDs as non-empty strings

**Tasks** (`src/core/tasks.ts`):
- `listTasks(client, listId, options?)` → GET with $filter, $orderby, $top query params
- `createTask(client, listId, taskInput)` → POST with date/time formatting
- `updateTask(client, listId, taskId, updates)` → PATCH; empty string → null for clearing date fields
- `deleteTask(client, listId, taskId)` → DELETE
- `completeTask(client, listId, taskId)` → PATCH with `{ status: "completed" }`
- ISO 8601 → Graph API `{ dateTime, timeZone: "UTC" }` conversion
- OData query parameter construction ($filter, $orderby, $top, $select)

**Checklist Items** (`src/core/checklist-items.ts`):
- `listChecklistItems(client, listId, taskId)` → GET
- `createChecklistItem(client, listId, taskId, displayName, isChecked?)` → POST
- `updateChecklistItem(client, listId, taskId, itemId, updates)` → PATCH
- `deleteChecklistItem(client, listId, taskId, itemId)` → DELETE

- Tests (`tests/core.test.ts` — mock GraphClient):
  **Task Lists:**
  - `listTaskLists` calls GET /me/todo/lists
  - `createTaskList` sends correct body { displayName }
  - `updateTaskList` sends PATCH to correct URL with { displayName }
  - `deleteTaskList` sends DELETE to correct URL
  - Empty listId throws validation error
  - Empty displayName throws validation error

  **Tasks:**
  - `listTasks` calls correct URL with listId
  - `listTasks` with status filter builds correct $filter param
  - `listTasks` with top builds correct $top param
  - `listTasks` with combined filters builds correct query string
  - `createTask` converts ISO 8601 string to Graph dateTime object
  - `createTask` with all optional fields builds correct body
  - `createTask` with minimal fields (title only) works
  - `updateTask` sends only provided fields in PATCH body
  - `updateTask` with empty string for date fields sends null (clear pattern)
  - `deleteTask` calls DELETE with correct URL
  - `completeTask` sends `{ status: "completed" }` as PATCH
  - Empty taskId throws validation error

  **Checklist Items:**
  - `listChecklistItems` calls correct nested URL
  - `createChecklistItem` sends { displayName, isChecked }
  - `createChecklistItem` without isChecked omits it from body
  - `updateChecklistItem` sends partial update
  - `deleteChecklistItem` calls DELETE with correct URL
  - Empty checklistItemId throws validation error

### WU-7: CLI Entry Point + Output Formatting
**Files:** `src/cli.ts`, `src/format.ts`, `tests/cli.test.ts`
**Dependencies:** WU-1 (types), WU-3 (token-manager), WU-5 (graph client), WU-6 (core ops)

- Use `node:util` `parseArgs` for argument parsing (zero deps)
- Command routing:
  ```
  todo setup                              → auth setup flow
  todo serve                              → start MCP server
  todo lists                              → listTaskLists
  todo lists create <name>                → createTaskList
  todo lists update <id> <name>           → updateTaskList
  todo lists delete <id>                  → deleteTaskList
  todo tasks --list <id>                  → listTasks
  todo tasks create --list <id> --title "..." [--due ...] [--importance ...] [--body ...] [--reminder ...] [--start ...] [--status ...] [--categories ...]
  todo tasks update --list <id> --task <id> [--title ...] [--due ...] [...]
  todo tasks delete --list <id> --task <id>
  todo tasks complete --list <id> --task <id>
  todo checklist --list <id> --task <id>  → listChecklistItems
  todo checklist add --list <id> --task <id> --text "..."
  todo checklist update --list <id> --task <id> --item <id> [--text ...] [--checked]
  todo checklist delete --list <id> --task <id> --item <id>
  ```
- `src/format.ts`: Human-readable output formatting
  - Task lists: table with ID, name, flags (default, shared)
  - Tasks: status icon (✓/○), title, due date, importance, body preview
  - Checklist items: ✓/○ + name + ID
  - Structured JSON output option (`--json` flag) for programmatic use
- Hashbang line: `#!/usr/bin/env node`
- Error handling: catch errors, print user-friendly messages, exit with code 1
- Tests (`tests/cli.test.ts` — mock core functions + capture stdout):
  - `todo lists` routes to listTaskLists
  - `todo lists create "Groceries"` routes to createTaskList with correct name
  - `todo lists update <id> "New Name"` routes to updateTaskList
  - `todo lists delete <id>` routes to deleteTaskList
  - `todo tasks --list <id>` routes to listTasks
  - `todo tasks create --list <id> --title "Test"` routes to createTask with minimal args
  - `todo tasks create` with all flags (--due, --importance, --body, --reminder, --start, --status, --categories) passes all values
  - `todo tasks update --list <id> --task <id> --title "New"` routes correctly
  - `todo tasks delete --list <id> --task <id>` routes correctly
  - `todo tasks complete --list <id> --task <id>` routes to completeTask
  - `todo checklist --list <id> --task <id>` routes to listChecklistItems
  - `todo checklist add --list <id> --task <id> --text "Step"` routes to createChecklistItem
  - `todo checklist update` with --item flag routes correctly
  - `todo checklist delete` with --item flag routes correctly
  - `todo setup` invokes auth setup
  - `todo serve` invokes MCP server start
  - Unknown command prints usage/help and exits with code 1
  - Missing required flags print error and exit with code 1
  - `--json` flag produces valid JSON output
  - Output formatting: task status icons (✓ for completed, ○ for others)
  - Output formatting: due dates displayed in human-readable form
  - Output formatting: importance shown for non-normal values

### WU-8: MCP Server Module
**Files:** `src/mcp.ts`
**Dependencies:** WU-1 (types), WU-3 (token-manager), WU-5 (graph client), WU-6 (core ops)

- Export `startMcpServer(): Promise<void>` — called by `cli.ts` when `todo serve`
- Create `McpServer` from `@modelcontextprotocol/sdk`
- Register all 13 tools with Zod schemas matching the spec exactly:
  1. `list-task-lists` — no params
  2. `create-task-list` — { displayName }
  3. `update-task-list` — { listId, displayName }
  4. `delete-task-list` — { listId }
  5. `list-tasks` — { listId, status?, top? }
  6. `create-task` — { listId, title, body?, dueDateTime?, reminderDateTime?, importance?, startDateTime?, status?, categories? }
  7. `update-task` — { listId, taskId, title?, body?, dueDateTime?, reminderDateTime?, importance?, startDateTime?, status?, categories? }
  8. `delete-task` — { listId, taskId }
  9. `complete-task` — { listId, taskId }
  10. `list-checklist-items` — { listId, taskId }
  11. `create-checklist-item` — { listId, taskId, displayName, isChecked? }
  12. `update-checklist-item` — { listId, taskId, checklistItemId, displayName?, isChecked? }
  13. `delete-checklist-item` — { listId, taskId, checklistItemId }
- Each tool handler: validate input via Zod → call core function → format response
- Wire up `StdioServerTransport`
- Include To Do hierarchy explanation in tool descriptions (list → task → checklist pattern from jhirono)
- Target: ~50-100 lines
- Tests (`tests/mcp.test.ts` — test tool registration and schema validation):
  - All 13 tools are registered with correct names
  - Each tool has a Zod schema matching the spec's input schema
  - Tool descriptions mention the To Do hierarchy (list → task → checklist)
  - Tool descriptions mention the To Do hierarchy (list → task → checklist) — adopted from jhirono audit
  - `list-task-lists` tool accepts empty input
  - `create-task` tool rejects missing required fields (listId, title)
  - `update-task` tool accepts partial updates
  - `complete-task` tool requires listId and taskId
  - Tool handlers call correct core functions (mock core module)
  - Tool responses are formatted as text content for MCP

---

## Dependency Graph

```
WU-1 (Scaffolding + Types)
 ├── WU-2 (Token Store)
 │    ├── WU-3 (Token Manager)  ← also depends on WU-1
 │    └── WU-4 (Auth Setup)     ← also depends on WU-1
 ├── WU-5 (Graph Client)        ← also depends on WU-3
 │    └── WU-6 (Core Ops)       ← also depends on WU-1
 │         ├── WU-7 (CLI)       ← also depends on WU-3, WU-5
 │         └── WU-8 (MCP)       ← also depends on WU-3, WU-5
 └── (README update at end)
```

**Parallelization strategy for `/fleet`:**
- **Wave 1:** WU-1 (must go first — creates package.json, installs deps, creates types)
- **Wave 2:** WU-2, WU-4 (partial — PKCE generation + setup logic without token-store integration), WU-5 (partial — can write the client, depends on WU-3 interface)
- **Wave 3:** WU-3, WU-6
- **Wave 4:** WU-7, WU-8 (these can run in parallel with each other)

However, for `/fleet` where agents get full context: **all 8 WUs can be dispatched simultaneously** if each agent is given the full spec and told which files to create. Agents producing dependent files just need to agree on interfaces, which the spec already defines precisely.

---

## Security Checklist (from spec + audit findings)

Every agent must follow these — derived from `spec/intent.md` anti-patterns and the security audits in `spec/audits/`:

**From jordanburke audit (`spec/audits/2026-04-12-microsoft-todo-mcp-server.md`):**
- [ ] No client secret anywhere — public client with PKCE (jordanburke stores clientSecret in tokens.json)
- [ ] No `piiLoggingEnabled: true` — both audited solutions enable it
- [ ] Never auto-modify external app configs (jordanburke writes to Claude Desktop config)
- [ ] No debug/exploration tools (jordanburke ships `test-graph-api-exploration`)
- [ ] No response body logging — both audited solutions log first 200 chars of responses to stderr
- [ ] Only 2 scopes — both audited solutions request 8 including `.Shared` scopes

**From jhirono audit (`spec/audits/2026-04-12-todomcp.md`):**
- [ ] Token refresh must use configurable tenant, not hardcoded `consumers` (jhirono bug)
- [ ] No `/silentLogin` or client credentials flow — unnecessary attack surface
- [ ] No dead dependencies — jhirono has `express-rate-limit` and `pkce-challenge` imported but never used
- [ ] No partial token display in auth callback HTML
- [ ] No MSAL — use raw fetch + PKCE (avoids both jhirono's v1 EOL issue and jordanburke's 500KB dependency)

**Patterns to adopt (from audits):**
- [ ] Personal account detection: warn about `MailboxNotEnabledForRESTAPI` proactively (jhirono pattern)
- [ ] OData query parameters: `$filter`, `$select`, `$orderby`, `$top`, `$skip` on task listing (jhirono pattern)
- [ ] Tool descriptions: explain To Do hierarchy (list → task → checklist) in each tool description (jhirono pattern)
- [ ] Empty-string-to-null: clearing date fields via empty string in update-task (jhirono pattern)

**Core security requirements:**
- [ ] AES-256-GCM for token storage, never plaintext JSON
- [ ] Zero PII logging — never log user identifiers, task content, or token values
- [ ] No telemetry, no phone-home
- [ ] All inputs validated via Zod schemas
- [ ] URL construction: validate IDs are non-empty strings, no template literal injection
- [ ] Token refresh mutex — no concurrent refresh races
- [ ] Localhost auth server is ephemeral — starts only for setup, shuts down immediately
- [ ] Auth callback page shows NO token content (unlike jhirono which displays partial tokens)

---

## Post-Implementation

After all WUs complete:
1. Run `npm run build` — verify zero errors
2. Run `npm test` — verify all tests pass
3. Update `README.md` with setup instructions, CLI usage, MCP config snippet
4. Update `.gitignore` if needed
5. Manual smoke test with real Azure AD app

---

## Local Testing Guide

### Automated Tests (run anytime, no Azure account needed)

```bash
# Install dependencies
npm install

# Run all unit tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npx vitest run --coverage

# Type-check without building
npm run typecheck

# Build the project
npm run build
```

### Manual Local Testing (requires Azure AD app registration)

#### Prerequisites
1. Create an Azure AD app registration (see README or spec/intent.md § Authentication Flow)
2. Set environment variables:
   ```bash
   export TODO_MCP_CLIENT_ID="your-azure-app-client-id"
   export TODO_MCP_TENANT="consumers"  # or "common" for org+personal
   ```

#### Step 1: Run OAuth Setup
```bash
# Interactive setup — opens browser for Microsoft login
npm run setup
# Or after building:
node dist/cli.js setup
```
This opens your browser, you log in, and tokens are encrypted and stored locally.

#### Step 2: Test CLI Commands
```bash
# List all task lists
npx tsx src/cli.ts lists

# Create a test list
npx tsx src/cli.ts lists create "Test List"

# Create a task (use the list ID from above)
npx tsx src/cli.ts tasks create --list <listId> --title "Test task" --due 2026-04-20 --importance high

# List tasks in that list
npx tsx src/cli.ts tasks --list <listId>

# Add a checklist item
npx tsx src/cli.ts checklist add --list <listId> --task <taskId> --text "Sub-step 1"

# Complete the task
npx tsx src/cli.ts tasks complete --list <listId> --task <taskId>

# JSON output for programmatic use
npx tsx src/cli.ts lists --json

# Clean up: delete the test list
npx tsx src/cli.ts lists delete <listId>
```

#### Step 3: Test MCP Server
```bash
# Start the MCP server on stdio (for piping JSON-RPC messages)
npx tsx src/cli.ts serve

# Quick smoke test — send an initialize request:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx tsx src/cli.ts serve
```

#### Step 4: Test in VS Code (MCP client)
Add to your VS Code `settings.json`:
```json
{
  "mcp": {
    "servers": {
      "todo": {
        "command": "node",
        "args": ["<path-to-repo>/dist/cli.js", "serve"],
        "env": {
          "TODO_MCP_CLIENT_ID": "your-client-id"
        }
      }
    }
  }
}
```
Then use Copilot Chat to invoke tools like "list my todo lists" or "create a task called 'Buy groceries' in my Tasks list".

#### Step 5: Test Token Refresh
```bash
# Force token expiry by waiting (tokens expire in ~1 hour) or by
# manually editing the encrypted store's expiresAt to a past timestamp.
# Then run any CLI command — it should silently refresh and succeed.
npx tsx src/cli.ts lists
```

#### Step 6: Test Environment Variable Override
```bash
# Bypass encrypted store entirely (useful for CI/headless)
export TODO_MCP_ACCESS_TOKEN="your-valid-access-token"
npx tsx src/cli.ts lists
```

### Full End-to-End Verification Checklist

- [ ] `npm run build` succeeds with zero errors
- [ ] `npm test` — all unit tests pass
- [ ] `todo setup` completes OAuth flow and stores encrypted tokens
- [ ] Encrypted file exists at expected path and is NOT plaintext
- [ ] `todo lists` returns your task lists
- [ ] `todo lists create "E2E Test"` creates a list
- [ ] `todo tasks create --list <id> --title "E2E Task" --due 2026-04-20 --importance high --body "notes"` creates a task
- [ ] `todo checklist add --list <id> --task <id> --text "Step 1"` adds a checklist item
- [ ] `todo tasks --list <id>` shows the task with ○ icon, due date, importance
- [ ] `todo tasks complete --list <id> --task <id>` marks it done
- [ ] `todo tasks --list <id>` shows ✓ icon
- [ ] `todo lists delete <id>` cleans up
- [ ] `todo serve` starts MCP server (responds to JSON-RPC initialize)
- [ ] No PII or task content in stderr output during any operation
- [ ] Token refresh works (command succeeds after token expiry)
