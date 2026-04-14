# Configuration

Configuration reference for `@thingsai/todo-mcp-server`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TODO_MCP_CLIENT_ID` | Yes (for setup) | — | Azure AD Application (client) ID from your app registration |
| `TODO_MCP_TENANT` | No | `consumers` | Azure AD tenant. Options: `consumers` (personal accounts), `common` (personal + org), or a specific tenant ID |
| `TODO_MCP_ACCESS_TOKEN` | No | — | Use this access token directly, bypassing encrypted store. For CI/headless. |
| `TODO_MCP_REFRESH_TOKEN` | No | — | Used alongside `TODO_MCP_ACCESS_TOKEN` for token refresh in CI/headless scenarios |

## Token Storage

Tokens are encrypted at rest using AES-256-GCM with a machine-derived key.

### Storage Locations

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\todo-mcp\tokens.enc` |
| macOS | `~/.config/todo-mcp/tokens.enc` |
| Linux | `~/.config/todo-mcp/tokens.enc` |

### Encryption Details

- **Algorithm:** AES-256-GCM
- **Key derivation:** PBKDF2 with SHA-512 (100,000 iterations)
- **Key material:** machine hostname + OS username + random salt
- **Each encryption generates a fresh random IV and salt**

### Re-authenticating

To re-authenticate (e.g., after token expiry or revocation):

```bash
todo setup
```

This overwrites the existing encrypted token file.

## Tenant Configuration

The `TODO_MCP_TENANT` environment variable controls which Azure AD tenant is used for authentication. There are three options:

### Personal Microsoft Accounts (default)

```bash
export TODO_MCP_TENANT="consumers"
```

Use this for personal Microsoft accounts such as @outlook.com, @hotmail.com, and @live.com. This is the default when `TODO_MCP_TENANT` is not set.

### Personal + Organizational Accounts

```bash
export TODO_MCP_TENANT="common"
```

Use this to allow sign-in from both personal Microsoft accounts and work/school (Azure AD) accounts.

### Specific Organization

```bash
export TODO_MCP_TENANT="your-tenant-id-or-domain"
```

Use this to restrict authentication to a specific Azure AD organization. Replace the value with your organization's tenant ID (a UUID) or verified domain name.

## CI / Headless Setup

For environments where interactive browser authentication isn't possible:

1. Authenticate on a local machine first:
   ```bash
   todo setup
   ```
2. Extract tokens (or obtain them via API).
3. Set environment variables in your CI:
   ```bash
   export TODO_MCP_ACCESS_TOKEN="eyJ..."
   export TODO_MCP_REFRESH_TOKEN="0.A..."
   export TODO_MCP_CLIENT_ID="your-client-id"
   export TODO_MCP_TENANT="consumers"
   ```

When environment variables are set, the encrypted token store is bypassed entirely.

## Shell Configuration

For persistent setup, add the following to your shell profile:

### Bash / Zsh

```bash
# ~/.bashrc or ~/.zshrc
export TODO_MCP_CLIENT_ID="your-client-id"
```

### PowerShell

```powershell
# $PROFILE
$env:TODO_MCP_CLIENT_ID = "your-client-id"
```

### Fish

```fish
# ~/.config/fish/config.fish
set -gx TODO_MCP_CLIENT_ID "your-client-id"
```
