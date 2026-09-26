import { GRID_COLS, GRID_ROWS, LAYOUT_SCHEMA_VERSION, type LayoutDocument } from '@dashboard/shared';

/** A layout as `POST` and `PUT` take it: the server owns `id` and `version`. */
export type LayoutBody = Omit<LayoutDocument, 'id' | 'version'>;

const MAX_NAME = 64;

export function emptyLayout(name: string): LayoutBody {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    name,
    grid: { cols: GRID_COLS, rows: GRID_ROWS, gap: 8 },
    theme: {},
    tiles: [],
  };
}

/** The document without id and version, so the file imports into any Worker. */
export function toBody(layout: LayoutDocument): LayoutBody {
  return {
    schemaVersion: layout.schemaVersion,
    name: layout.name,
    grid: layout.grid,
    theme: layout.theme,
    tiles: layout.tiles,
  };
}

/**
 * A layout file as `POST` takes it, or null when it is not a JSON object. Only the shape of the envelope is
 * checked here: the server validates everything else and names the first bad field.
 */
export function parseImport(text: string): LayoutBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const body: Record<string, unknown> = { ...parsed };
  delete body['id'];
  delete body['version'];
  return body as unknown as LayoutBody;
}

/** A layout name as the API accepts it: 1–64 characters after trimming. */
export function cleanName(value: string): string | null {
  const name = value.trim();
  return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

/** `Morning layout` → `morning-layout.json`; accents are dropped. */
export function exportFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'layout' : slug}.json`;
}

export function formatUpdated(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
