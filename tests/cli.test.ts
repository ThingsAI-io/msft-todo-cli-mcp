import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TodoTaskList, TodoTask, ChecklistItem } from '../src/types.js';

// --- Mock data ---
const mockTaskList: TodoTaskList = {
  id: 'list-1',
  displayName: 'My List',
  isOwner: true,
  isShared: false,
  wellknownListName: 'none',
};

const mockTask: TodoTask = {
  id: 'task-1',
  title: 'Buy milk',
  status: 'notStarted',
  importance: 'normal',
  isReminderOn: false,
  body: { content: '', contentType: 'text' },
  dueDateTime: null,
  reminderDateTime: null,
  startDateTime: null,
  completedDateTime: null,
  categories: [],
  createdDateTime: '2025-01-01T00:00:00Z',
  lastModifiedDateTime: '2025-01-01T00:00:00Z',
};

const mockCompletedTask: TodoTask = {
  ...mockTask,
  id: 'task-2',
  status: 'completed',
  completedDateTime: { dateTime: '2025-01-02T00:00:00', timeZone: 'UTC' },
};

const mockChecklistItem: ChecklistItem = {
  id: 'item-1',
  displayName: 'Step 1',
  isChecked: false,
  createdDateTime: '2025-01-01T00:00:00Z',
};

