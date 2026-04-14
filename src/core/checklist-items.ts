import { GraphClient } from '../graph/client.js';
import { ChecklistItem, GraphResponse } from '../types.js';

function basePath(listId: string, taskId: string): string {
  return `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`;
}

export async function listChecklistItems(client: GraphClient, listId: string, taskId: string): Promise<ChecklistItem[]> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  const response = await client.request<GraphResponse<ChecklistItem>>('GET', basePath(listId, taskId));
  return response?.value ?? [];
}

export async function createChecklistItem(
  client: GraphClient,
  listId: string,
  taskId: string,
  displayName: string,
  isChecked?: boolean,
): Promise<ChecklistItem> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  if (!displayName) throw new Error('displayName is required');

  const body: Record<string, unknown> = { displayName };
  if (isChecked !== undefined) {
    body.isChecked = isChecked;
  }

  const response = await client.request<ChecklistItem>('POST', basePath(listId, taskId), body);
  return response!;
}

export async function updateChecklistItem(
  client: GraphClient,
  listId: string,
  taskId: string,
  itemId: string,
  updates: { displayName?: string; isChecked?: boolean },
): Promise<ChecklistItem> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  if (!itemId) throw new Error('checklistItemId is required');

  const response = await client.request<ChecklistItem>('PATCH', `${basePath(listId, taskId)}/${itemId}`, updates);
  return response!;
}

export async function deleteChecklistItem(client: GraphClient, listId: string, taskId: string, itemId: string): Promise<void> {
  if (!listId) throw new Error('listId is required');
  if (!taskId) throw new Error('taskId is required');
  if (!itemId) throw new Error('checklistItemId is required');
  await client.request('DELETE', `${basePath(listId, taskId)}/${itemId}`);
}
