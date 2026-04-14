# Getting Started

A 5-minute quickstart for `@thingsai/todo-mcp-server` — a CLI-first Microsoft To Do management tool with an optional MCP server for AI agents.

## Prerequisites

- **Node.js 20+** — [download here](https://nodejs.org/)
- **A Microsoft account** (personal or work/school)
- **An Azure AD app registration** — see [Azure Setup](azure-setup.md) for step-by-step instructions

## Install

```bash
npm install -g @thingsai/todo-mcp-server
```

Verify the installation:

```bash
todo --version
```

## Authenticate

Set your Azure AD client ID and run the interactive setup. A browser window will open for Microsoft login.

```bash
export TODO_MCP_CLIENT_ID="your-client-id"
todo setup
```

> Don't have a client ID yet? Follow the [Azure Setup](azure-setup.md) guide to create one.

## Your First Commands

Once authenticated, you're ready to manage your tasks:

```bash
# List all your To Do lists
todo lists

# View tasks in a specific list
todo tasks --list <list-id>

# Create a new task with a due date
todo tasks create --list <list-id> --title "Test task" --due 2026-04-20

# Mark a task as complete
todo tasks complete --list <list-id> --task <task-id>

# Get JSON output (useful for scripting and automation)
todo lists --json
```

> **Tip:** Use `todo lists` first to find the `<list-id>` you need, then pass it to other commands.

## Next Steps

- [Full CLI Reference](cli-reference.md) — all commands and options
- [MCP Server Setup](mcp-integration.md) — connect to AI agents via Model Context Protocol
- [Azure Setup](azure-setup.md) — register an Azure AD app if you haven't already
- [Configuration](configuration.md) — environment variables and advanced options
