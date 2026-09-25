import {
  t,
  TILE_TYPES,
  type DataEnvelope,
  type TaskData,
  type TaskItem,
  type TasksConfig,
} from '@dashboard/shared';
import { isStale, startPoller, type DataResult } from '../data';
import {
  buildTaskGroups,
  CHANGE_TTL_MS,
  dueLabel,
  limitTaskGroups,
  taskKey,
  UNDO_MS,
  type LocalChange,
  type TaskGroup,
  type TaskRow,
} from './tasks-model';
import {
  clamp,
  cutOverflow,
  element,
  errorText,
  setText,
  showMessage,
  type TileBox,
  type TileContext,
  type TileInstance,
  updatedText,
} from './types';

const POLL_MS = 60_000;
const RETRY_MS = 30_000;
const NOTE_MS = 4_000;

/** Font size of the tile in rem; rows have a fixed minimum height so the touch targets stay large. */
export function tasksScale(box: TileBox): number {
  return clamp(Math.min(box.refWidth / 320, box.refHeight / 280), 0.85, 1.4);
}

function renderRow(row: TaskRow, busy: boolean, label: string, ctx: TileContext, parent: HTMLElement): void {
  const classes = [
    'task-row',
    row.checked ? 'task-checked' : '',
    row.undo ? 'task-undo' : '',
    busy ? 'task-busy' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const el = element('div', classes, parent);
  const bar = element('span', 'task-bar', el);
  if (row.color) bar.style.background = row.color;

  const check = element('button', 'task-check', el);
  check.setAttribute('type', 'button');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(row.checked));
  check.dataset['action'] = 'toggle';
  check.dataset['key'] = row.key;
  element('span', 'task-box', check);

  const main = element('div', 'task-main', el);
  const title = element('div', 'task-title', main);
  title.textContent = row.title;
  if (row.important) element('span', 'task-important', title).textContent = ' !';
  const detail = row.undo ? t(ctx.locale, 'tasks.done') : label;
  if (detail)
    element('div', `task-due task-due-${row.undo ? 'done' : row.dueState}`, main).textContent = detail;

  if (row.undo) {
    const undo = element('button', 'task-undo-chip', el);
    undo.setAttribute('type', 'button');
    undo.dataset['action'] = 'toggle';
    undo.dataset['key'] = row.key;
    undo.textContent = t(ctx.locale, 'tasks.undo');
  }
}

function renderGroups(
  groups: TaskGroup[],
  config: TasksConfig,
  busy: ReadonlySet<string>,
  now: Date,
  ctx: TileContext,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'tasks-group';
    if (group.label !== null) {
      const head = element('div', 'tasks-group-head', groupEl);
      const dot = element('span', 'tasks-dot', head);
      if (group.color) dot.style.background = group.color;
      element('span', 'tasks-group-name', head).textContent = group.label;
    }
    for (const row of group.rows) {
      const label = config.showDueDate ? dueLabel(row, now, ctx.timezone, ctx.locale) : '';
      renderRow(row, busy.has(row.key), label, ctx, groupEl);
    }
    fragment.appendChild(groupEl);
  }
  return fragment;
}

/**
 * Tasks tile (docs/03-tiles.md §3): open To Do tasks; the checkbox completes a task (optimistic, "Undo" for
 * five seconds), a checked task shown with `showCompleted` reopens on tap. It never creates, edits or deletes.
 */
