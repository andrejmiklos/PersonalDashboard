import { fieldsFor, type GridBox, type SourceRecord, type Tile } from '@dashboard/shared';
import type { MessageKey } from '@dashboard/shared';
import { useI18n } from '../i18n';
import type { LayoutBody } from '../layouts-model';
import { FieldEditor } from './field-editor';
import { stepBox, type BoxField } from './geometry';
import { configProblem } from './tile-model';

const BOX_FIELDS: readonly { field: BoxField; label: MessageKey }[] = [
  { field: 'x', label: 'admin.editor.x' },
  { field: 'y', label: 'admin.editor.y' },
  { field: 'w', label: 'admin.editor.w' },
  { field: 'h', label: 'admin.editor.h' },
];

/** The stepper buttons move a tile one cell at a time: the precise way to place it on a phone. */
function PositionSteppers({
  tile,
  tiles,
  onBox,
}: {
  tile: Tile;
  tiles: readonly Tile[];
  onBox(box: GridBox): void;
}) {
  const { t } = useI18n();
  return (
    <div class="steppers">
      {BOX_FIELDS.map(({ field, label }) => {
        const less = stepBox(tiles, tile, field, -1);
        const more = stepBox(tiles, tile, field, 1);
        return (
          <div key={field} class="stepper">
            <span class="muted">{t(label)}</span>
            <div class="stepper-controls">
              <button
                type="button"
                aria-label={`${t(label)}: ${t('admin.editor.less')}`}
                disabled={less === null}
                onClick={() => less && onBox(less)}
              >
                −
              </button>
              <output>{tile[field]}</output>
              <button
                type="button"
                aria-label={`${t(label)}: ${t('admin.editor.more')}`}
                disabled={more === null}
                onClick={() => more && onBox(more)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TileProperties({
  tile,
  tiles,
  sources,
  onBox,
  onSetting,
  onRemove,
}: {
  tile: Tile;
  tiles: readonly Tile[];
  sources: readonly SourceRecord[];
  onBox(box: GridBox): void;
  onSetting(key: string, value: unknown): void;
  onRemove(): void;
}) {
  const { t } = useI18n();
  const problem = configProblem(tile);
  return (
    <div class="panel">
      <h2>{t(`tile.${tile.type}`)}</h2>
      {problem && (
        <div class="note warn" role="alert">
          {t(problem)}
        </div>
      )}
      <h3>{t('admin.editor.position')}</h3>
      <PositionSteppers tile={tile} tiles={tiles} onBox={onBox} />
      <div class="fields">
        {fieldsFor(tile.type, tile.config).map((field) => (
          <FieldEditor key={field.key} field={field} tile={tile} sources={sources} onChange={onSetting} />
        ))}
      </div>
      <div class="actions">
        <button type="button" class="danger" onClick={onRemove}>
          {t('admin.editor.delete')}
        </button>
      </div>
    </div>
  );
}

/** Settings of the layout itself, shown while no tile is selected. */
export function LayoutProperties({
  layout,
  onChange,
}: {
  layout: LayoutBody;
  /** `key`: edits with the same key in a row are one step of the undo history. */
  onChange(layout: LayoutBody, key?: string): void;
}) {
  const { t } = useI18n();
  const accent = layout.theme.accent;
  return (
    <div class="panel">
      <h2>{t('admin.editor.layoutProps')}</h2>
      <div class="fields">
        <label class="field">
          <span>{t('admin.editor.gap')}</span>
          <input
            type="range"
            min={0}
            max={32}
            step={1}
            value={layout.grid.gap}
            onInput={(event) =>
              onChange({ ...layout, grid: { ...layout.grid, gap: Number(event.currentTarget.value) } }, 'gap')
            }
          />
          <output>{layout.grid.gap}</output>
        </label>
        <div class="field">
          <span>{t('admin.editor.accent')}</span>
          <div class="inline">
            <input
              type="color"
              aria-label={t('admin.editor.accent')}
              value={accent ?? '#4fc3f7'}
              onChange={(event) =>
                onChange({ ...layout, theme: { accent: event.currentTarget.value } }, 'accent')
              }
            />
            <button
              type="button"
              disabled={accent === undefined}
              onClick={() => onChange({ ...layout, theme: {} })}
            >
              {t('admin.editor.accentClear')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
