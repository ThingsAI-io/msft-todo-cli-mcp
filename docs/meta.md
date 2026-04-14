# Project Meta — How This Was Built

This document captures how `@thingsai/todo-mcp-server` was created, from spec to working code, using GitHub Copilot CLI in a single session.

## Input Files

The project started with two types of input files, all written before any code existed:

### `spec/intent.md` (~830 lines)

The full implementation spec, written by the project author. Covers:

- **Purpose and motivation** — why CLI-first, key use cases
- **Anti-patterns** — 8 specific issues found in existing solutions to avoid
- **Existing solutions comparison** — feature/security matrix of jhirono/todomcp and jordanburke/microsoft-todo-mcp-server
- **Architecture** — dual CLI + MCP interface, OAuth PKCE flow, token storage, project structure
- **Microsoft Graph API reference** — endpoints, shapes, OData query support
- **MCP tool definitions** — all 13 tools with input schemas and Graph API mappings
- **Authentication flow** — Azure AD registration, PKCE step-by-step, token refresh, secure persistence
- **Security requirements** — 12 hard requirements
- **Project setup** — package.json, tsconfig.json, dependencies (2 runtime, 4 dev)
- **Implementation order** — 13-step build sequence
- **Testing strategy** — what to test, what not to test
- **Definition of done** — acceptance criteria checklist

### `spec/audits/` (2 files)

Security audits of two existing Microsoft To Do MCP servers, conducted before writing the spec:

- **`2026-04-12-microsoft-todo-mcp-server.md`** — Audit of [jordanburke/microsoft-todo-mcp-server](https://github.com/jordanburke/microsoft-todo-mcp-server). Found: plaintext token storage (including client secret), PII logging enabled, auto-modifies Claude Desktop config, debug tool in production, overly broad scopes.
- **`2026-04-12-todomcp.md`** — Audit of [jhirono/todomcp](https://github.com/jhirono/todomcp). Found: hardcoded tenant in refresh (breaks org accounts), partial token display in browser, 82 spurious direct dependencies, MSAL v1 (EOL), `/silentLogin` endpoint. Also identified good patterns to adopt: personal account detection, OData query params, tool description quality, empty-string-to-null for clearing date fields.

These audits directly informed the spec's anti-patterns list and security requirements.

## Build Process

The entire project was built in a single Copilot CLI session using fleet mode (parallel sub-agents). The process had three phases:

### Phase 1: Planning

The spec and audits were analyzed to produce an implementation plan (`spec/plan.md`) decomposed into 8 parallelizable work units. The plan included:

- Dependency graph between work units
- Comprehensive test specifications for each unit (106 tests planned)
- Security checklist derived from both audit findings
- Local testing guide for manual verification

### Phase 2: Implementation (Fleet Execution)

Project scaffolding (package.json, tsconfig.json, types) was done first, then 7 agents were dispatched in parallel:

| Agent | Work Unit | Files Created | Tests |
|-------|-----------|--------------|-------|
| Token Store | Encrypted token persistence | `src/auth/token-store.ts` | 11 |
| Token Manager | Token loading + refresh + mutex | `src/auth/token-manager.ts` | 12 |
| Auth Setup | OAuth PKCE setup flow | `src/auth/setup.ts` | 7 |
| Graph Client | Graph API fetch wrapper | `src/graph/client.ts` | 19 |
| Core Ops | Task lists, tasks, checklist CRUD | `src/core/*.ts` (3 files) | 27 |
| CLI | CLI entry point + formatting | `src/cli.ts`, `src/format.ts` | 22 |
| MCP Server | MCP server with 13 tools | `src/mcp.ts` | 8 |

All 7 agents completed successfully. 106 tests passing, TypeScript clean, build clean.

### Phase 3: Polish

After the core implementation, additional passes covered:

- **npm packaging** — scoped to `@thingsai/todo-mcp-server`, configured for publishing
- **README** — concise intro with install, quick start, MCP config, and links to docs
- **Documentation** — 6 doc pages created in parallel by dedicated agents:
  - Getting started, Azure setup (Portal + CLI), CLI reference, MCP integration, configuration, security
- **Local installation** — `npm link` for global `todo` command access

## Final Project Structure

```
├── src/
│   ├── cli.ts                    # CLI entry point (hashbang, parseArgs, routing)
│   ├── mcp.ts                    # MCP server (13 tools, ~140 lines)
│   ├── format.ts                 # Output formatting (human-readable + JSON)
│   ├── types.ts                  # TypeScript interfaces
│   ├── auth/
│   │   ├── setup.ts              # OAuth PKCE interactive flow
│   │   ├── token-manager.ts      # Token loading, refresh, mutex
│   │   └── token-store.ts        # AES-256-GCM encrypted persistence
│   ├── core/
│   │   ├── task-lists.ts         # Task list CRUD
│   │   ├── tasks.ts              # Task CRUD + complete
│   │   └── checklist-items.ts    # Checklist item CRUD
│   └── graph/
│       └── client.ts             # Graph API fetch wrapper with 401 retry
├── tests/
│   ├── token-store.test.ts       # 11 tests
│   ├── token-manager.test.ts     # 12 tests
│   ├── setup.test.ts             # 7 tests
│   ├── graph-client.test.ts      # 19 tests
│   ├── core.test.ts              # 27 tests
│   ├── cli.test.ts               # 22 tests
│   └── mcp.test.ts               # 8 tests
├── docs/
│   ├── getting-started.md
│   ├── azure-setup.md
│   ├── cli-reference.md
│   ├── mcp-integration.md
│   ├── configuration.md
│   ├── security.md
│   └── meta.md                   # This file
├── spec/
│   ├── intent.md                 # Full implementation spec
│   ├── plan.md                   # Implementation plan (generated)
│   └── audits/
│       ├── 2026-04-12-microsoft-todo-mcp-server.md
│       └── 2026-04-12-todomcp.md
├── package.json
├── tsconfig.json
└── README.md
```

## Stats

- **106 unit tests** across 7 test files
- **2 runtime dependencies** (`@modelcontextprotocol/sdk`, `zod`)
- **13 MCP tools** + full CLI
- **19.2 kB** packed npm package
- **14 sub-agents** used total (7 code + 1 README + 6 docs)

### Agent Timing

| Phase | Agents | Wall-Clock Time | Notes |
|-------|--------|----------------|-------|
| Planning | 0 (inline) | ~5 min | Spec analysis, plan creation, 3 revision rounds |
| Implementation | 7 parallel | ~8 min | All agents ran concurrently; longest was MCP server (~8.5 min) |
| Packaging + README | 0 (inline) | ~1 min | package.json updates, npm link, README |
| Documentation | 6 parallel | ~1.5 min | All doc agents ran concurrently; longest was security (~1.2 min) |
| **Total** | **14** (incl. inline) | **~16 min** | From first prompt to fully documented, tested, and packaged |

*Note: Token usage per phase was not captured by the session telemetry. Wall-clock times are approximate, measured from agent dispatch to last agent completion.*
