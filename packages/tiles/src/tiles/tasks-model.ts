import {
  formatDate,
  localDateString,
  t,
  type Locale,
  type TaskData,
  type TaskItem,
  type TasksConfig,
} from '@dashboard/shared';
import { addDays } from './calendar-model';

/** How long the "Undo" chip stays after a task was completed (docs/03-tiles.md §3). */
export const UNDO_MS = 5_000;
/** A change made on the tablet overrides the server's list for this long, covering a slow refresh. */
export const CHANGE_TTL_MS = 30_000;

/** A change made on the tablet that the server data may not show yet. */
export interface LocalChange {
  completed: boolean;
  /** Set after completing (unless completed tasks are shown anyway): until then the row offers "Undo". */
  undoUntil: number | null;
  expiresAt: number;
  /** The task as it was, so a row can stay on screen after the server dropped it from the list. */
  task: TaskItem;
}

export type DueState = 'none' | 'overdue' | 'today' | 'later';

export interface TaskRow {
  key: string;
  sourceId: string;
  taskId: string;
  title: string;
  /** `#rrggbb` of the list, or ''. */
  color: string;
  due: string;
  dueState: DueState;
  important: boolean;
  checked: boolean;
  /** Completed a moment ago: the row shows "Completed" and an undo chip. */
  undo: boolean;
}

export interface TaskGroup {
  /** List name when the tile groups by list, else null. */
  label: string | null;
  color: string;
  rows: TaskRow[];
}

export const taskKey = (task: Pick<TaskItem, 'sourceId' | 'id'>) => `${task.sourceId}:${task.id}`;

const COLOR = /^#[0-9a-fA-F]{6}$/;

function dueText(due: string, state: DueState, today: string, locale: Locale): string {
  if (state === 'none') return '';
  if (state === 'today') return t(locale, 'calendar.today');
  const short = formatDate(new Date(`${due}T12:00:00Z`), { locale, timeZone: 'UTC', style: 'short' });
  if (state === 'overdue') return `${t(locale, 'tasks.overdue')} · ${short}`;
  return due === addDays(today, 1) ? t(locale, 'calendar.tomorrow') : short;
}

export function dueLabel(
  row: Pick<TaskRow, 'due' | 'dueState'>,
  now: Date,
  timeZone: string,
  locale: Locale,
): string {
  return dueText(row.due, row.dueState, localDateString(now, timeZone), locale);
}

const NO_DUE = '9999-99-99';

/**
 * The tasks the tile shows at `now` (docs/03-tiles.md §3): the server's open tasks (or all with
 * `showCompleted`) with the changes made on the tablet applied, sorted and optionally grouped by list.
 * A task completed a moment ago stays as a row with an undo chip, also after the server left it out.
 */
export function buildTaskGroups(
  data: TaskData,
  config: TasksConfig,
  changes: ReadonlyMap<string, LocalChange>,
  now: Date,
  timeZone: string,
  locale: Locale,
): TaskGroup[] {
  const nowMs = now.getTime();
  const today = localDateString(now, timeZone);
  const colors = new Map(
    data.sources.map((s) => [s.id, s.color !== null && COLOR.test(s.color) ? s.color : '']),
  );
  const order = new Map(data.sources.map((s, index) => [s.id, index]));

  const candidates = new Map<string, TaskItem>(data.tasks.map((task) => [taskKey(task), task]));
  for (const [key, change] of changes) {
    if (change.expiresAt > nowMs && !candidates.has(key) && order.has(change.task.sourceId)) {
      candidates.set(key, change.task);
    }
  }

  const rows: { row: TaskRow; task: TaskItem }[] = [];
  for (const [key, task] of candidates) {
    const change = changes.get(key);
    const active = change !== undefined && change.expiresAt > nowMs;
    const checked = active ? change.completed : task.completed;
    const undo = active && change.completed && change.undoUntil !== null && change.undoUntil > nowMs;
    if (checked && !config.showCompleted && !undo) continue;
    const dueState: DueState =
      task.due === undefined ? 'none' : task.due < today ? 'overdue' : task.due === today ? 'today' : 'later';
    rows.push({
      task,
      row: {
        key,
        sourceId: task.sourceId,
        taskId: task.id,
        title: task.title || t(locale, 'calendar.noTitle'),
        color: colors.get(task.sourceId) ?? '',
        due: task.due ?? '',
        dueState,
        important: task.importance === 'high',
        checked,
        undo,
      },
    });
  }

  const listOrder = (a: TaskItem, b: TaskItem) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0);
  const byDue = (a: TaskItem, b: TaskItem) =>
    (a.due ?? NO_DUE).localeCompare(b.due ?? NO_DUE) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id);
  const byCreated = (a: TaskItem, b: TaskItem) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const compare =
    config.sortBy === 'created'
      ? byCreated
      : config.sortBy === 'list'
        ? (a: TaskItem, b: TaskItem) => listOrder(a, b) || byDue(a, b)
        : byDue;
  rows.sort((a, b) => compare(a.task, b.task));

  if (!config.groupByList) {
    return rows.length === 0 ? [] : [{ label: null, color: '', rows: rows.map((r) => r.row) }];
  }
  const groups = new Map<string, TaskGroup>();
  for (const { row } of rows) {
    let group = groups.get(row.sourceId);
    if (!group) {
      group = {
        label: data.sources.find((s) => s.id === row.sourceId)?.label ?? '',
        color: row.color,
        rows: [],
      };
      groups.set(row.sourceId, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()].sort(
    (a, b) => (order.get(a.rows[0]!.sourceId) ?? 0) - (order.get(b.rows[0]!.sourceId) ?? 0),
  );
}

/** The first `max` rows (over all groups); null keeps all. Groups left without rows are dropped. */
export function limitTaskGroups(groups: TaskGroup[], max: number | null): TaskGroup[] {
  if (max === null) return groups;
  let left = max;
  const limited: TaskGroup[] = [];
  for (const group of groups) {
    if (left <= 0) break;
    limited.push({ ...group, rows: group.rows.slice(0, left) });
    left -= group.rows.length;
  }
  return limited;
}
