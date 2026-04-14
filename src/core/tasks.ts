import { GraphClient } from '../graph/client.js';
import { TodoTask, CreateTaskInput, UpdateTaskInput, ListTasksOptions, GraphResponse, GraphDateTime } from '../types.js';

export function toGraphDateTime(isoString: string): GraphDateTime {
  const date = new Date(isoString);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const dateTime = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.0000000`;
  return { dateTime, timeZone: 'UTC' };
}

export async function listTasks(client: GraphClient, listId: string, options?: ListTasksOptions): Promise<TodoTask[]> {
  if (!listId) throw new Error('listId is required');

  const queryParams: Record<string, string> = {};
  if (options) {
    if (options.filter) {
      queryParams['$filter'] = options.filter;
    } else if (options.status) {
      queryParams['$filter'] = `status eq '${options.status}'`;
    }
    if (options.orderby) queryParams['$orderby'] = options.orderby;
    if (options.top !== undefined) queryParams['$top'] = String(options.top);
    if (options.select) queryParams['$select'] = options.select;
  }

  const response = await client.request<GraphResponse<TodoTask>>(
    'GET',
    `/me/todo/lists/${listId}/tasks`,
    undefined,
    Object.keys(queryParams).length > 0 ? queryParams : undefined,
  );
  return response?.value ?? [];
}

export async function createTask(client: GraphClient, listId: string, input: CreateTaskInput): Promise<TodoTask> {
  if (!listId) throw new Error('listId is required');
  if (!input.title) throw new Error('title is required');

  const body: Record<string, unknown> = { title: input.title };

  if (input.body !== undefined) {
    body.body = { content: input.body, contentType: 'text' };
  }
  if (input.dueDateTime !== undefined) {
    body.dueDateTime = toGraphDateTime(input.dueDateTime);
  }
  if (input.reminderDateTime !== undefined) {
    body.reminderDateTime = toGraphDateTime(input.reminderDateTime);
    body.isReminderOn = true;
  }
  if (input.startDateTime !== undefined) {
    body.startDateTime = toGraphDateTime(input.startDateTime);
  }
  if (input.importance !== undefined) {
    body.importance = input.importance;
  }
  if (input.status !== undefined) {
    body.status = input.status;
  }
  if (input.categories !== undefined) {
    body.categories = input.categories;
  }

  const response = await client.request<TodoTask>('POST', `/me/todo/lists/${listId}/tasks`, body);
  return response!;
}

export async function updateTask(client: GraphClient, listId: string, taskId: string, input: UpdateTaskInput): Promise<TodoTask> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');

  const body: Record<string, unknown> = {};

  if (input.title !== undefined) body.title = input.title;
  if (input.body !== undefined) body.body = { content: input.body, contentType: 'text' };
  if (input.importance !== undefined) body.importance = input.importance;
  if (input.status !== undefined) body.status = input.status;
  if (input.categories !== undefined) body.categories = input.categories;

  if (input.dueDateTime !== undefined) {
    body.dueDateTime = input.dueDateTime === '' ? null : toGraphDateTime(input.dueDateTime);
  }
  if (input.reminderDateTime !== undefined) {
    if (input.reminderDateTime === '') {
      body.reminderDateTime = null;
      body.isReminderOn = false;
    } else {
      body.reminderDateTime = toGraphDateTime(input.reminderDateTime);
      body.isReminderOn = true;
    }
  }
  if (input.startDateTime !== undefined) {
    body.startDateTime = input.startDateTime === '' ? null : toGraphDateTime(input.startDateTime);
  }

  const response = await client.request<TodoTask>('PATCH', `/me/todo/lists/${listId}/tasks/${taskId}`, body);
  return response!;
}

export async function deleteTask(client: GraphClient, listId: string, taskId: string): Promise<void> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  await client.request('DELETE', `/me/todo/lists/${listId}/tasks/${taskId}`);
}

export async function completeTask(client: GraphClient, listId: string, taskId: string): Promise<TodoTask> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  const response = await client.request<TodoTask>('PATCH', `/me/todo/lists/${listId}/tasks/${taskId}`, { status: 'completed' });
  return response!;
}
