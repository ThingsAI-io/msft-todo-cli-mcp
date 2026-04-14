# Security

## Overview

This tool was designed with security as a first-class concern, informed by auditing two existing Microsoft To Do MCP servers ([jordanburke/microsoft-todo-mcp-server](https://github.com/jordanburke/microsoft-todo-mcp-server) and [jhirono/todomcp](https://github.com/jhirono/todomcp)). Every security decision addresses a specific issue found in those implementations.

## Authentication: OAuth 2.0 PKCE

This tool authenticates using **OAuth 2.0 Authorization Code with PKCE** as a **public client** — meaning no client secret exists anywhere in the application.

**PKCE** (Proof Key for Code Exchange, [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)) prevents authorization code interception attacks. During login:

1. The client generates a random **code verifier**
2. A **code challenge** (SHA-256 hash of the verifier) is sent with the authorization request
3. The original verifier is sent with the token exchange request
4. The authorization server verifies the challenge matches — proving the same client initiated both requests

Because there is no client secret, there is **no secret to store, leak, or rotate**. The PKCE verifier/challenge pair is ephemeral and single-use.

### Why not MSAL?

Both audited implementations use `@azure/msal-node`:
- jordanburke uses MSAL v3 with `ConfidentialClientApplication` (requires a client secret)
- jhirono uses MSAL v1, which is **end-of-life**

MSAL adds ~500KB of dependencies for what amounts to two `fetch()` calls (authorize + token exchange). We use raw `fetch()` to the standard Microsoft OAuth 2.0 endpoints with PKCE parameters — the same HTTP requests MSAL would make internally, without the abstraction layer.

## Token Storage: AES-256-GCM Encryption

Tokens are encrypted at rest using authenticated encryption:

- **Algorithm**: AES-256-GCM (provides both confidentiality and integrity)
- **Key derivation**: PBKDF2 with SHA-512, 100,000 iterations
- **Key material**: `hostname + username + random salt` — binding the key to the machine and user
- **Per-encryption**: fresh random IV (12 bytes) and salt (16 bytes) for every write
- **Storage format**: JSON with `{ salt, iv, tag, data }` — all hex-encoded

### What this protects against

- **Casual file exposure** — tokens are never stored in plaintext. Opening the file reveals only hex-encoded ciphertext.
- **File-copy attacks** — the encryption key is derived from machine-specific values (hostname + username), so copying the token file to another machine won't work.
- **Tampering** — GCM's authentication tag detects any modification to the ciphertext.

This is not Fort Knox — a determined attacker with access to the same user account on the same machine could derive the key. For higher security environments, use the environment variable override to supply tokens through a secrets manager.

### Comparison with audited implementations

| | jordanburke | jhirono | This tool |
|---|---|---|---|
| Token storage | Plaintext JSON (includes client secret!) | Plaintext JSON | AES-256-GCM encrypted |
| Secret exposure | `clientSecret` in cleartext `tokens.json` | No client secret in file | No client secret exists |

## Minimal Scopes

Only two OAuth scopes are requested:

- **`Tasks.ReadWrite`** — read and write the user's tasks
- **`offline_access`** — obtain refresh tokens for persistent sessions

### What we don't request (and why)

| Scope | Requested by others | Why we skip it |
|---|---|---|
| `Tasks.Read` | Yes | Redundant — `Tasks.ReadWrite` already covers reading |
| `Tasks.Read.Shared` | Yes | Grants access to organization-shared tasks — far too broad for a personal task manager |
| `Tasks.ReadWrite.Shared` | Yes | Same — shared task access is not needed |
| `User.Read` | Yes | User profile information is not needed for task management |
| `openid` | Yes | OpenID Connect identity tokens are not needed |
| `profile` | Yes | Profile information (name, picture) is not needed |

Both audited implementations request **8 scopes**. We request **2**.

## What We Don't Do

Each decision below references the audit finding that motivated it:

1. **No client secret** — We use a public client with PKCE. No secret exists to protect. *(jordanburke stores `clientSecret` in plaintext `tokens.json`)*

2. **No PII logging** — We never log user identifiers, task content, or token values. *(Both implementations set `piiLoggingEnabled: true` in MSAL config, piping user identifiers to stdout)*

3. **No response body logging** — We only log HTTP status codes and error types, never response content. *(Both implementations log the first 200 characters of API responses, which can contain task content)*

4. **No external config modification** — We never write to Claude Desktop, VS Code, or any other application's configuration files. *(jordanburke auto-modifies `claude_desktop_config.json` without user consent)*

5. **No debug tools** — No API exploration or diagnostic tools are exposed in production. *(jordanburke ships `test-graph-api-exploration` as an MCP tool)*

6. **No telemetry** — No analytics, phone-home, or third-party endpoints. The tool contacts only Microsoft OAuth and Graph API endpoints.

7. **No token display** — The auth callback page shows only a "success" message, never token values. *(jhirono displays partial tokens in the browser callback page)*

8. **No hardcoded tenant** — The OAuth tenant (`consumers`, `common`, or an org tenant ID) is always read from configuration. *(jhirono hardcodes `consumers` in the token refresh path, breaking organizational accounts)*

## Network Endpoints

This is an exhaustive list of every endpoint this tool contacts:

| # | Endpoint | Purpose |
|---|---|---|
| 1 | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` | OAuth authorization (opened in browser) |
| 2 | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | Token exchange and refresh |
| 3 | `https://graph.microsoft.com/v1.0/me/todo/lists/...` | Microsoft Graph API (task operations) |
| 4 | `http://localhost:3847/callback` | Local-only OAuth callback (ephemeral, runs only during initial auth setup) |

**No telemetry. No analytics. No third-party endpoints.**

The localhost callback server starts only for the authentication flow and shuts down immediately after receiving the authorization code.

## Dependencies

Only **2 runtime dependencies**:

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | MCP protocol server and stdio transport |
| `zod` | Input schema validation for tool parameters |

Both are well-known, widely-used packages with active maintenance.

**What we don't depend on:**
- **No `@azure/msal-node`** — raw `fetch()` with PKCE instead
- **No `express`** — Node.js built-in `http.createServer()` for the ephemeral auth callback
- **No `dotenv`** — `process.env` directly; users configure env vars in their MCP client config or shell profile

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly via [GitHub Issues](https://github.com/ThingsAI-io/msft-todo-cli-mcp/issues) or contact the maintainers directly.
