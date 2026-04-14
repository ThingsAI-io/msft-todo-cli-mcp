// Microsoft Graph API date/time object
export interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

// Generic Graph API collection response
export interface GraphResponse<T> {
  value: T[];
}

export interface TodoTaskList {
  id: string;
  displayName: string;
  isOwner: boolean;
  isShared: boolean;
  wellknownListName: 'none' | 'defaultList' | 'flaggedEmails';
}

export type TaskStatus =
  | 'notStarted'
  | 'inProgress'
  | 'completed'
  | 'waitingOnOthers'
  | 'deferred';

export type TaskImportance = 'low' | 'normal' | 'high';

export interface TodoTask {
  id: string;
  title: string;
  status: TaskStatus;
  importance: TaskImportance;
  isReminderOn: boolean;
  body: {
    content: string;
    contentType: 'text';
  };
  dueDateTime: GraphDateTime | null;
  reminderDateTime: GraphDateTime | null;
  startDateTime: GraphDateTime | null;
  completedDateTime: GraphDateTime | null;
  categories: string[];
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface ChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
  createdDateTime: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  tenant: string;
}

// Input types for core operations
export interface CreateTaskInput {
  title: string;
  body?: string;
  dueDateTime?: string;
  reminderDateTime?: string;
  importance?: TaskImportance;
  startDateTime?: string;
  status?: TaskStatus;
  categories?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  body?: string;
  dueDateTime?: string;
  reminderDateTime?: string;
  importance?: TaskImportance;
  startDateTime?: string;
  status?: TaskStatus;
  categories?: string[];
}

export interface ListTasksOptions {
  status?: TaskStatus;
  top?: number;
  orderby?: string;
  select?: string;
  filter?: string;
}
