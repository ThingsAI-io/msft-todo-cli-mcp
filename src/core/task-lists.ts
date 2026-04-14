import { GraphClient } from '../graph/client.js';
import { TodoTaskList, GraphResponse } from '../types.js';

export async function listTaskLists(client: GraphClient): Promise<TodoTaskList[]> {
  const response = await client.request<GraphResponse<TodoTaskList>>('GET', '/me/todo/lists');
  return response?.value ?? [];
}

export async function createTaskList(client: GraphClient, displayName: string): Promise<TodoTaskList> {
  if (!displayName) throw new Error('displayName is required');
  const response = await client.request<TodoTaskList>('POST', '/me/todo/lists', { displayName });
  return response!;
}

export async function updateTaskList(client: GraphClient, listId: string, displayName: string): Promise<TodoTaskList> {
  if (!listId) throw new Error('listId is required');
  if (!displayName) throw new Error('displayName is required');
  const response = await client.request<TodoTaskList>('PATCH', `/me/todo/lists/${listId}`, { displayName });
  return response!;
}

export async function deleteTaskList(client: GraphClient, listId: string): Promise<void> {
  if (!listId) throw new Error('listId is required');
  await client.request('DELETE', `/me/todo/lists/${listId}`);
}
