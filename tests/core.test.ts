import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphClient } from '../src/graph/client.js';
import { listTaskLists, createTaskList, updateTaskList, deleteTaskList } from '../src/core/task-lists.js';
import { listTasks, createTask, updateTask, deleteTask, completeTask, toGraphDateTime } from '../src/core/tasks.js';
import { listChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem } from '../src/core/checklist-items.js';

const mockRequest = vi.fn();
const client = { request: mockRequest } as unknown as GraphClient;

beforeEach(() => {
  mockRequest.mockReset();
});

// ── Task Lists ──────────────────────────────────────────────────────────

describe('Task Lists', () => {
  it('listTaskLists calls GET /me/todo/lists', async () => {
    const lists = [{ id: '1', displayName: 'Tasks' }];
    mockRequest.mockResolvedValue({ value: lists });

    const result = await listTaskLists(client);

    expect(mockRequest).toHaveBeenCalledWith('GET', '/me/todo/lists');
    expect(result).toEqual(lists);
  });

  it('createTaskList sends POST with displayName', async () => {
    const created = { id: '2', displayName: 'Test' };
    mockRequest.mockResolvedValue(created);

    const result = await createTaskList(client, 'Test');

    expect(mockRequest).toHaveBeenCalledWith('POST', '/me/todo/lists', { displayName: 'Test' });
    expect(result).toEqual(created);
  });

  it('updateTaskList sends PATCH to correct URL', async () => {
    const updated = { id: 'list-123', displayName: 'New' };
    mockRequest.mockResolvedValue(updated);

    const result = await updateTaskList(client, 'list-123', 'New');

    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/me/todo/lists/list-123', { displayName: 'New' });
    expect(result).toEqual(updated);
  });

  it('deleteTaskList sends DELETE to correct URL', async () => {
    mockRequest.mockResolvedValue(undefined);

    await deleteTaskList(client, 'list-123');

    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/me/todo/lists/list-123');
  });

  it('updateTaskList throws if listId is empty', async () => {
    await expect(updateTaskList(client, '', 'New')).rejects.toThrow('listId is required');
  });

  it('createTaskList throws if displayName is empty', async () => {
    await expect(createTaskList(client, '')).rejects.toThrow('displayName is required');
  });
});

// ── Tasks ───────────────────────────────────────────────────────────────

describe('Tasks', () => {
  it('listTasks calls GET on correct URL', async () => {
    mockRequest.mockResolvedValue({ value: [] });

    const result = await listTasks(client, 'list-1');

    expect(mockRequest).toHaveBeenCalledWith('GET', '/me/todo/lists/list-1/tasks', undefined, undefined);
    expect(result).toEqual([]);
  });

  it('listTasks with status filter builds $filter', async () => {
    mockRequest.mockResolvedValue({ value: [] });

    await listTasks(client, 'list-1', { status: 'completed' });

    expect(mockRequest).toHaveBeenCalledWith(
      'GET',
      '/me/todo/lists/list-1/tasks',
      undefined,
      expect.objectContaining({ '$filter': "status eq 'completed'" }),
    );
  });

  it('listTasks with top builds $top', async () => {
    mockRequest.mockResolvedValue({ value: [] });

    await listTasks(client, 'list-1', { top: 5 });

    expect(mockRequest).toHaveBeenCalledWith(
      'GET',
      '/me/todo/lists/list-1/tasks',
      undefined,
      expect.objectContaining({ '$top': '5' }),
    );
  });

  it('listTasks with combined options builds correct query params', async () => {
    mockRequest.mockResolvedValue({ value: [] });

    await listTasks(client, 'list-1', { status: 'completed', top: 10, orderby: 'createdDateTime desc', select: 'id,title' });

    const params = mockRequest.mock.calls[0][3];
    expect(params['$filter']).toBe("status eq 'completed'");
    expect(params['$top']).toBe('10');
    expect(params['$orderby']).toBe('createdDateTime desc');
    expect(params['$select']).toBe('id,title');
  });

  it('createTask converts ISO date to GraphDateTime', async () => {
    mockRequest.mockResolvedValue({ id: 't1', title: 'Test' });

    await createTask(client, 'list-1', { title: 'Test', dueDateTime: '2024-12-25T10:00:00Z' });

    const body = mockRequest.mock.calls[0][2];
    expect(body.dueDateTime).toEqual({
      dateTime: '2024-12-25T10:00:00.0000000',
      timeZone: 'UTC',
    });
  });

  it('createTask with all optional fields builds correct body', async () => {
    mockRequest.mockResolvedValue({ id: 't1' });

    await createTask(client, 'list-1', {
      title: 'Full task',
      body: 'Description here',
      dueDateTime: '2024-12-25T10:00:00Z',
      reminderDateTime: '2024-12-24T09:00:00Z',
      startDateTime: '2024-12-20T08:00:00Z',
      importance: 'high',
      status: 'inProgress',
      categories: ['work'],
    });

    const body = mockRequest.mock.calls[0][2];
    expect(body.title).toBe('Full task');
    expect(body.body).toEqual({ content: 'Description here', contentType: 'text' });
    expect(body.dueDateTime.timeZone).toBe('UTC');
    expect(body.reminderDateTime.timeZone).toBe('UTC');
    expect(body.startDateTime.timeZone).toBe('UTC');
    expect(body.isReminderOn).toBe(true);
    expect(body.importance).toBe('high');
    expect(body.status).toBe('inProgress');
    expect(body.categories).toEqual(['work']);
  });

  it('createTask with minimal fields (title only)', async () => {
    mockRequest.mockResolvedValue({ id: 't1', title: 'Simple' });

    await createTask(client, 'list-1', { title: 'Simple' });

    const body = mockRequest.mock.calls[0][2];
    expect(body).toEqual({ title: 'Simple' });
  });

  it('createTask sets isReminderOn when reminderDateTime provided', async () => {
    mockRequest.mockResolvedValue({ id: 't1' });

    await createTask(client, 'list-1', { title: 'Reminder', reminderDateTime: '2024-12-24T09:00:00Z' });

    const body = mockRequest.mock.calls[0][2];
    expect(body.isReminderOn).toBe(true);
    expect(body.reminderDateTime).toBeDefined();
  });

  it('updateTask sends only provided fields', async () => {
    mockRequest.mockResolvedValue({ id: 't1', title: 'Updated' });

    await updateTask(client, 'list-1', 'task-1', { title: 'Updated' });

    const body = mockRequest.mock.calls[0][2];
    expect(body).toEqual({ title: 'Updated' });
  });

  it('updateTask with empty string dueDateTime sends null', async () => {
    mockRequest.mockResolvedValue({ id: 't1' });

    await updateTask(client, 'list-1', 'task-1', { dueDateTime: '' });

    const body = mockRequest.mock.calls[0][2];
    expect(body.dueDateTime).toBeNull();
  });

  it('deleteTask calls DELETE with correct URL', async () => {
    mockRequest.mockResolvedValue(undefined);

    await deleteTask(client, 'list-1', 'task-1');

    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/me/todo/lists/list-1/tasks/task-1');
  });

  it('completeTask sends { status: "completed" } as PATCH', async () => {
    mockRequest.mockResolvedValue({ id: 't1', status: 'completed' });

    await completeTask(client, 'list-1', 'task-1');

    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/me/todo/lists/list-1/tasks/task-1', { status: 'completed' });
  });

  it('updateTask throws if taskId is empty', async () => {
    await expect(updateTask(client, 'list-1', '', { title: 'X' })).rejects.toThrow('taskId is required');
  });
});

