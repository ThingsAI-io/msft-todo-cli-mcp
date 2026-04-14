# @thingsai/todo-mcp-server

A **CLI-first** tool for managing Microsoft To Do tasks, with an optional MCP server for AI agents.

## Install

```bash
npm install -g @thingsai/todo-mcp-server
```

## Quick Start

```bash
# 1. Set your Azure app client ID (see docs/azure-setup.md)
export TODO_MCP_CLIENT_ID="your-client-id"

# 2. Authenticate (opens browser)
todo setup

# 3. Use it
todo lists
todo tasks --list <listId>
todo tasks create --list <listId> --title "Buy milk" --due 2026-04-20
todo tasks complete --list <listId> --task <taskId>
```

## MCP Server (for AI agents)

```bash
todo serve
```

Add to VS Code `settings.json` for Copilot integration:

```json
{
  "mcp": {
    "servers": {
      "todo": {
        "command": "todo",
        "args": ["serve"],
        "env": { "TODO_MCP_CLIENT_ID": "your-client-id" }
      }
    }
  }
}
```

## Documentation

- **[Getting Started](docs/getting-started.md)** — Install, authenticate, first commands
- **[Azure Setup](docs/azure-setup.md)** — App registration via Portal or Azure CLI
- **[CLI Reference](docs/cli-reference.md)** — Full command reference with examples
- **[MCP Integration](docs/mcp-integration.md)** — VS Code, Claude Desktop, tools table
- **[Configuration](docs/configuration.md)** — Environment variables, token storage, CI setup
- **[Security](docs/security.md)** — Encryption, PKCE, scopes, design decisions

## License

MIT

