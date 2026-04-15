import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';

// Mock all core modules
vi.mock('../src/core/task-lists.js', () => ({
  listTaskLists: vi.fn(),
  getTaskList: vi.fn(),
  createTaskList: vi.fn(),
  updateTaskList: vi.fn(),
  deleteTaskList: vi.fn(),
}));

vi.mock('../src/core/tasks.js', () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  completeTask: vi.fn(),
}));

vi.mock('../src/core/checklist-items.js', () => ({
  listChecklistItems: vi.fn(),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));

import * as taskListsMod from '../src/core/task-lists.js';
import * as tasksMod from '../src/core/tasks.js';
import * as checklistMod from '../src/core/checklist-items.js';

const taskLists = vi.mocked(taskListsMod);
const tasks = vi.mocked(tasksMod);
const checklist = vi.mocked(checklistMod);

async function setup() {
  const mockClient = {} as any;
  const server = createMcpServer(mockClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server, mockClient };
}

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 15 tools', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      'complete-task',
      'create-checklist-item',
      'create-task',
      'create-task-list',
      'delete-checklist-item',
      'delete-task',
      'delete-task-list',
      'get-task',
      'get-task-list',
      'list-checklist-items',
      'list-task-lists',
      'list-tasks',
      'update-checklist-item',
      'update-task',
      'update-task-list',
    ]);
  });

  it('list-task-lists calls listTaskLists and returns formatted text', async () => {
    const { client } = await setup();
    const mockData = [{ id: '1', displayName: 'My List', isOwner: true, isShared: false, wellknownListName: 'none' }];
    taskLists.listTaskLists.mockResolvedValue(mockData as any);

    const result = await client.callTool({ name: 'list-task-lists', arguments: {} });
    expect(taskLists.listTaskLists).toHaveBeenCalled();
    expect(result.content).toHaveLength(1);
    const text = (result.content as any)[0].text;
    expect(JSON.parse(text)).toEqual(mockData);
  });

  it('create-task rejects when title is missing (Zod validation)', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'create-task',
      arguments: { listId: 'list-1' },
    });
    expect(result.isError).toBe(true);
  });

  it('complete-task requires both listId and taskId', async () => {
    const { client } = await setup();
    // Missing taskId
    const result1 = await client.callTool({
      name: 'complete-task',
      arguments: { listId: 'list-1' },
    });
    expect(result1.isError).toBe(true);

    // Missing listId
    const result2 = await client.callTool({
      name: 'complete-task',
      arguments: { taskId: 'task-1' },
    });
    expect(result2.isError).toBe(true);
  });

  it('update-task accepts partial updates (only title)', async () => {
    const { client } = await setup();
    const mockTask = { id: 'task-1', title: 'Updated' };
    tasks.updateTask.mockResolvedValue(mockTask as any);

    const result = await client.callTool({
      name: 'update-task',
      arguments: { listId: 'list-1', taskId: 'task-1', title: 'Updated' },
    });
    expect(result.isError).toBeFalsy();
    expect(tasks.updateTask).toHaveBeenCalledWith(
      expect.anything(), 'list-1', 'task-1',
      expect.objectContaining({ title: 'Updated' }),
    );
  });

  it('tool handlers call correct core functions with correct arguments', async () => {
    const { client } = await setup();

    // create-task-list
    taskLists.createTaskList.mockResolvedValue({ id: '1', displayName: 'Work' } as any);
    await client.callTool({ name: 'create-task-list', arguments: { displayName: 'Work' } });
    expect(taskLists.createTaskList).toHaveBeenCalledWith(expect.anything(), 'Work');

    // list-tasks
    tasks.listTasks.mockResolvedValue([]);
    await client.callTool({ name: 'list-tasks', arguments: { listId: 'list-1', status: 'completed', top: 5 } });
    expect(tasks.listTasks).toHaveBeenCalledWith(
      expect.anything(), 'list-1',
      expect.objectContaining({ status: 'completed', top: 5 }),
    );

    // create-checklist-item
    checklist.createChecklistItem.mockResolvedValue({ id: 'ci-1', displayName: 'Step 1', isChecked: false, createdDateTime: '' } as any);
    await client.callTool({
      name: 'create-checklist-item',
      arguments: { listId: 'l1', taskId: 't1', displayName: 'Step 1', isChecked: true },
    });
    expect(checklist.createChecklistItem).toHaveBeenCalledWith(expect.anything(), 'l1', 't1', 'Step 1', true);

    // update-checklist-item
    checklist.updateChecklistItem.mockResolvedValue({ id: 'ci-1', displayName: 'Updated', isChecked: true, createdDateTime: '' } as any);
    await client.callTool({
      name: 'update-checklist-item',
      arguments: { listId: 'l1', taskId: 't1', checklistItemId: 'ci-1', displayName: 'Updated', isChecked: true },
    });
    expect(checklist.updateChecklistItem).toHaveBeenCalledWith(
      expect.anything(), 'l1', 't1', 'ci-1',
      expect.objectContaining({ displayName: 'Updated', isChecked: true }),
    );
  });

  it('delete tool handlers return confirmation message', async () => {
    const { client } = await setup();
    taskLists.deleteTaskList.mockResolvedValue(undefined);
    tasks.deleteTask.mockResolvedValue(undefined);
    checklist.deleteChecklistItem.mockResolvedValue(undefined);

    const r1 = await client.callTool({ name: 'delete-task-list', arguments: { listId: 'l1' } });
    expect((r1.content as any)[0].text).toContain('deleted');

    const r2 = await client.callTool({ name: 'delete-task', arguments: { listId: 'l1', taskId: 't1' } });
    expect((r2.content as any)[0].text).toContain('deleted');

    const r3 = await client.callTool({ name: 'delete-checklist-item', arguments: { listId: 'l1', taskId: 't1', checklistItemId: 'ci1' } });
    expect((r3.content as any)[0].text).toContain('deleted');
  });

  it('error in core function returns error response', async () => {
    const { client } = await setup();
    taskLists.listTaskLists.mockRejectedValue(new Error('Network failure'));

    const result = await client.callTool({ name: 'list-task-lists', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as any)[0].text).toContain('Network failure');
  });
});