export function createTasks(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.tasks.configDefaults, ...ctx.config } as TasksConfig;
  ctx.el.classList.add('tasks');

  const message = element('div', 'tasks-message', ctx.el);
  const body = element('div', 'tasks-body', ctx.el);
  const list = element('div', 'tasks-list', body);
  const note = element('div', 'tasks-note', body);
  const updated = element('div', 'tasks-updated', body);
  note.hidden = true;

  let scale: number | null = null;
  let envelope: DataEnvelope<TaskData> | null = null;
  const changes = new Map<string, LocalChange>();
  const busy = new Set<string>();
  let shown = '';
  let stopped = false;
  let wake: number | undefined;
  let noteTimer: number | undefined;

  /** Next moment the list may change by itself: a new minute (due dates), an undo chip or a change expiring. */
  function schedule(): void {
    window.clearTimeout(wake);
    const now = Date.now();
    let next = now + 60_000 - (now % 60_000) + 20;
    for (const change of changes.values()) {
      if (change.undoUntil !== null && change.undoUntil > now) next = Math.min(next, change.undoUntil + 20);
      next = Math.min(next, change.expiresAt + 20);
    }
    wake = window.setTimeout(render, Math.max(next - now, 250));
  }

  function render(): void {
    if (scale === null || !envelope) return;
    const now = new Date();
    for (const [key, change] of changes) if (change.expiresAt <= now.getTime()) changes.delete(key);
    schedule();

    const groups = limitTaskGroups(
      buildTaskGroups(envelope.data, config, changes, now, ctx.timezone, ctx.locale),
      config.maxItems,
    );
    if (groups.length === 0) {
      showMessage(message, body, t(ctx.locale, 'tasks.empty'));
      shown = '';
      return;
    }
    message.hidden = true;
    body.hidden = false;

    const stale = isStale(envelope, now.getTime());
    ctx.el.classList.toggle('is-stale', stale);
    setText(updated, updatedText(ctx, envelope, stale));
    updated.hidden = !stale;

    const signature = JSON.stringify([groups, [...busy], config.showDueDate, scale, ctx.timezone]);
    if (signature === shown) return;
    shown = signature;
    list.replaceChildren(renderGroups(groups, config, busy, now, ctx));
    cutOverflow(list, '.tasks-group-head, .task-row', '.tasks-group-head');
  }

  function showNote(text: string): void {
    setText(note, text);
    note.hidden = false;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => {
      note.hidden = true;
    }, NOTE_MS);
  }

  function onResult(result: DataResult<TaskData>): void {
    if (result.kind === 'ok') {
      envelope = result.envelope;
    } else if (!envelope) {
      showMessage(message, body, errorText(ctx.locale, result.code));
      return;
    }
    render();
  }

  function taskOf(key: string): TaskItem | undefined {
    return changes.get(key)?.task ?? envelope?.data.tasks.find((task) => taskKey(task) === key);
  }

  async function toggle(key: string): Promise<void> {
    const task = taskOf(key);
    if (!task || busy.has(key)) return;
    const change = changes.get(key);
    const target = !(change && change.expiresAt > Date.now() ? change.completed : task.completed);

    busy.add(key);
    changes.set(key, { completed: target, undoUntil: null, expiresAt: Date.now() + CHANGE_TTL_MS, task });
    render();

    const result = await ctx.data.completeTask(task.sourceId, task.id, target);
    busy.delete(key);
    if (stopped) return;
    if (result.kind === 'ok') {
      const now = Date.now();
      const undoUntil = target && !config.showCompleted ? now + UNDO_MS : null;
      changes.set(key, { completed: target, undoUntil, expiresAt: now + CHANGE_TTL_MS, task });
      // The Worker dropped its cached list; load the fresh one so the offline copy is right too.
      void ctx.data.load<TaskData>('tasks', query).then((fresh) => {
        if (!stopped && fresh.kind === 'ok') onResult(fresh);
      });
    } else {
      changes.delete(key);
      showNote(t(ctx.locale, result.code === 'reauth_required' ? 'data.reauth' : 'tasks.failed'));
    }
    render();
  }

  list.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-action="toggle"]');
    const key = target?.dataset['key'];
    if (key !== undefined) void toggle(key);
  });

  if (!Array.isArray(config.sourceIds) || config.sourceIds.length === 0) {
    showMessage(message, body, t(ctx.locale, 'tasks.noSources'));
    return { resize: () => {}, destroy: () => ctx.el.replaceChildren() };
  }

  showMessage(message, body, t(ctx.locale, 'state.loading'));
  const query = { sources: config.sourceIds.join(','), completed: config.showCompleted ? '1' : '0' };
  const poller = startPoller({
    load: () => ctx.data.load<TaskData>('tasks', query),
    peek: () => ctx.data.peek<TaskData>('tasks', query),
    onResult,
    intervalMs: POLL_MS,
    retryMs: RETRY_MS,
  });

  return {
    resize(box) {
      scale = tasksScale(box);
      ctx.el.style.fontSize = `${scale}rem`;
      shown = '';
      render();
    },
    destroy() {
      stopped = true;
      poller.stop();
      window.clearTimeout(wake);
      window.clearTimeout(noteTimer);
      ctx.el.replaceChildren();
    },
  };
}
