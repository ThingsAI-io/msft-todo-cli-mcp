#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { getAccessToken, forceRefresh } from './auth/token-manager.js';
import { runSetup } from './auth/setup.js';
import { GraphClient } from './graph/client.js';
import { listTaskLists, createTaskList, updateTaskList, deleteTaskList } from './core/task-lists.js';
import { listTasks, createTask, updateTask, deleteTask, completeTask } from './core/tasks.js';
import { listChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem } from './core/checklist-items.js';
import { startMcpServer } from './mcp.js';
import {
  formatTaskLists, formatTasks, formatChecklistItems,
  formatTask, formatTaskList, formatChecklistItem,
} from './format.js';
import type { CreateTaskInput, UpdateTaskInput, TaskImportance, TaskStatus } from './types.js';

const USAGE = `Usage: todo <command> [options]

Commands:
  setup                              Configure OAuth credentials
  serve                              Start MCP server
  lists                              List all task lists
  lists create <name>                Create a task list
  lists update <id> <name>           Update a task list
  lists delete <id>                  Delete a task list
  tasks --list <id>                  List tasks in a list
  tasks create --list <id> --title "..."
    [--due <date>] [--importance <level>] [--body <text>]
    [--reminder <datetime>] [--start <date>] [--status <status>]
    [--categories <cat1,cat2>]
  tasks update --list <id> --task <id>
    [--title <text>] [--due <date>] [--importance <level>] [--body <text>]
    [--reminder <datetime>] [--start <date>] [--status <status>]
    [--categories <cat1,cat2>]
  tasks delete --list <id> --task <id>
  tasks complete --list <id> --task <id>
  checklist --list <id> --task <id>  List checklist items
  checklist add --list <id> --task <id> --text "..."
  checklist update --list <id> --task <id> --item <id>
    [--text <text>] [--checked]
  checklist delete --list <id> --task <id> --item <id>
  help                               Show this help

Global flags:
  --json    Output in JSON format
`;

function getClient(): GraphClient {
  return new GraphClient(getAccessToken, forceRefresh);
}

export async function run(args: string[]): Promise<void> {
  const resource = args[0];

  if (!resource || resource === 'help' || resource === '--help') {
    console.log(USAGE);
    return;
  }

  if (resource === 'setup') {
    await runSetup();
    return;
  }

  if (resource === 'serve') {
    await startMcpServer();
    return;
  }

  if (resource === 'lists') {
    await handleLists(args.slice(1));
    return;
  }

  if (resource === 'tasks') {
    await handleTasks(args.slice(1));
    return;
  }

  if (resource === 'checklist') {
    await handleChecklist(args.slice(1));
    return;
  }

  console.error(`Unknown command: ${resource}`);
  console.error(USAGE);
  process.exit(1);
}

async function handleLists(args: string[]): Promise<void> {
  const action = args[0];
  const { values } = parseArgs({
    args,
    options: { json: { type: 'boolean', default: false } },
    strict: false,
    allowPositionals: true,
  });
  const json = values.json as boolean;
  const client = getClient();

  if (!action || action === '--json') {
    const lists = await listTaskLists(client);
    console.log(formatTaskLists(lists, json));
    return;
  }

  if (action === 'create') {
    const name = args[1];
    if (!name) {
      console.error('Error: Missing list name.\nUsage: todo lists create <name>');
      process.exit(1);
    }
    const list = await createTaskList(client, name);
    console.log(formatTaskList(list, json));
    return;
  }

  if (action === 'update') {
    const id = args[1];
    const name = args[2];
    if (!id || !name) {
      console.error('Error: Missing arguments.\nUsage: todo lists update <id> <name>');
      process.exit(1);
    }
    const list = await updateTaskList(client, id, name);
    console.log(formatTaskList(list, json));
    return;
  }

  if (action === 'delete') {
    const id = args[1];
    if (!id) {
      console.error('Error: Missing list ID.\nUsage: todo lists delete <id>');
      process.exit(1);
    }
    await deleteTaskList(client, id);
    console.log('Task list deleted.');
    return;
  }

  console.error(`Unknown lists command: ${action}`);
  console.error(USAGE);
  process.exit(1);
}

