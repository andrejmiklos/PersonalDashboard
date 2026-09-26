import { describe, expect, it } from 'vitest';
import { interpretKey, type KeyInput } from './keys';

const press = (key: string, extra: Partial<KeyInput> = {}) =>
  interpretKey({
    key,
    primary: false,
    shift: false,
    alt: false,
    inField: false,
    hasSelection: true,
    ...extra,
  });

describe('undo, redo and save', () => {
  it('reads Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', () => {
    expect(press('z', { primary: true })).toEqual({ type: 'undo' });
    expect(press('Z', { primary: true, shift: true })).toEqual({ type: 'redo' });
    expect(press('y', { primary: true })).toEqual({ type: 'redo' });
  });

  it('leaves Ctrl+Z to a text field', () => {
    expect(press('z', { primary: true, inField: true })).toBeNull();
    expect(press('y', { primary: true, inField: true })).toBeNull();
  });

  it('saves with Ctrl+S, also from a field', () => {
    expect(press('s', { primary: true })).toEqual({ type: 'save' });
    expect(press('S', { primary: true, inField: true })).toEqual({ type: 'save' });
  });

  it('does not need a selected tile', () => {
    expect(press('z', { primary: true, hasSelection: false })).toEqual({ type: 'undo' });
  });

  it('ignores other Ctrl shortcuts, so the browser keeps them', () => {
    expect(press('c', { primary: true })).toBeNull();
    expect(press('ArrowLeft', { primary: true })).toBeNull();
  });
});

describe('the selected tile', () => {
  it('moves with the arrows', () => {
    expect(press('ArrowLeft')).toEqual({ type: 'step', field: 'x', delta: -1 });
    expect(press('ArrowRight')).toEqual({ type: 'step', field: 'x', delta: 1 });
    expect(press('ArrowUp')).toEqual({ type: 'step', field: 'y', delta: -1 });
    expect(press('ArrowDown')).toEqual({ type: 'step', field: 'y', delta: 1 });
  });

  it('is resized with Shift and the arrows', () => {
    expect(press('ArrowLeft', { shift: true })).toEqual({ type: 'step', field: 'w', delta: -1 });
    expect(press('ArrowRight', { shift: true })).toEqual({ type: 'step', field: 'w', delta: 1 });
    expect(press('ArrowUp', { shift: true })).toEqual({ type: 'step', field: 'h', delta: -1 });
    expect(press('ArrowDown', { shift: true })).toEqual({ type: 'step', field: 'h', delta: 1 });
  });

  it('is removed with Delete or Backspace', () => {
    expect(press('Delete')).toEqual({ type: 'remove' });
    expect(press('Backspace')).toEqual({ type: 'remove' });
  });

  it('is deselected with Escape', () => {
    expect(press('Escape')).toEqual({ type: 'deselect' });
  });

  it('needs a selection', () => {
    for (const key of ['ArrowLeft', 'Delete', 'Escape']) {
      expect(press(key, { hasSelection: false }), key).toBeNull();
    }
  });

  it('leaves the keys to a focused field', () => {
    for (const key of ['ArrowLeft', 'Delete', 'Backspace', 'Escape']) {
      expect(press(key, { inField: true }), key).toBeNull();
    }
  });

  it('ignores Alt combinations', () => {
    expect(press('ArrowLeft', { alt: true })).toBeNull();
  });

  it('ignores other keys', () => {
    expect(press('a')).toBeNull();
    expect(press('Enter')).toBeNull();
  });
});
