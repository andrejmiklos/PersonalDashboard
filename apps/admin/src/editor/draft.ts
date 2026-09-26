import type { LayoutBody } from '../layouts-model';

// An unsaved layout is kept in the browser (localStorage) so that a closed tab or a dead battery does not lose
// the work. The draft belongs to one saved version: when the layout was saved elsewhere since, it is dropped.

export interface Draft {
  /** The version of the layout the draft was started from. */
  baseVersion: number;
  body: LayoutBody;
}

export function draftKey(layoutId: string): string {
  return `admin.draft.${layoutId}`;
}

export function serializeDraft(draft: Draft): string {
  return JSON.stringify(draft);
}

/** A stored draft, or null when the text is not one (damaged, or written by another version of the app). */
export function parseDraft(text: string | null): Draft | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { baseVersion, body } = parsed as Record<string, unknown>;
  if (!Number.isInteger(baseVersion) || typeof body !== 'object' || body === null) return null;
  const layout = body as Record<string, unknown>;
  if (typeof layout['name'] !== 'string' || !Array.isArray(layout['tiles'])) return null;
  if (typeof layout['grid'] !== 'object' || typeof layout['theme'] !== 'object') return null;
  return { baseVersion: baseVersion as number, body: body as LayoutBody };
}

/**
 * The body to continue with: the draft's, when it is based on the version the server has now and differs from
 * what the server stored. Otherwise there is nothing to restore.
 */
export function restorable(
  draft: Draft | null,
  server: { version: number; json: string },
): LayoutBody | null {
  if (draft === null || draft.baseVersion !== server.version) return null;
  return JSON.stringify(draft.body) === server.json ? null : draft.body;
}
