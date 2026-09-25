import type { TaskItem } from '@dashboard/shared';
import { z } from 'zod';
import { fetchJson, ProviderError } from '../types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_TITLE = 200;
/** Graph's page size; one page per list is enough for a wall display. */
const PAGE_SIZE = 100;

/** A To Do list of an account as discovered for the admin. */
export interface RemoteTaskList {
  id: string;
  label: string;
}

const taskListsSchema = z.object({
  value: z.array(z.object({ id: z.string().min(1), displayName: z.string() })),
});

/** Validates a `todo/lists` response and maps it (docs/05-integrations.md §2.3). */
export function mapTaskLists(raw: unknown): RemoteTaskList[] {
  const parsed = taskListsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderError(
      `Unexpected task list response at ${parsed.error.issues[0]?.path.join('.') || '(root)'}`,
    );
  }
  return parsed.data.value.map((list) => ({ id: list.id, label: list.displayName.trim() || list.id }));
}

const authorization = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export async function listTaskLists(accessToken: string): Promise<RemoteTaskList[]> {
  return mapTaskLists(
    await fetchJson(`${GRAPH}/me/todo/lists?$top=${PAGE_SIZE}`, authorization(accessToken)),
  );
}

const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  status: z.string(),
  importance: z.string().optional(),
  createdDateTime: z.string().optional(),
  dueDateTime: z.object({ dateTime: z.string() }).nullish(),
});

const taskListSchema = z.object({ value: z.array(z.unknown()) });

/** A due date is a day: only the date part is taken, whatever time zone Graph names. */
function dueDate(due: { dateTime: string } | null | undefined): string | undefined {
  const day = due?.dateTime.slice(0, 10);
  return day !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

/** Maps one Graph task; null when it does not have the expected shape. */
export function mapTask(raw: unknown, sourceId: string): TaskItem | null {
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return null;
  const task = parsed.data;
  const created = task.createdDateTime ? new Date(task.createdDateTime) : null;
  const due = dueDate(task.dueDateTime);
  return {
    id: task.id,
    sourceId,
    title: (task.title ?? '').trim().slice(0, MAX_TITLE),
    ...(due !== undefined && { due }),
    importance: task.importance === 'high' || task.importance === 'low' ? task.importance : 'normal',
    completed: task.status === 'completed',
    createdAt:
      created !== null && !Number.isNaN(created.getTime())
        ? created.toISOString()
        : new Date(0).toISOString(),
  };
}

/**
 * Maps the tasks of one list. The response must have the expected shape, but a single odd task is skipped
 * instead of failing the whole list.
 */
export function mapTasks(raw: unknown, sourceId: string): TaskItem[] {
  const parsed = taskListSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError('Unexpected task response shape');
  return parsed.data.value.flatMap((task) => mapTask(task, sourceId) ?? []);
}

/** Open tasks of one list, or with `includeCompleted` all of its first page. */
export async function fetchTasks(
  accessToken: string,
  listId: string,
  sourceId: string,
  includeCompleted: boolean,
): Promise<TaskItem[]> {
  const filter = includeCompleted ? '' : `&$filter=${encodeURIComponent("status ne 'completed'")}`;
  const raw = await fetchJson(
    `${GRAPH}/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=${PAGE_SIZE}${filter}`,
    authorization(accessToken),
  );
  return mapTasks(raw, sourceId);
}
