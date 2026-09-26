import { useCallback, useState } from 'preact/hooks';
import { canRedo, canUndo, commit, createHistory, redo, replace, undo, type History } from './history';

export interface UseHistory<T> {
  value: T;
  /** A new step; edits with the same `key` in a row make one step. */
  set(next: T, key?: string): void;
  /** Changes the value without a step of its own. */
  replace(next: T): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

/** {@link History} as component state. */
export function useHistory<T>(initial: () => T): UseHistory<T> {
  const [history, setHistory] = useState<History<T>>(() => createHistory(initial()));
  return {
    value: history.present,
    set: useCallback((next: T, key?: string) => setHistory((h) => commit(h, next, key)), []),
    replace: useCallback((next: T) => setHistory((h) => replace(h, next)), []),
    undo: useCallback(() => setHistory((h) => undo(h)), []),
    redo: useCallback(() => setHistory((h) => redo(h)), []),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
