import type { TodoTaskList, TodoTask, ChecklistItem } from './types.js';

export function formatTaskList(list: TodoTaskList, json?: boolean): string {
  if (json) return JSON.stringify(list, null, 2);
  let line = `ID: ${list.id}  Name: ${list.displayName}`;
  if (list.wellknownListName === 'defaultList') line += '  [DEFAULT]';
  if (list.isShared) line += '  [SHARED]';
  return line;
}

export function formatTaskLists(lists: TodoTaskList[], json?: boolean): string {
  if (json) return JSON.stringify(lists, null, 2);
  if (lists.length === 0) return 'No task lists found.';
  return lists.map((l) => formatTaskList(l)).join('\n');
}

export function formatTask(task: TodoTask, json?: boolean): string {
  if (json) return JSON.stringify(task, null, 2);
  const icon = task.status === 'completed' ? '✓' : '○';
  let line = `${icon} ${task.title}  ID: ${task.id}`;
  if (task.dueDateTime) {
    line += `  Due: ${task.dueDateTime.dateTime.split('T')[0]}`;
  }
  if (task.importance !== 'normal') {
    line += `  Importance: ${task.importance}`;
  }
  line += `  Status: ${task.status}`;
  if (task.body?.content) {
    const preview = task.body.content.length > 50
      ? task.body.content.slice(0, 50) + '…'
      : task.body.content;
    line += `\n  Body: ${preview}`;
  }
  return line;
}

export function formatTasks(tasks: TodoTask[], json?: boolean): string {
  if (json) return JSON.stringify(tasks, null, 2);
  if (tasks.length === 0) return 'No tasks found.';
  return tasks.map((t) => formatTask(t)).join('\n');
}

export function formatChecklistItem(item: ChecklistItem, json?: boolean): string {
  if (json) return JSON.stringify(item, null, 2);
  const icon = item.isChecked ? '✓' : '○';
  return `${icon} ${item.displayName}  ID: ${item.id}`;
}

export function formatChecklistItems(items: ChecklistItem[], json?: boolean): string {
  if (json) return JSON.stringify(items, null, 2);
  if (items.length === 0) return 'No checklist items found.';
  return items.map((i) => formatChecklistItem(i)).join('\n');
}
