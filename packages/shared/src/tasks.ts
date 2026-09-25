// Normalised task of `GET /api/v1/data/tasks` (docs/03-tiles.md §3).
import type { SourceInfo } from './sources';

export const TASK_IMPORTANCES = ['low', 'normal', 'high'] as const;
export type TaskImportance = (typeof TASK_IMPORTANCES)[number];

export interface TaskItem {
  /** Provider task id; unique within one source. */
  id: string;
  /** The `sources.id` of the list the task belongs to. */
  sourceId: string;
  title: string;
  /** Due date `YYYY-MM-DD`; To Do tasks are due on a day, not at a time. */
  due?: string;
  importance: TaskImportance;
  completed: boolean;
  /** ISO instant (UTC). */
  createdAt: string;
}

/** Payload of `GET /api/v1/data/tasks`. */
export interface TaskData {
  /** The requested lists that exist and are enabled, in the requested order. */
  sources: SourceInfo[];
  /** Ordered by due date (tasks without one last), then by creation; the tile sorts as configured. */
  tasks: TaskItem[];
}
