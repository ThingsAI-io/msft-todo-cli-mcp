import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAccessToken, forceRefresh } from './auth/token-manager.js';
import { GraphClient } from './graph/client.js';
import * as taskLists from './core/task-lists.js';
import * as tasks from './core/tasks.js';
import * as checklist from './core/checklist-items.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const HIERARCHY = 'Microsoft To Do organizes items as: Task Lists → Tasks → Checklist Items (sub-steps).';

const statusEnum = z.enum(['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred']);
const importanceEnum = z.enum(['low', 'normal', 'high']);

function textResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function msgResult(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: msg }] };
}

function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function createMcpServer(client: GraphClient): McpServer {
  const server = new McpServer({ name: 'todo-mcp-server', version: '0.1.0' });

  // Task Lists
  server.tool('list-task-lists', `List all task lists. ${HIERARCHY}`, {}, async () => {
    try { return textResult(await taskLists.listTaskLists(client)); }
    catch (e) { return errorResult(e); }
  });

  server.tool('create-task-list', `Create a new task list. ${HIERARCHY}`,
    { displayName: z.string() },
    async ({ displayName }) => {
      try { return textResult(await taskLists.createTaskList(client, displayName)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-task-list', `Update a task list's name. ${HIERARCHY}`,
    { listId: z.string(), displayName: z.string() },
    async ({ listId, displayName }) => {
      try { return textResult(await taskLists.updateTaskList(client, listId, displayName)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-task-list', `Delete a task list. ${HIERARCHY}`,
    { listId: z.string() },
    async ({ listId }) => {
      try { await taskLists.deleteTaskList(client, listId); return msgResult('Task list deleted successfully.'); }
      catch (e) { return errorResult(e); }
    });

  // Tasks
  server.tool('list-tasks', `List tasks in a task list. ${HIERARCHY}`,
    { listId: z.string(), status: statusEnum.optional(), top: z.number().optional() },
    async ({ listId, status, top }) => {
      try { return textResult(await tasks.listTasks(client, listId, { status, top })); }
      catch (e) { return errorResult(e); }
    });

  server.tool('create-task', `Create a new task in a task list. ${HIERARCHY}`,
    {
      listId: z.string(), title: z.string(), body: z.string().optional(),
      dueDateTime: z.string().optional(), reminderDateTime: z.string().optional(),
      importance: importanceEnum.optional(), startDateTime: z.string().optional(),
      status: statusEnum.optional(), categories: z.array(z.string()).optional(),
    },
    async ({ listId, ...input }) => {
      try { return textResult(await tasks.createTask(client, listId, input)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-task', `Update an existing task. ${HIERARCHY}`,
    {
      listId: z.string(), taskId: z.string(), title: z.string().optional(),
      body: z.string().optional(), dueDateTime: z.string().optional(),
      reminderDateTime: z.string().optional(), importance: importanceEnum.optional(),
      startDateTime: z.string().optional(), status: statusEnum.optional(),
      categories: z.array(z.string()).optional(),
    },
    async ({ listId, taskId, ...input }) => {
      try { return textResult(await tasks.updateTask(client, listId, taskId, input)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-task', `Delete a task from a task list. ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string() },
    async ({ listId, taskId }) => {
      try { await tasks.deleteTask(client, listId, taskId); return msgResult('Task deleted successfully.'); }
      catch (e) { return errorResult(e); }
    });

  server.tool('complete-task', `Mark a task as completed. ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string() },
    async ({ listId, taskId }) => {
      try { return textResult(await tasks.completeTask(client, listId, taskId)); }
      catch (e) { return errorResult(e); }
    });

  // Checklist Items
  server.tool('list-checklist-items', `List checklist items (sub-steps) of a task. ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string() },
    async ({ listId, taskId }) => {
      try { return textResult(await checklist.listChecklistItems(client, listId, taskId)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('create-checklist-item', `Create a checklist item (sub-step) on a task. ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string(), displayName: z.string(), isChecked: z.boolean().optional() },
    async ({ listId, taskId, displayName, isChecked }) => {
      try { return textResult(await checklist.createChecklistItem(client, listId, taskId, displayName, isChecked)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-checklist-item', `Update a checklist item (sub-step). ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string(), checklistItemId: z.string(), displayName: z.string().optional(), isChecked: z.boolean().optional() },
    async ({ listId, taskId, checklistItemId, displayName, isChecked }) => {
      try { return textResult(await checklist.updateChecklistItem(client, listId, taskId, checklistItemId, { displayName, isChecked })); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-checklist-item', `Delete a checklist item (sub-step). ${HIERARCHY}`,
    { listId: z.string(), taskId: z.string(), checklistItemId: z.string() },
    async ({ listId, taskId, checklistItemId }) => {
      try { await checklist.deleteChecklistItem(client, listId, taskId, checklistItemId); return msgResult('Checklist item deleted successfully.'); }
      catch (e) { return errorResult(e); }
    });

  return server;
}

export async function startMcpServer(): Promise<void> {
  const client = new GraphClient(getAccessToken, forceRefresh);
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