async function handleTasks(args: string[]): Promise<void> {
  const action = args[0];
  const { values } = parseArgs({
    args,
    options: {
      list: { type: 'string' },
      task: { type: 'string' },
      title: { type: 'string' },
      due: { type: 'string' },
      importance: { type: 'string' },
      body: { type: 'string' },
      reminder: { type: 'string' },
      start: { type: 'string' },
      status: { type: 'string' },
      categories: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const listId = values.list as string | undefined;
  const json = values.json as boolean;
  const client = getClient();

  if (!listId) {
    console.error('Error: --list flag is required for tasks commands.');
    process.exit(1);
  }

  if (!action || action.startsWith('--')) {
    const tasks = await listTasks(client, listId);
    console.log(formatTasks(tasks, json));
    return;
  }

  if (action === 'create') {
    const title = values.title as string | undefined;
    if (!title) {
      console.error('Error: --title flag is required for task creation.');
      process.exit(1);
    }
    const input: CreateTaskInput = { title };
    if (values.due) input.dueDateTime = values.due as string;
    if (values.importance) input.importance = values.importance as TaskImportance;
    if (values.body) input.body = values.body as string;
    if (values.reminder) input.reminderDateTime = values.reminder as string;
    if (values.start) input.startDateTime = values.start as string;
    if (values.status) input.status = values.status as TaskStatus;
    if (values.categories) input.categories = (values.categories as string).split(',');

    const task = await createTask(client, listId, input);
    console.log(formatTask(task, json));
    return;
  }

  if (action === 'update') {
    const taskId = values.task as string | undefined;
    if (!taskId) {
      console.error('Error: --task flag is required for task update.');
      process.exit(1);
    }
    const input: UpdateTaskInput = {};
    if (values.title) input.title = values.title as string;
    if (values.due) input.dueDateTime = values.due as string;
    if (values.importance) input.importance = values.importance as TaskImportance;
    if (values.body) input.body = values.body as string;
    if (values.reminder) input.reminderDateTime = values.reminder as string;
    if (values.start) input.startDateTime = values.start as string;
    if (values.status) input.status = values.status as TaskStatus;
    if (values.categories) input.categories = (values.categories as string).split(',');

    const task = await updateTask(client, listId, taskId, input);
    console.log(formatTask(task, json));
    return;
  }

  if (action === 'delete') {
    const taskId = values.task as string | undefined;
    if (!taskId) {
      console.error('Error: --task flag is required for task deletion.');
      process.exit(1);
    }
    await deleteTask(client, listId, taskId);
    console.log('Task deleted.');
    return;
  }

  if (action === 'complete') {
    const taskId = values.task as string | undefined;
    if (!taskId) {
      console.error('Error: --task flag is required for task completion.');
      process.exit(1);
    }
    const task = await completeTask(client, listId, taskId);
    console.log(formatTask(task, json));
    return;
  }

  console.error(`Unknown tasks command: ${action}`);
  console.error(USAGE);
  process.exit(1);
}

async function handleChecklist(args: string[]): Promise<void> {
  const action = args[0];
  const { values } = parseArgs({
    args,
    options: {
      list: { type: 'string' },
      task: { type: 'string' },
      item: { type: 'string' },
      text: { type: 'string' },
      checked: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const listId = values.list as string | undefined;
  const taskId = values.task as string | undefined;
  const json = values.json as boolean;
  const client = getClient();

  if (!listId || !taskId) {
    console.error('Error: --list and --task flags are required for checklist commands.');
    process.exit(1);
  }

  if (!action || action.startsWith('--')) {
    const items = await listChecklistItems(client, listId, taskId);
    console.log(formatChecklistItems(items, json));
    return;
  }

  if (action === 'add') {
    const text = values.text as string | undefined;
    if (!text) {
      console.error('Error: --text flag is required for checklist item creation.');
      process.exit(1);
    }
    const item = await createChecklistItem(client, listId, taskId, text);
    console.log(formatChecklistItem(item, json));
    return;
  }

  if (action === 'update') {
    const itemId = values.item as string | undefined;
    if (!itemId) {
      console.error('Error: --item flag is required for checklist item update.');
      process.exit(1);
    }
    const updates: { displayName?: string; isChecked?: boolean } = {};
    if (values.text) updates.displayName = values.text as string;
    if (values.checked) updates.isChecked = true;
    const item = await updateChecklistItem(client, listId, taskId, itemId, updates);
    console.log(formatChecklistItem(item, json));
    return;
  }

  if (action === 'delete') {
    const itemId = values.item as string | undefined;
    if (!itemId) {
      console.error('Error: --item flag is required for checklist item deletion.');
      process.exit(1);
    }
    await deleteChecklistItem(client, listId, taskId, itemId);
    console.log('Checklist item deleted.');
    return;
  }

  console.error(`Unknown checklist command: ${action}`);
  console.error(USAGE);
  process.exit(1);
}

async function main(): Promise<void> {
  await run(process.argv.slice(2));
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
