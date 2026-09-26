// What `npm run layout:import` does with a file: update the layout of the same name, or create one.

export interface ExistingLayout {
  id: string;
  name: string;
  version: number;
}

export type ImportPlan =
  | { action: 'create' }
  | { action: 'update'; id: string; version: number }
  /** Several layouts have the name: which one to replace is not for a script to guess. */
  | { action: 'ambiguous'; ids: string[] };

/**
 * A layout file is matched to a saved layout by its name, so importing the same file again updates the layout
 * instead of adding a copy. `forceCreate` adds a new one even when the name exists.
 */
export function planImport(
  existing: readonly ExistingLayout[],
  name: unknown,
  forceCreate: boolean,
): ImportPlan {
  if (forceCreate || typeof name !== 'string') return { action: 'create' };
  const same = existing.filter((layout) => layout.name === name.trim());
  if (same.length === 0) return { action: 'create' };
  const [only] = same;
  if (same.length === 1 && only) return { action: 'update', id: only.id, version: only.version };
  return { action: 'ambiguous', ids: same.map((layout) => layout.id) };
}
