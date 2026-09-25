import { TILE_TYPES, type TaskData, type TaskItem, type TasksConfig } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import { tasksScale } from './tasks';
import {
  buildTaskGroups,
  dueLabel,
  limitTaskGroups,
  taskKey,
  UNDO_MS,
  type LocalChange,
  type TaskRow,
} from './tasks-model';

// Fictional lists and tasks used only in tests. "Now" is Thursday 11:00 in Bratislava (UTC+1).
const TZ = 'Europe/Bratislava';
const NOW = new Date('2026-01-15T10:00:00.000Z');
const config = { ...TILE_TYPES.tasks.configDefaults, sourceIds: ['a', 'b'] } as TasksConfig;

const task = (
  id: string,
  sourceId: string,
  title: string,
  created: string,
  extra: Partial<TaskItem> = {},
): TaskItem => ({
  id,
  sourceId,
  title,
  importance: 'normal',
  completed: false,
  createdAt: created,
  ...extra,
});

const data: TaskData = {
  sources: [
    { id: 'a', label: 'Home', color: '#4f9dff' },
    { id: 'b', label: 'Work', color: 'red' },
  ],
  tasks: [
    task('t1', 'a', 'Overdue call', '2026-01-02T08:00:00Z', { due: '2026-01-14', importance: 'high' }),
    task('t2', 'a', 'Today thing', '2026-01-03T08:00:00Z', { due: '2026-01-15' }),
    task('t3', 'b', 'Tomorrow thing', '2026-01-04T08:00:00Z', { due: '2026-01-16' }),
    task('t4', 'b', 'Later thing', '2026-01-05T08:00:00Z', { due: '2026-02-01' }),
    task('t7', 'b', 'Someday newer', '2026-01-08T08:00:00Z'),
    task('t5', 'a', 'Someday older', '2026-01-01T08:00:00Z'),
    task('t6', 'b', '', '2026-01-06T08:00:00Z', { completed: true }),
  ],
};

const build = (
  over: Partial<TasksConfig> = {},
  changes = new Map<string, LocalChange>(),
  now = NOW,
  d = data,
) => buildTaskGroups(d, { ...config, ...over }, changes, now, TZ, 'en');
const titles = (groups: ReturnType<typeof build>) => groups.flatMap((g) => g.rows.map((r) => r.title));
const change = (t: TaskItem, over: Partial<LocalChange> = {}): LocalChange => ({
  completed: true,
  undoUntil: null,
  expiresAt: NOW.getTime() + 30_000,
  task: t,
  ...over,
});

