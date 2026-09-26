// Undo and redo of the editor: every edit is a step, except a run of edits with the same key (typing in one
// text field), which is one step. At most HISTORY_LIMIT steps are kept.

export const HISTORY_LIMIT = 100;

export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
  /** The key of the last edit, so that the next edit with the same key extends that step. */
  lastKey: string | null;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

/** `next` becomes the present. Without a key, or with another key than the last edit, it is a new step. */
export function commit<T>(history: History<T>, next: T, key?: string): History<T> {
  if (Object.is(next, history.present)) return history;
  if (key !== undefined && key === history.lastKey) return { ...history, present: next, future: [] };
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key ?? null,
  };
}

/** Changes the present without a step of its own, e.g. what the server stored after a save. */
export function replace<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next, lastKey: null };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    lastKey: null,
  };
}
