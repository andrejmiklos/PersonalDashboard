import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  redo,
  replace,
  undo,
  type History,
} from './history';

const steps = (h: History<number>, ...values: number[]) => values.reduce((acc, v) => commit(acc, v), h);

describe('commit, undo and redo', () => {
  it('walks back and forth through the steps', () => {
    let h = steps(createHistory(0), 1, 2, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(true);
  });

  it('does nothing at either end', () => {
    const fresh = createHistory(0);
    expect(undo(fresh)).toBe(fresh);
    expect(redo(fresh)).toBe(fresh);
    expect(canUndo(fresh)).toBe(false);
    expect(canRedo(fresh)).toBe(false);
  });

  it('drops the redo steps when something new is done after an undo', () => {
    let h = undo(steps(createHistory(0), 1, 2));
    h = commit(h, 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(1);
  });

  it('ignores a commit that changes nothing', () => {
    const h = steps(createHistory(0), 1);
    expect(commit(h, 1)).toBe(h);
  });

  it('keeps at most the limit of steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) h = undo(h);
    expect(canUndo(h)).toBe(false);
    expect(h.present).toBe(20);
  });
});

describe('edits with a key', () => {
  it('make one step while the key stays the same', () => {
    let h = createHistory('');
    for (const text of ['a', 'ab', 'abc']) h = commit(h, text, 'name');
    expect(h.past).toEqual(['']);
    expect(undo(h).present).toBe('');
  });

  it('start a new step when the key changes or an edit has no key', () => {
    let h = createHistory('');
    h = commit(h, 'a', 'name');
    h = commit(h, 'ab', 'label');
    h = commit(h, 'abc');
    h = commit(h, 'abcd', 'name');
    expect(h.past).toEqual(['', 'a', 'ab', 'abc']);
  });

  it('do not extend a step across an undo', () => {
    let h = createHistory('');
    h = commit(h, 'a', 'name');
    h = commit(h, 'ab', 'name');
    h = undo(h);
    h = commit(h, 'x', 'name');
    expect(h.past).toEqual(['']);
    expect(h.present).toBe('x');
  });
});

describe('replace', () => {
  it('changes the present without a step', () => {
    const h = replace(steps(createHistory(0), 1), 5);
    expect(h.present).toBe(5);
    expect(h.past).toEqual([0]);
    expect(undo(h).present).toBe(0);
  });

  it('ends a run of keyed edits', () => {
    let h = commit(createHistory(''), 'a', 'name');
    h = replace(h, 'A');
    h = commit(h, 'Ab', 'name');
    expect(h.past).toEqual(['', 'A']);
  });
});
