import type { BoxField } from './geometry';

export type KeyCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save' }
  | { type: 'deselect' }
  | { type: 'remove' }
  | { type: 'step'; field: BoxField; delta: 1 | -1 };

export interface KeyInput {
  key: string;
  /** Ctrl, or Cmd on a Mac. */
  primary: boolean;
  shift: boolean;
  alt: boolean;
  /** The focus is in a text field, a select or a slider: those keep their own keys. */
  inField: boolean;
  hasSelection: boolean;
}

const ARROWS: Record<string, { move: BoxField; resize: BoxField; delta: 1 | -1 }> = {
  ArrowLeft: { move: 'x', resize: 'w', delta: -1 },
  ArrowRight: { move: 'x', resize: 'w', delta: 1 },
  ArrowUp: { move: 'y', resize: 'h', delta: -1 },
  ArrowDown: { move: 'y', resize: 'h', delta: 1 },
};

/**
 * What a key press means in the editor (docs/04-layouts-and-editor.md §2.2): arrows move the selected tile,
 * Shift+arrows resize it, Delete removes it, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+S saves.
 */
export function interpretKey(input: KeyInput): KeyCommand | null {
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (input.primary && !input.alt) {
    if (key === 's') return { type: 'save' };
    // In a text field Ctrl+Z is the field's own undo.
    if (input.inField) return null;
    if (key === 'z') return input.shift ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    return null;
  }
  if (input.inField || input.alt) return null;
  if (key === 'Escape') return input.hasSelection ? { type: 'deselect' } : null;
  if (!input.hasSelection) return null;
  if (key === 'Delete' || key === 'Backspace') return { type: 'remove' };
  const arrow = ARROWS[key];
  if (arrow) return { type: 'step', field: input.shift ? arrow.resize : arrow.move, delta: arrow.delta };
  return null;
}