// --- Mocks ---
vi.mock('../src/auth/token-manager.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
  forceRefresh: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('../src/auth/setup.js', () => ({
  runSetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/mcp.js', () => ({
  startMcpServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/graph/client.js', () => ({
  GraphClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../src/core/task-lists.js', () => ({
  listTaskLists: vi.fn().mockResolvedValue([]),
  createTaskList: vi.fn().mockResolvedValue({ id: 'new-list', displayName: 'Groceries', isOwner: true, isShared: false, wellknownListName: 'none' }),
  updateTaskList: vi.fn().mockResolvedValue({ id: 'list-123', displayName: 'New Name', isOwner: true, isShared: false, wellknownListName: 'none' }),
  deleteTaskList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/core/tasks.js', () => ({
  listTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue({
    id: 'task-new', title: 'Test', status: 'notStarted', importance: 'normal',
    isReminderOn: false, body: { content: '', contentType: 'text' },
    dueDateTime: null, reminderDateTime: null, startDateTime: null, completedDateTime: null,
    categories: [], createdDateTime: '2025-01-01T00:00:00Z', lastModifiedDateTime: '2025-01-01T00:00:00Z',
  }),
  updateTask: vi.fn().mockResolvedValue({
    id: 'task-456', title: 'New', status: 'notStarted', importance: 'normal',
    isReminderOn: false, body: { content: '', contentType: 'text' },
    dueDateTime: null, reminderDateTime: null, startDateTime: null, completedDateTime: null,
    categories: [], createdDateTime: '2025-01-01T00:00:00Z', lastModifiedDateTime: '2025-01-01T00:00:00Z',
  }),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  completeTask: vi.fn().mockResolvedValue({
    id: 'task-456', title: 'Done', status: 'completed', importance: 'normal',
    isReminderOn: false, body: { content: '', contentType: 'text' },
    dueDateTime: null, reminderDateTime: null, startDateTime: null, completedDateTime: null,
    categories: [], createdDateTime: '2025-01-01T00:00:00Z', lastModifiedDateTime: '2025-01-01T00:00:00Z',
  }),
}));

vi.mock('../src/core/checklist-items.js', () => ({
  listChecklistItems: vi.fn().mockResolvedValue([]),
  createChecklistItem: vi.fn().mockResolvedValue({ id: 'item-new', displayName: 'Step', isChecked: false, createdDateTime: '2025-01-01T00:00:00Z' }),
  updateChecklistItem: vi.fn().mockResolvedValue({ id: 'iid', displayName: 'New', isChecked: false, createdDateTime: '2025-01-01T00:00:00Z' }),
  deleteChecklistItem: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
const { run } = await import('../src/cli.js');
const { runSetup } = await import('../src/auth/setup.js');
const { startMcpServer } = await import('../src/mcp.js');
const { listTaskLists, createTaskList, updateTaskList, deleteTaskList } = await import('../src/core/task-lists.js');
const { listTasks, createTask, updateTask, deleteTask, completeTask } = await import('../src/core/tasks.js');
const { listChecklistItems, createChecklistItem, updateChecklistItem, deleteChecklistItem } = await import('../src/core/checklist-items.js');

// Format module (real, not mocked)
const format = await import('../src/format.js');

// Helpers
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
});

// ─── Command routing tests ───

describe('CLI command routing', () => {
  it('1. lists routes to listTaskLists', async () => {
    await run(['lists']);
    expect(listTaskLists).toHaveBeenCalled();
  });

  it('2. lists create routes to createTaskList with name', async () => {
    await run(['lists', 'create', 'Groceries']);
    expect(createTaskList).toHaveBeenCalledWith(expect.anything(), 'Groceries');
  });

  it('3. lists update routes to updateTaskList', async () => {
    await run(['lists', 'update', 'list-123', 'New Name']);
    expect(updateTaskList).toHaveBeenCalledWith(expect.anything(), 'list-123', 'New Name');
  });

  it('4. lists delete routes to deleteTaskList', async () => {
    await run(['lists', 'delete', 'list-123']);
    expect(deleteTaskList).toHaveBeenCalledWith(expect.anything(), 'list-123');
  });

  it('5. tasks --list routes to listTasks', async () => {
    await run(['tasks', '--list', 'list-123']);
    expect(listTasks).toHaveBeenCalledWith(expect.anything(), 'list-123');
  });

  it('6. tasks create with minimal args routes to createTask', async () => {
    await run(['tasks', 'create', '--list', 'list-123', '--title', 'Test']);
    expect(createTask).toHaveBeenCalledWith(expect.anything(), 'list-123', { title: 'Test' });
  });

  it('7. tasks create with all flags passes them correctly', async () => {
    await run([
      'tasks', 'create', '--list', 'list-123',
      '--title', 'Test', '--due', '2026-04-20',
      '--importance', 'high', '--body', 'notes',
    ]);
    expect(createTask).toHaveBeenCalledWith(expect.anything(), 'list-123', {
      title: 'Test',
      dueDateTime: '2026-04-20',
      importance: 'high',
      body: 'notes',
    });
  });

  it('8. tasks update routes correctly', async () => {
    await run(['tasks', 'update', '--list', 'list-123', '--task', 'task-456', '--title', 'New']);
    expect(updateTask).toHaveBeenCalledWith(expect.anything(), 'list-123', 'task-456', { title: 'New' });
  });

  it('9. tasks delete routes correctly', async () => {
    await run(['tasks', 'delete', '--list', 'list-123', '--task', 'task-456']);
    expect(deleteTask).toHaveBeenCalledWith(expect.anything(), 'list-123', 'task-456');
  });

  it('10. tasks complete routes to completeTask', async () => {
    await run(['tasks', 'complete', '--list', 'list-123', '--task', 'task-456']);
    expect(completeTask).toHaveBeenCalledWith(expect.anything(), 'list-123', 'task-456');
  });

  it('11. checklist routes to listChecklistItems', async () => {
    await run(['checklist', '--list', 'lid', '--task', 'tid']);
    expect(listChecklistItems).toHaveBeenCalledWith(expect.anything(), 'lid', 'tid');
  });

  it('12. checklist add routes to createChecklistItem', async () => {
    await run(['checklist', 'add', '--list', 'lid', '--task', 'tid', '--text', 'Step']);
    expect(createChecklistItem).toHaveBeenCalledWith(expect.anything(), 'lid', 'tid', 'Step');
  });

  it('13. checklist update routes correctly', async () => {
    await run(['checklist', 'update', '--list', 'lid', '--task', 'tid', '--item', 'iid', '--text', 'New']);
    expect(updateChecklistItem).toHaveBeenCalledWith(expect.anything(), 'lid', 'tid', 'iid', { displayName: 'New' });
  });

  it('14. checklist delete routes correctly', async () => {
    await run(['checklist', 'delete', '--list', 'lid', '--task', 'tid', '--item', 'iid']);
    expect(deleteChecklistItem).toHaveBeenCalledWith(expect.anything(), 'lid', 'tid', 'iid');
  });

  it('15. setup invokes runSetup with options', async () => {
    await run(['setup', '--client-id', 'my-id', '--tenant', 'my-tenant']);
    expect(runSetup).toHaveBeenCalledWith({ clientId: 'my-id', tenant: 'my-tenant' });
  });

  it('15b. setup invokes runSetup with no flags', async () => {
    await run(['setup']);
    expect(runSetup).toHaveBeenCalledWith({ clientId: undefined, tenant: undefined });
  });

  it('16. serve invokes startMcpServer', async () => {
    await run(['serve']);
    expect(startMcpServer).toHaveBeenCalled();
  });
});

// ─── Error handling tests ───

describe('CLI error handling', () => {
  it('17. unknown command exits with code 1', async () => {
    await expect(run(['bogus'])).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('18. missing --list flag on tasks exits with code 1', async () => {
    await expect(run(['tasks'])).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ─── Format tests ───

describe('Format output', () => {
  it('19. --json flag produces valid JSON output', () => {
    const lists = [mockTaskList];
    const output = format.formatTaskLists(lists, true);
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(lists);
  });

  it('20. task status icon: ✓ for completed, ○ for others', () => {
    const notStarted = format.formatTask(mockTask);
    expect(notStarted).toContain('○');
    expect(notStarted).not.toContain('✓');

    const completed = format.formatTask(mockCompletedTask);
    expect(completed).toContain('✓');
  });

  it('21. due dates displayed in human-readable form', () => {
    const taskWithDue: TodoTask = {
      ...mockTask,
      dueDateTime: { dateTime: '2026-04-20T00:00:00', timeZone: 'UTC' },
    };
    const output = format.formatTask(taskWithDue);
    expect(output).toContain('Due: 2026-04-20');
  });

  it('22. importance shown for non-normal values', () => {
    const highTask: TodoTask = { ...mockTask, importance: 'high' };
    const normalTask: TodoTask = { ...mockTask, importance: 'normal' };
    expect(format.formatTask(highTask)).toContain('Importance: high');
    expect(format.formatTask(normalTask)).not.toContain('Importance:');
  });
});
