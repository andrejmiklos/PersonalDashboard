import { describe, expect, it } from 'vitest';
import { planImport, type ExistingLayout } from './layout-plan.ts';

const layouts: ExistingLayout[] = [
  { id: 'lay_aaaaaaaaaaaaaaaa', name: 'Morning', version: 3 },
  { id: 'lay_bbbbbbbbbbbbbbbb', name: 'Evening', version: 1 },
];

describe('planImport', () => {
  it('creates a layout whose name is new', () => {
    expect(planImport(layouts, 'Night', false)).toEqual({ action: 'create' });
    expect(planImport([], 'Morning', false)).toEqual({ action: 'create' });
  });

  it('updates the layout of the same name, at the version it has now', () => {
    expect(planImport(layouts, 'Morning', false)).toEqual({
      action: 'update',
      id: 'lay_aaaaaaaaaaaaaaaa',
      version: 3,
    });
  });

  it('ignores spaces around the name, but not the case', () => {
    expect(planImport(layouts, '  Morning ', false).action).toBe('update');
    expect(planImport(layouts, 'morning', false).action).toBe('create');
  });

  it('refuses to guess when several layouts have the name', () => {
    const duplicates = [...layouts, { id: 'lay_cccccccccccccccc', name: 'Morning', version: 1 }];
    expect(planImport(duplicates, 'Morning', false)).toEqual({
      action: 'ambiguous',
      ids: ['lay_aaaaaaaaaaaaaaaa', 'lay_cccccccccccccccc'],
    });
  });

  it('creates a copy on request, even when the name exists', () => {
    expect(planImport(layouts, 'Morning', true)).toEqual({ action: 'create' });
  });

  it('leaves a file without a usable name to the server, which refuses it', () => {
    expect(planImport(layouts, undefined, false)).toEqual({ action: 'create' });
    expect(planImport(layouts, 42, false)).toEqual({ action: 'create' });
  });
});
