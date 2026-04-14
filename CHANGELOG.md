# Changelog

All notable changes to this project will be documented in this file.

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

**MCP Server** (13 tools)
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
- 106 unit tests across 7 test files (vitest)

**Documentation**
- Getting started guide
- Azure app registration (Portal + Azure CLI)
- CLI reference
- MCP integration guide (VS Code, Claude Desktop)
- Configuration reference
- Security model documentation
