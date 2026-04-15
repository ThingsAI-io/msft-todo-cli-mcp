import type { TodoTaskList, TodoTask, ChecklistItem } from './types.js';

/** Strip ANSI escape sequences and control characters (except newline) to prevent terminal injection. */
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');
}

export function formatTaskList(list: TodoTaskList, json?: boolean): string {
  if (json) return JSON.stringify(list, null, 2);
  let line = `ID: ${list.id}  Name: ${sanitize(list.displayName)}`;
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
  let line = `${icon} ${sanitize(task.title)}  ID: ${task.id}`;
  if (task.dueDateTime) {
    line += `  Due: ${task.dueDateTime.dateTime.split('T')[0]}`;
  }
  if (task.importance !== 'normal') {
    line += `  Importance: ${task.importance}`;
  }
  line += `  Status: ${task.status}`;
  if (task.body?.content) {
    const raw = sanitize(task.body.content);
    const preview = raw.length > 50 ? raw.slice(0, 50) + '…' : raw;
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
  return `${icon} ${sanitize(item.displayName)}  ID: ${item.id}`;
}

export function formatChecklistItems(items: ChecklistItem[], json?: boolean): string {
  if (json) return JSON.stringify(items, null, 2);
  if (items.length === 0) return 'No checklist items found.';
  return items.map((i) => formatChecklistItem(i)).join('\n');
}