describe('buildTaskGroups', () => {
  it('lists open tasks by due date, those without one last and the oldest first', () => {
    expect(titles(build())).toEqual([
      'Overdue call',
      'Today thing',
      'Tomorrow thing',
      'Later thing',
      'Someday older',
      'Someday newer',
    ]);
  });

  it('sorts by creation or by list when configured', () => {
    expect(titles(build({ sortBy: 'created' }))).toEqual([
      'Someday older',
      'Overdue call',
      'Today thing',
      'Tomorrow thing',
      'Later thing',
      'Someday newer',
    ]);
    expect(titles(build({ sortBy: 'list' }))).toEqual([
      'Overdue call',
      'Today thing',
      'Someday older',
      'Tomorrow thing',
      'Later thing',
      'Someday newer',
    ]);
  });

  it('shows one group, or one per list in the order of the lists when grouping', () => {
    const [only] = build();
    expect(only).toMatchObject({ label: null });
    const groups = build({ groupByList: true });
    expect(groups.map((g) => [g.label, g.color, g.rows.length])).toEqual([
      ['Home', '#4f9dff', 3],
      ['Work', '', 3],
    ]);
    expect(groups[0]?.rows.map((r) => r.title)).toEqual(['Overdue call', 'Today thing', 'Someday older']);
  });

  it('marks due states and importance, and takes list colours that are #rrggbb', () => {
    const rows = build()[0]!.rows;
    const byTitle = (title: string): TaskRow => rows.find((r) => r.title === title)!;
    expect(byTitle('Overdue call')).toMatchObject({ dueState: 'overdue', important: true, color: '#4f9dff' });
    expect(byTitle('Today thing').dueState).toBe('today');
    expect(byTitle('Tomorrow thing')).toMatchObject({ dueState: 'later', color: '' });
    expect(byTitle('Someday older')).toMatchObject({ dueState: 'none', due: '', important: false });
  });

  it('labels due dates for the day, its neighbour and the rest', () => {
    const label = (title: string) =>
      dueLabel(
        build()[0]!.rows.find((r) => r.title === title)!,
        NOW,
        TZ,
        'en',
      );
    expect(label('Today thing')).toBe('Today');
    expect(label('Tomorrow thing')).toBe('Tomorrow');
    expect(label('Later thing')).toMatch(/^Sun/);
    expect(label('Overdue call')).toMatch(/^Overdue · Wed/);
    expect(label('Someday older')).toBe('');
    expect(dueLabel({ due: '2026-01-14', dueState: 'overdue' }, NOW, TZ, 'sk')).toMatch(/^Po termíne · St/);
  });

  it('shows completed tasks checked only with showCompleted, and gives untitled ones a title', () => {
    expect(titles(build())).not.toContain('(no title)');
    const rows = build({ showCompleted: true })[0]!.rows;
    expect(rows.find((r) => r.taskId === 't6')).toMatchObject({ title: '(no title)', checked: true });
    expect(rows.filter((r) => r.checked)).toHaveLength(1);
  });

  it('is empty when nothing is open', () => {
    expect(build({}, new Map(), NOW, { sources: data.sources, tasks: [data.tasks[6]!] })).toEqual([]);
    expect(build({}, new Map(), NOW, { sources: [], tasks: [] })).toEqual([]);
  });

  describe('changes made on the tablet', () => {
    const t2 = data.tasks[1]!;

    it('keeps a task completed a moment ago as a row with an undo chip, then lets it go', () => {
      const changes = new Map([[taskKey(t2), change(t2, { undoUntil: NOW.getTime() + UNDO_MS })]]);
      const row = build({}, changes)[0]!.rows.find((r) => r.taskId === 't2');
      expect(row).toMatchObject({ checked: true, undo: true });

      const later = new Date(NOW.getTime() + UNDO_MS + 1);
      expect(titles(build({}, changes, later))).not.toContain('Today thing');
    });

    it('hides a task at once when it is completed and no undo is offered yet', () => {
      const changes = new Map([[taskKey(t2), change(t2)]]);
      expect(titles(build({}, changes))).not.toContain('Today thing');
    });

    it('keeps the row after the server left the task out of its list', () => {
      const without: TaskData = { ...data, tasks: data.tasks.filter((t) => t.id !== 't2') };
      const changes = new Map([[taskKey(t2), change(t2, { undoUntil: NOW.getTime() + UNDO_MS })]]);
      expect(titles(build({}, changes, NOW, without))).toContain('Today thing');
    });

    it('shows a reopened task again although the server list lacks it', () => {
      const t6 = data.tasks[6]!;
      const open: TaskData = { ...data, tasks: data.tasks.filter((t) => t.id !== 't6') };
      const changes = new Map([[taskKey(t6), change(t6, { completed: false })]]);
      const row = build({}, changes, NOW, open)[0]!.rows.find((r) => r.taskId === 't6');
      expect(row).toMatchObject({ checked: false, undo: false });
    });

    it('unchecks a completed task that stays visible with showCompleted', () => {
      const t6 = data.tasks[6]!;
      const changes = new Map([[taskKey(t6), change(t6, { completed: false })]]);
      const rows = build({ showCompleted: true }, changes)[0]!.rows;
      expect(rows.find((r) => r.taskId === 't6')?.checked).toBe(false);
    });

    it('does not offer undo when completed tasks stay visible anyway', () => {
      const changes = new Map([[taskKey(t2), change(t2, { undoUntil: NOW.getTime() + UNDO_MS })]]);
      const row = build({ showCompleted: true }, changes)[0]!.rows.find((r) => r.taskId === 't2');
      expect(row).toMatchObject({ checked: true, undo: true });
    });

    it('ignores changes that expired and changes of lists that are gone', () => {
      const expired = new Map([[taskKey(t2), change(t2, { expiresAt: NOW.getTime() - 1 })]]);
      expect(titles(build({}, expired))).toContain('Today thing');

      const gone = task('x', 'zzz', 'Removed list task', '2026-01-01T00:00:00Z');
      const orphan = new Map([[taskKey(gone), change(gone, { completed: false })]]);
      expect(titles(build({}, orphan))).not.toContain('Removed list task');
    });
  });
});

describe('limitTaskGroups', () => {
  const groups = build({ groupByList: true });

  it('keeps everything without a limit', () => {
    expect(limitTaskGroups(groups, null)).toBe(groups);
  });

  it('counts rows over all groups and drops groups that are cut off', () => {
    const three = limitTaskGroups(groups, 3);
    expect(three.map((g) => g.rows.length)).toEqual([3]);
    const four = limitTaskGroups(groups, 4);
    expect(four.map((g) => g.rows.length)).toEqual([3, 1]);
    expect(limitTaskGroups(groups, 99).flatMap((g) => g.rows)).toHaveLength(6);
  });
});

describe('tasksScale', () => {
  const box = (w: number, h: number) => ({ refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) });

  it('stays between the limits', () => {
    expect(tasksScale(box(308, 288))).toBeGreaterThanOrEqual(0.85);
    expect(tasksScale(box(308, 288))).toBeLessThan(1.1);
    expect(tasksScale(box(600, 700))).toBe(1.4);
    expect(tasksScale(box(50, 50))).toBe(0.85);
  });
});
