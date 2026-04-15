import { GraphClient } from '../graph/client.js';
import { ChecklistItem, GraphResponse, validateId } from '../types.js';

function basePath(listId: string, taskId: string): string {
  return `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`;
}

export async function listChecklistItems(client: GraphClient, listId: string, taskId: string): Promise<ChecklistItem[]> {
  validateId(listId, 'listId');
  validateId(taskId, 'taskId');
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
  validateId(listId, 'listId');
  validateId(taskId, 'taskId');
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
  validateId(listId, 'listId');
  validateId(taskId, 'taskId');
  validateId(itemId, 'checklistItemId');

  const response = await client.request<ChecklistItem>('PATCH',`${basePath(listId, taskId)}/${itemId}`, updates);
  return response!;
}

export async function deleteChecklistItem(client: GraphClient, listId: string, taskId: string, itemId: string): Promise<void> {
  validateId(listId, 'listId');
  validateId(taskId, 'taskId');
  validateId(itemId, 'checklistItemId');
  await client.request('DELETE', `${basePath(listId, taskId)}/${itemId}`);
}
