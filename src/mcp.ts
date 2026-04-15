import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAccessToken, forceRefresh } from './auth/token-manager.js';
import { GraphClient, GraphApiError } from './graph/client.js';
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
  if (err instanceof GraphApiError) {
    const detail = {
      error: true,
      statusCode: err.statusCode,
      code: err.errorCode,
      message: err.message,
      retryable: err.isRetryable,
    };
    return { content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }], isError: true };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function createMcpServer(client: GraphClient): McpServer {
  const server = new McpServer({ name: 'todo-mcp-server', version: '0.1.1' });

  // Task Lists
  server.tool('list-task-lists', `List all task lists. ${HIERARCHY}`, {}, async () => {
    try { return textResult(await taskLists.listTaskLists(client)); }
    catch (e) { return errorResult(e); }
  });

  server.tool('get-task-list', `Get a single task list by ID. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list.') },
    async ({ listId }) => {
      try { return textResult(await taskLists.getTaskList(client, listId)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('create-task-list', `Create a new task list. ${HIERARCHY}`,
    { displayName: z.string().describe('Name for the task list.') },
    async ({ displayName }) => {
      try { return textResult(await taskLists.createTaskList(client, displayName)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-task-list', `Update a task list's name. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), displayName: z.string().describe('Name for the task list.') },
    async ({ listId, displayName }) => {
      try { return textResult(await taskLists.updateTaskList(client, listId, displayName)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-task-list', `Delete a task list. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.') },
    async ({ listId }) => {
      try { await taskLists.deleteTaskList(client, listId); return msgResult('Task list deleted successfully.'); }
      catch (e) { return errorResult(e); }
    });

  // Tasks
  server.tool('list-tasks', `List tasks in a task list. ${HIERARCHY}`,
    {
      listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'),
      status: statusEnum.optional().describe('Filter tasks by status.'),
      top: z.number().optional().describe('Maximum number of tasks to return (default: 100).'),
      filter: z.string().optional().describe('OData $filter expression for advanced filtering, e.g. "contains(title, \'milk\')".'),
      orderby: z.string().optional().describe('OData $orderby expression, e.g. "dueDateTime/dateTime asc".'),
    },
    async ({ listId, status, top, filter, orderby }) => {
      try { return textResult(await tasks.listTasks(client, listId, { status, top, filter, orderby })); }
      catch (e) { return errorResult(e); }
    });

  server.tool('get-task', `Get a single task by ID. ${HIERARCHY}`,
    {
      listId: z.string().describe('ID of the task list containing the task.'),
      taskId: z.string().describe('ID of the task to retrieve.'),
    },
    async ({ listId, taskId }) => {
      try { return textResult(await tasks.getTask(client, listId, taskId)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('create-task', `Create a new task in a task list. ${HIERARCHY}`,
    {
      listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'),
      title: z.string().describe('Title of the task.'),
      body: z.string().optional().describe('Body/notes content of the task (plain text).'),
      dueDateTime: z.string().optional().describe('Due date in ISO 8601 format, e.g. "2025-12-31" or "2025-12-31T09:00:00Z".'),
      reminderDateTime: z.string().optional().describe('Reminder date/time in ISO 8601 format. Pass empty string "" to remove.'),
      importance: importanceEnum.optional().describe('Priority level of the task.'),
      startDateTime: z.string().optional().describe('Start date in ISO 8601 format. Pass empty string "" to remove.'),
      status: statusEnum.optional().describe('Status of the task.'),
      categories: z.array(z.string()).optional().describe('Array of category names (color tags) for the task.'),
    },
    async ({ listId, ...input }) => {
      try { return textResult(await tasks.createTask(client, listId, input)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-task', `Update an existing task. ${HIERARCHY}`,
    {
      listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'),
      taskId: z.string().describe('ID of the task within the list.'),
      title: z.string().optional().describe('Title of the task.'),
      body: z.string().optional().describe('Body/notes content of the task (plain text).'),
      dueDateTime: z.string().optional().describe('Due date in ISO 8601 format, e.g. "2025-12-31" or "2025-12-31T09:00:00Z".'),
      reminderDateTime: z.string().optional().describe('Reminder date/time in ISO 8601 format. Pass empty string "" to remove.'),
      importance: importanceEnum.optional().describe('Priority level of the task.'),
      startDateTime: z.string().optional().describe('Start date in ISO 8601 format. Pass empty string "" to remove.'),
      status: statusEnum.optional().describe('Status of the task.'),
      categories: z.array(z.string()).optional().describe('Array of category names (color tags) for the task.'),
    },
    async ({ listId, taskId, ...input }) => {
      try { return textResult(await tasks.updateTask(client, listId, taskId, input)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-task', `Delete a task from a task list. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.') },
    async ({ listId, taskId }) => {
      try { await tasks.deleteTask(client, listId, taskId); return msgResult('Task deleted successfully.'); }
      catch (e) { return errorResult(e); }
    });

  server.tool('complete-task', `Mark a task as completed. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.') },
    async ({ listId, taskId }) => {
      try { return textResult(await tasks.completeTask(client, listId, taskId)); }
      catch (e) { return errorResult(e); }
    });

  // Checklist Items
  server.tool('list-checklist-items', `List checklist items (sub-steps) of a task. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.') },
    async ({ listId, taskId }) => {
      try { return textResult(await checklist.listChecklistItems(client, listId, taskId)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('create-checklist-item', `Create a checklist item (sub-step) on a task. ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.'), displayName: z.string().describe('Display text for the checklist item.'), isChecked: z.boolean().optional().describe('Whether the checklist item is checked off.') },
    async ({ listId, taskId, displayName, isChecked }) => {
      try { return textResult(await checklist.createChecklistItem(client, listId, taskId, displayName, isChecked)); }
      catch (e) { return errorResult(e); }
    });

  server.tool('update-checklist-item', `Update a checklist item (sub-step). ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.'), checklistItemId: z.string().describe('ID of the checklist item.'), displayName: z.string().optional().describe('Display text for the checklist item.'), isChecked: z.boolean().optional().describe('Whether the checklist item is checked off.') },
    async ({ listId, taskId, checklistItemId, displayName, isChecked }) => {
      try { return textResult(await checklist.updateChecklistItem(client, listId, taskId, checklistItemId, { displayName, isChecked })); }
      catch (e) { return errorResult(e); }
    });

  server.tool('delete-checklist-item', `Delete a checklist item (sub-step). ${HIERARCHY}`,
    { listId: z.string().describe('ID of the task list. Use list-task-lists to find available list IDs.'), taskId: z.string().describe('ID of the task within the list.'), checklistItemId: z.string().describe('ID of the checklist item.') },
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
