# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0]

### Security

- **ID validation**: All Graph API resource IDs are validated against `/^[A-Za-z0-9_=\-]+$/` before URL interpolation, preventing path traversal attacks
- **OData injection protection**: CLI `--status` and `--importance` flags validated against allowed enum values before interpolation into OData filter expressions
- **Terminal escape sanitization**: ANSI escape sequences and control characters stripped from task titles, list names, and body content before terminal rendering
- **OAuth CSRF protection**: Authorization requests now include a cryptographic `state` parameter verified on callback
- **Token file permissions**: Token file written with mode `0o600` and directory with `0o700` on POSIX systems (owner-only access)
- **Redirect policy**: HTTP fetch uses `redirect: 'error'` to prevent Bearer token leaking via redirects
- **Rate-limit handling**: Automatic retry on HTTP 429 with `Retry-After` header support and exponential backoff (max 3 retries)
- **Safe error parsing**: Token exchange errors are parsed as JSON, exposing only `error` and `error_description` fields instead of raw response bodies
- **Source maps disabled**: `tsconfig.json` no longer generates source maps, preventing TypeScript source from being published to npm
- **Gitignore hardening**: Added `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt` patterns
- **Default pagination**: `list-tasks` defaults to `$top=100` to prevent unbounded list operations
- **Strict CLI parsing**: All `parseArgs` calls use `strict: true`, rejecting unknown flags

### Added

- **`get-task` MCP tool**: Fetch a single task by ID — essential for confirming state after mutations
- **`get-task-list` MCP tool**: Fetch a single task list by ID
- **Parameter descriptions**: All MCP tool parameters now include `.describe()` annotations for better LLM accuracy
- **Structured error responses**: `GraphApiError` class with `statusCode`, `errorCode`, `isRetryable`, `isNotFound`, `isAuthError` properties; MCP returns structured JSON error details
- **OData filtering in MCP**: `list-tasks` tool now exposes `filter` and `orderby` parameters for advanced querying
- **`--version` / `version` command**: Print the current version number
- **`--unchecked` flag**: Checklist items can now be unchecked via `todo checklist update --unchecked`
- **`--status` filtering on list**: `todo tasks --list <id> --status completed` filters tasks by status
- **Enum validation**: `--status` and `--importance` CLI flags validated with clear error messages listing valid values
- **`validateId` utility**: Exported from `types.ts` for use by consumers
- **`VALID_STATUSES` / `VALID_IMPORTANCES` arrays**: Exported from `types.ts`

### Changed

- **MCP tool count**: 13 → 15 tools
- **Error class**: Graph API errors now throw `GraphApiError` (extends `Error`) instead of plain `Error` — existing `.message` format unchanged for backward compatibility
- **Test count**: 106 → 115 tests across 7 test files

## [0.1.1] — 2026-04-14

### Added

- **Auto-authentication in MCP serve**: When `todo serve` detects no stored tokens and `TODO_MCP_CLIENT_ID` is set in the environment, it automatically initiates the OAuth PKCE browser flow. Output goes to stderr to keep the MCP stdio transport clean. First tool call handles everything — no separate setup step needed.
- **`--client-id` and `--tenant` flags for `todo setup`**: CLI users can now run `todo setup --client-id <id>` instead of setting environment variables.

## [0.1.0] — 2026-04-14

Initial release. Full implementation from spec (`spec/intent.md`).

### Added

**CLI** (`todo` command)
- `todo setup` — interactive OAuth 2.0 PKCE authentication flow
- `todo serve` — start MCP server on stdio
- `todo lists` — list, create, update, delete task lists
- `todo tasks` — list, create, update, delete, complete tasks
- `todo checklist` — list, add, update, delete checklist items (sub-steps)
- `--json` flag for machine-readable output on all read commands
- `todo help` — usage reference

**MCP Server** (15 tools)
- `list-task-lists`, `create-task-list`, `update-task-list`, `delete-task-list`
- `list-tasks`, `create-task`, `update-task`, `delete-task`, `complete-task`
- `list-checklist-items`, `create-checklist-item`, `update-checklist-item`, `delete-checklist-item`

**Authentication**
- OAuth 2.0 Authorization Code with PKCE (public client — no client secret)
- AES-256-GCM encrypted token storage with PBKDF2 key derivation
- Automatic token refresh with mutex to prevent concurrent refresh races
- Environment variable override for CI/headless (`TODO_MCP_ACCESS_TOKEN`, `TODO_MCP_REFRESH_TOKEN`)

**Security**
- No client secret anywhere in the codebase
- Encrypted token persistence — never plaintext
- Minimal scopes: `Tasks.ReadWrite` + `offline_access` only
- No PII logging, no response body logging, no telemetry
- 2 runtime dependencies only (`@modelcontextprotocol/sdk`, `zod`)

**Tests**
- 115 unit tests across 7 test files (vitest)

**Documentation**
- Getting started guide
- Azure app registration (Portal + Azure CLI)
- CLI reference
- MCP integration guide (VS Code, Claude Desktop)
- Configuration reference
- Security model documentation
