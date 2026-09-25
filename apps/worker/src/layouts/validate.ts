import {
  configDefaultsFor,
  findOverlaps,
  isInsideGrid,
  MAX_LAYOUT_BYTES,
  sourceKindFor,
  TILE_TYPES,
  type LayoutDocument,
  type Tile,
} from '@dashboard/shared';
import { ApiError } from '../errors';
import { configSchemaFor, type LayoutInput } from './schema';

/** The stored part of a layout; id and version live in their own columns. */
export type LayoutBody = Omit<LayoutDocument, 'id' | 'version'>;

function invalid(message: string): ApiError {
  return new ApiError(400, 'validation_error', message);
}

/** Checks that referenced sources exist, are enabled and of the right kind. */
async function checkSources(db: D1Database, kind: 'calendar' | 'task_list', ids: string[], where: string) {
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id FROM sources WHERE kind = ? AND enabled = 1 AND id IN (${placeholders})`)
    .bind(kind, ...ids)
    .all<{ id: string }>();
  const found = new Set(results.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw invalid(`${where}.config.sourceIds: unknown or disabled source ${missing[0]}`);
  }
}

/**
 * Semantic validation on top of the zod shape (docs/04-layouts-and-editor.md §1).
 * Returns the body to store, with config defaults filled in.
 */
export async function validateLayout(db: D1Database, input: LayoutInput): Promise<LayoutBody> {
  const ids = new Set<string>();
  const tiles: Tile[] = [];

  for (const [index, tile] of input.tiles.entries()) {
    const where = `tiles.${index}`;
    const meta = TILE_TYPES[tile.type];
    if (ids.has(tile.id)) throw invalid(`${where}.id: duplicate tile id`);
    ids.add(tile.id);
    if (!isInsideGrid(tile)) {
      throw invalid(`${where}: outside the ${input.grid.cols}×${input.grid.rows} grid`);
    }
    if (tile.w < meta.minW || tile.h < meta.minH) {
      throw invalid(`${where}: ${tile.type} needs at least ${meta.minW}×${meta.minH} cells`);
    }

    const parsed = configSchemaFor(tile.type, tile.config).safeParse(tile.config);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue && issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
      throw invalid(`${where}.config${path}: ${issue?.message ?? 'invalid'}`);
    }
    const config: Record<string, unknown> = { ...configDefaultsFor(tile.type, tile.config), ...parsed.data };
    const sourceKind = sourceKindFor(tile.type, config);
    if (sourceKind) {
      await checkSources(db, sourceKind, config['sourceIds'] as string[], where);
    }
    tiles.push({ id: tile.id, type: tile.type, x: tile.x, y: tile.y, w: tile.w, h: tile.h, config });
  }

  const overlap = findOverlaps(tiles)[0];
  if (overlap) throw invalid(`tiles: ${overlap[0]} overlaps ${overlap[1]}`);

  const body: LayoutBody = {
    schemaVersion: input.schemaVersion,
    name: input.name,
    grid: input.grid,
    theme: input.theme.accent === undefined ? {} : { accent: input.theme.accent },
    tiles,
  };
  if (new TextEncoder().encode(JSON.stringify(body)).length > MAX_LAYOUT_BYTES) {
    throw invalid(`layout exceeds ${MAX_LAYOUT_BYTES} bytes`);
  }
  return body;
}
