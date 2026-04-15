# CLI Reference

Full command reference for `@thingsai/todo-mcp-server`.

## Global Flags

| Flag        | Description                                      |
| ----------- | ------------------------------------------------ |
| `--json`    | Output in JSON format (available on all read/list commands) |
| `--version` | Show the version number |

> **Note:** Unknown flags are rejected. The CLI uses strict argument parsing to prevent silent errors.

---

## Commands

### Setup & Server

#### `todo setup`

Run the interactive OAuth PKCE authentication flow to configure credentials.

```bash
todo setup
```

#### `todo serve`

Start the MCP (Model Context Protocol) server on stdio.

```bash
todo serve
```

#### `todo help`

Show usage help.

```bash
todo help
```

#### `todo version`

Show the version number.

```bash
todo version
todo --version
```

---

### Task Lists

#### `todo lists`

List all task lists.

```bash
todo lists
todo lists --json
```

#### `todo lists create <name>`

Create a new task list.

```bash
todo lists create "Groceries"
```

#### `todo lists update <listId> <name>`

Rename a task list.

```bash
todo lists update AAMkAD... "Shopping List"
```

#### `todo lists delete <listId>`

Delete a task list and all its tasks. **Irreversible.**

```bash
todo lists delete AAMkAD...
```

---

### Tasks

All task commands require the `--list <listId>` flag.

#### `todo tasks --list <listId>`

List tasks in a list.

```bash
todo tasks --list AAMkAD...
todo tasks --list AAMkAD... --json
todo tasks --list AAMkAD... --status completed
```

Use `--status` to filter by task status (`notStarted`, `inProgress`, `completed`, `waitingOnOthers`, `deferred`).

#### `todo tasks create`

Create a task.

| Flag             | Required | Description                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `--list <id>`    | Yes      | Task list ID                                                                |
| `--title <text>` | Yes      | Task title                                                                  |
| `--due <date>`   | No       | Due date (e.g. `2026-04-20`)                                                |
| `--importance`   | No       | `low`, `normal`, or `high`                                                  |
| `--body <text>`  | No       | Task body / notes                                                           |
| `--reminder`     | No       | Reminder date-time (e.g. `2026-04-20T09:00:00Z`)                            |
| `--start <date>` | No       | Start date                                                                  |
| `--status`       | No       | `notStarted`, `inProgress`, `completed`, `waitingOnOthers`, or `deferred`   |
| `--categories`   | No       | Comma-separated categories (e.g. `groceries,errands`)                       |

```bash
# Minimal
todo tasks create --list AAMkAD... --title "Buy milk"

# Full
todo tasks create --list AAMkAD... --title "Buy milk" \
  --due 2026-04-20 --importance high \
  --body "Get 2% milk from Costco" \
  --reminder "2026-04-20T09:00:00Z" \
  --categories "groceries,errands"
```

#### `todo tasks update`

Update a task. All fields except `--list` and `--task` are optional. Pass an empty string to date fields to clear them.

| Flag             | Required | Description        |
| ---------------- | -------- | ------------------ |
| `--list <id>`    | Yes      | Task list ID       |
| `--task <id>`    | Yes      | Task ID            |
| `--title`        | No       | New title          |
| `--due`          | No       | New due date       |
| `--importance`   | No       | New importance     |
| `--body`         | No       | New body text      |
| `--reminder`     | No       | New reminder       |
| `--start`        | No       | New start date     |
| `--status`       | No       | New status         |
| `--categories`   | No       | New categories     |

```bash
todo tasks update --list AAMkAD... --task AAMkAD... --title "Buy oat milk"
todo tasks update --list AAMkAD... --task AAMkAD... --due ""  # clear due date
```

#### `todo tasks complete`

Mark a task as completed.

```bash
todo tasks complete --list AAMkAD... --task AAMkAD...
```

#### `todo tasks delete`

Delete a task. **Irreversible.**

```bash
todo tasks delete --list AAMkAD... --task AAMkAD...
```

---

### Checklist Items (Sub-steps)

Checklist items are sub-steps within a task — for example, a "Weekly groceries" task might have checklist items like "Milk", "Eggs", and "Bread".

All checklist commands require `--list <listId>` and `--task <taskId>`.

#### `todo checklist --list <listId> --task <taskId>`

List checklist items for a task.

```bash
todo checklist --list AAMkAD... --task AAMkAD...
todo checklist --list AAMkAD... --task AAMkAD... --json
```

#### `todo checklist add`

Add a checklist item.

| Flag             | Required | Description        |
| ---------------- | -------- | ------------------ |
| `--list <id>`    | Yes      | Task list ID       |
| `--task <id>`    | Yes      | Task ID            |
| `--text <text>`  | Yes      | Item display text  |

```bash
todo checklist add --list AAMkAD... --task AAMkAD... --text "Check expiry date"
```

#### `todo checklist update`

Update a checklist item.

| Flag             | Required | Description                  |
| ---------------- | -------- | ---------------------------- |
| `--list <id>`    | Yes      | Task list ID                 |
| `--task <id>`    | Yes      | Task ID                      |
| `--item <id>`    | Yes      | Checklist item ID            |
| `--text <text>`  | No       | New display text             |
| `--checked`      | No       | Mark the item as checked     |
| `--unchecked`    | No       | Mark the item as unchecked   |

```bash
todo checklist update --list AAMkAD... --task AAMkAD... --item AAMkAD... --checked
todo checklist update --list AAMkAD... --task AAMkAD... --item AAMkAD... --unchecked
todo checklist update --list AAMkAD... --task AAMkAD... --item AAMkAD... --text "Updated text"
```

#### `todo checklist delete`

Delete a checklist item.

```bash
todo checklist delete --list AAMkAD... --task AAMkAD... --item AAMkAD...
```

---

## Output Formats

### Human-readable (default)

Tasks and checklist items use `✓` for completed and `○` for incomplete:

```
○ Buy milk  ID: AAMkAD...  Due: 2026-04-20  Importance: high  Status: notStarted
✓ Walk the dog  ID: AAMkAD...  Status: completed
```

Task lists show ID and name, with tags for special lists:

```
ID: AAMkAD...  Name: Groceries
ID: AAMkAD...  Name: Tasks  [DEFAULT]
ID: AAMkAD...  Name: Team Work  [SHARED]
```

Checklist items:

```
✓ Milk  ID: AAMkAD...
○ Eggs  ID: AAMkAD...
```

### JSON (`--json`)

Pass `--json` to any read/list command to get the full API response as formatted JSON:

```bash
todo lists --json
todo tasks --list AAMkAD... --json
todo checklist --list AAMkAD... --task AAMkAD... --json
```

---

## Exit Codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| `0`  | Success                                          |
| `1`  | Error (missing arguments, auth failure, API error) |
