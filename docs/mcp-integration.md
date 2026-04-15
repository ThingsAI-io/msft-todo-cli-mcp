# MCP Server Integration

## Overview

The `todo serve` command starts an MCP (Model Context Protocol) server on stdio. This allows AI agents like GitHub Copilot, Claude, and others to manage your Microsoft To Do tasks directly.

Microsoft To Do organizes items as: **Task Lists → Tasks → Checklist Items** (sub-steps).

## Starting the Server

```bash
todo serve
```

## Client Configuration

### VS Code / GitHub Copilot

Add to `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "todo": {
        "command": "todo",
        "args": ["serve"],
        "env": {
          "TODO_MCP_CLIENT_ID": "your-client-id"
        }
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "todo": {
      "command": "todo",
      "args": ["serve"],
      "env": {
        "TODO_MCP_CLIENT_ID": "your-client-id"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP client that supports stdio transport can use this server. The command is `todo serve`.

## Available Tools

The server exposes 15 tools across three categories.

| # | Tool | Description | Parameters |
|---|------|-------------|------------|
| 1 | `list-task-lists` | List all task lists | _(none)_ |
| 2 | `get-task-list` | Get a single task list by ID | `listId` (string, **required**) |
| 3 | `create-task-list` | Create a new task list | `displayName` (string, **required**) |
| 4 | `update-task-list` | Update a task list's name | `listId` (string, **required**), `displayName` (string, **required**) |
| 5 | `delete-task-list` | Delete a task list | `listId` (string, **required**) |
| 6 | `list-tasks` | List tasks in a task list | `listId` (string, **required**), `status` (enum, optional), `top` (number, optional, default: 100), `filter` (string, optional — OData $filter expression), `orderby` (string, optional — OData $orderby expression) |
| 7 | `get-task` | Get a single task by ID | `listId` (string, **required**), `taskId` (string, **required**) |
| 8 | `create-task` | Create a new task | `listId` (string, **required**), `title` (string, **required**), `body` (string, optional), `dueDateTime` (string, optional), `reminderDateTime` (string, optional), `importance` (enum, optional), `startDateTime` (string, optional), `status` (enum, optional), `categories` (string[], optional) |
| 9 | `update-task` | Update an existing task | `listId` (string, **required**), `taskId` (string, **required**), `title` (string, optional), `body` (string, optional), `dueDateTime` (string, optional), `reminderDateTime` (string, optional), `importance` (enum, optional), `startDateTime` (string, optional), `status` (enum, optional), `categories` (string[], optional) |
| 10 | `delete-task` | Delete a task | `listId` (string, **required**), `taskId` (string, **required**) |
| 11 | `complete-task` | Mark a task as completed | `listId` (string, **required**), `taskId` (string, **required**) |
| 12 | `list-checklist-items` | List checklist items (sub-steps) of a task | `listId` (string, **required**), `taskId` (string, **required**) |
| 13 | `create-checklist-item` | Create a checklist item (sub-step) on a task | `listId` (string, **required**), `taskId` (string, **required**), `displayName` (string, **required**), `isChecked` (boolean, optional) |
| 14 | `update-checklist-item` | Update a checklist item (sub-step) | `listId` (string, **required**), `taskId` (string, **required**), `checklistItemId` (string, **required**), `displayName` (string, optional), `isChecked` (boolean, optional) |
| 15 | `delete-checklist-item` | Delete a checklist item (sub-step) | `listId` (string, **required**), `taskId` (string, **required**), `checklistItemId` (string, **required**) |

### Enum Values

- **status**: `notStarted`, `inProgress`, `completed`, `waitingOnOthers`, `deferred`
- **importance**: `low`, `normal`, `high`

### Notes

- Date fields (`dueDateTime`, `reminderDateTime`, `startDateTime`) accept ISO 8601 date strings.
- When updating a task, pass an empty string for a date field to clear it.
- All parameters include descriptive annotations for improved LLM tool-calling accuracy.
- The `list-tasks` tool supports OData `$filter` and `$orderby` expressions for advanced querying (e.g., `filter: "contains(title, 'milk')"`, `orderby: "dueDateTime/dateTime asc"`).
- Results from `list-tasks` default to 100 items. Use the `top` parameter to adjust.

### Task List Tools

Tools 1–5 manage task lists (containers for tasks).

### Task Tools

Tools 6–11 manage tasks within a task list. Use `list-task-lists` first to obtain a `listId`.

### Checklist Item Tools

Tools 12–15 manage checklist items (sub-steps) within a task. You need both a `listId` and a `taskId`.

### Error Responses

When a Graph API error occurs, MCP tools return structured JSON error details:

```json
{
  "error": true,
  "statusCode": 404,
  "code": "ErrorItemNotFound",
  "message": "Graph API error 404: ErrorItemNotFound - The specified object was not found in the store.",
  "retryable": false
}
```

The `retryable` field indicates whether the error is transient (429 rate limit or 5xx server error) and safe to retry.

## Example Agent Conversations

Here are example prompts you might give an AI agent connected to this MCP server:

> **"List my todo lists and show me what's due this week"**
>
> The agent will call `list-task-lists`, then `list-tasks` for each list filtering by status, and present tasks with upcoming due dates.

> **"Create a task called 'Prepare presentation' in my Work list with high importance, due Friday, with checklist items: outline slides, add data charts, rehearse"**
>
> The agent will call `list-task-lists` to find the Work list's ID, then `create-task` with the title, importance, and due date, followed by three `create-checklist-item` calls for each sub-step.

> **"Mark all completed tasks in my Groceries list"**
>
> The agent will call `list-task-lists` to find the Groceries list, then `list-tasks` to get all non-completed tasks, and call `complete-task` for each one.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Authentication expired" | Re-run `todo setup` to refresh your credentials. |
| Server not responding | Check that the `TODO_MCP_CLIENT_ID` environment variable is set in your client configuration. |
| Permission errors | Verify your Azure app registration has the **Tasks.ReadWrite** permission. |
| Command not found | Make sure `@thingsai/todo-mcp-server` is installed globally (`npm i -g @thingsai/todo-mcp-server`). |