// ── toGraphDateTime ─────────────────────────────────────────────────────

describe('toGraphDateTime', () => {
  it('converts ISO string to Graph format', () => {
    const result = toGraphDateTime('2024-12-25T10:30:45Z');
    expect(result).toEqual({
      dateTime: '2024-12-25T10:30:45.0000000',
      timeZone: 'UTC',
    });
  });
});

// ── Checklist Items ─────────────────────────────────────────────────────

describe('Checklist Items', () => {
  it('listChecklistItems calls correct nested URL', async () => {
    mockRequest.mockResolvedValue({ value: [] });

    const result = await listChecklistItems(client, 'list-1', 'task-1');

    expect(mockRequest).toHaveBeenCalledWith('GET', '/me/todo/lists/list-1/tasks/task-1/checklistItems');
    expect(result).toEqual([]);
  });

  it('createChecklistItem sends displayName', async () => {
    mockRequest.mockResolvedValue({ id: 'c1', displayName: 'Step 1' });

    await createChecklistItem(client, 'list-1', 'task-1', 'Step 1');

    expect(mockRequest).toHaveBeenCalledWith(
      'POST',
      '/me/todo/lists/list-1/tasks/task-1/checklistItems',
      { displayName: 'Step 1' },
    );
  });

  it('createChecklistItem with isChecked sends it in body', async () => {
    mockRequest.mockResolvedValue({ id: 'c1', displayName: 'Step 1', isChecked: true });

    await createChecklistItem(client, 'list-1', 'task-1', 'Step 1', true);

    expect(mockRequest).toHaveBeenCalledWith(
      'POST',
      '/me/todo/lists/list-1/tasks/task-1/checklistItems',
      { displayName: 'Step 1', isChecked: true },
    );
  });

  it('createChecklistItem without isChecked omits it from body', async () => {
    mockRequest.mockResolvedValue({ id: 'c1', displayName: 'Step 1' });

    await createChecklistItem(client, 'list-1', 'task-1', 'Step 1');

    const body = mockRequest.mock.calls[0][2];
    expect(body).toEqual({ displayName: 'Step 1' });
    expect('isChecked' in body).toBe(false);
  });

  it('updateChecklistItem sends partial update', async () => {
    mockRequest.mockResolvedValue({ id: 'c1', isChecked: true });

    await updateChecklistItem(client, 'list-1', 'task-1', 'item-1', { isChecked: true });

    expect(mockRequest).toHaveBeenCalledWith(
      'PATCH',
      '/me/todo/lists/list-1/tasks/task-1/checklistItems/item-1',
      { isChecked: true },
    );
  });

  it('deleteChecklistItem calls DELETE with correct URL', async () => {
    mockRequest.mockResolvedValue(undefined);

    await deleteChecklistItem(client, 'list-1', 'task-1', 'item-1');

    expect(mockRequest).toHaveBeenCalledWith(
      'DELETE',
      '/me/todo/lists/list-1/tasks/task-1/checklistItems/item-1',
    );
  });

  it('throws if checklistItemId is empty', async () => {
    await expect(deleteChecklistItem(client, 'list-1', 'task-1', '')).rejects.toThrow('checklistItemId is required');
  });
});
