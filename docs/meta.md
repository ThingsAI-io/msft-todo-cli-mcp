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

- **115 unit tests** across 7 test files
- **2 runtime dependencies** (`@modelcontextprotocol/sdk`, `zod`)
- **15 MCP tools** + full CLI
- **19.2 kB** packed npm package
- **23 sub-agents** used total (7 code + 1 README + 6 docs + 5 audit + 3 implementation + 1 test fix)

### Agent Timing

| Phase | Agents | Wall-Clock Time | Notes |
|-------|--------|----------------|-------|
| Planning | 0 (inline) | ~5 min | Spec analysis, plan creation, 3 revision rounds |
| Implementation | 7 parallel | ~8 min | All agents ran concurrently; longest was MCP server (~8.5 min) |
| Packaging + README | 0 (inline) | ~1 min | package.json updates, npm link, README |
| Documentation | 6 parallel | ~1.5 min | All doc agents ran concurrently; longest was security (~1.2 min) |
| **Total** | **14** (incl. inline) | **~16 min** | From first prompt to fully documented, tested, and packaged |

*Note: Token usage per phase was not captured by the session telemetry. Wall-clock times are approximate, measured from agent dispatch to last agent completion.*

## Phase 4: Spec Feedback Loop

After testing the initial release, several gaps were discovered that required follow-up prompts — things the spec should have specified upfront but didn't. Rather than just fixing the code, we retroactively amended `spec/intent.md` to make it self-sufficient, so that the same spec could regenerate the full project without additional human guidance.

**Gaps identified and backported to `intent.md`:**

| Gap | What was missing | Where added in spec |
|-----|-----------------|-------------------|
| Auto-auth in MCP serve | `todo serve` and `todo setup` were decoupled — MCP users had to run setup separately in a terminal without the env vars | OAuth Flow section |
| `--client-id` CLI flag | Only env vars for passing client ID; terminal users had to `export` before running setup | CLI entry point commands |
| Azure AD app creation | Spec assumed a client ID exists but never explained how to get one | New section after Token Storage |
| npm packaging | No scoped package name, publish config, or `files` array | `package.json` essentials |
| Documentation structure | Spec said "README" but not a `docs/` folder with dedicated guides | Implementation Order |
| Versioning & CHANGELOG | No mention of semver, changelog format, or version sync between `package.json` and `mcp.ts` | New section after Definition of Done |

This "push-back-to-spec" cycle is a useful pattern: build from the spec, discover what's missing during real usage, then amend the spec so future builds from it are complete. The spec becomes a living document that improves with each implementation pass.

## Phase 5: Security Audit & DX Improvements (v0.2.0)

A full security audit and developer experience evaluation was conducted using fleet mode — 5 parallel audit agents followed by 8 parallel implementation agents.

### Audit Phase

Five specialized agents audited different aspects of the codebase simultaneously:

| Agent | Focus Area | Key Findings |
|-------|-----------|-------------|
| Auth Security | OAuth flow, token storage | Missing CSRF state param, no file permissions on token file |
| Graph API Client | HTTP client hardening | No redirect policy (Bearer token leak risk), no rate-limit handling, unstructured errors |
| CLI/MCP Input Handling | Input validation, output safety | No ID validation (path traversal risk), no OData injection protection, no terminal escape sanitization |
| Dependencies & Config | Build config, gitignore | Source maps published to npm, no key file patterns in .gitignore |
| DX Evaluation | AI developer experience | Missing `.describe()` on MCP params, no single-item get tools, no structured error responses, no `--version` |

Result: 5 Medium, 7 Low, 3 Informational findings. DX score: B+ (good foundation, missing polish for AI consumers).

### Implementation Phase

Fixes were applied in 3 dependency-ordered waves using parallel agents:

**Wave 1** (5 agents, independent files): Graph client hardening, core ID validation, format sanitization, auth hardening, config fixes

**Wave 2** (2 agents, depends on Wave 1): MCP DX improvements (15 tools, `.describe()`, structured errors, filter/orderby), CLI DX (strict parsing, `--version`, enum validation, `--unchecked`)

**Wave 3** (1 agent): Test updates — fixed all broken tests, added new coverage. 106 → 115 tests.

### Retrospective Spec Update

After implementation, `spec/intent.md` was retroactively updated with the security and DX requirements that a PM would have specified upfront — expressed as principles and guardrails rather than implementation details. This follows the same push-back-to-spec pattern from Phase 4.

### Updated Stats

- **115 unit tests** across 7 test files (was 106)
- **15 MCP tools** + full CLI (was 13)
- **23 sub-agents** used total across all phases (was 14)
- **v0.2.0** released with all security and DX improvements

