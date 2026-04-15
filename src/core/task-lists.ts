import { GraphClient } from '../graph/client.js';
import { TodoTaskList, GraphResponse, validateId } from '../types.js';

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
  validateId(listId, 'listId');
  if (!displayName) throw new Error('displayName is required');
  const response = await client.request<TodoTaskList>('PATCH', `/me/todo/lists/${listId}`, { displayName });
  return response!;
}

export async function deleteTaskList(client: GraphClient, listId: string): Promise<void> {
  validateId(listId, 'listId');
  await client.request('DELETE', `/me/todo/lists/${listId}`);
}

export async function getTaskList(client: GraphClient, listId: string): Promise<TodoTaskList> {
  validateId(listId, 'listId');
  const response = await client.request<TodoTaskList>('GET', `/me/todo/lists/${listId}`);
  if (!response) throw new Error('Unexpected empty response');
  return response;
}
