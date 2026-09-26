import {
  MAX_TILES,
  TILE_TYPES,
  type AppSettings,
  type GridBox,
  type LayoutDocument,
  type SourceRecord,
  type Tile,
  type TileType,
} from '@dashboard/shared';
import { useMemo, useState } from 'preact/hooks';
import type { Api } from '../api';
import { useI18n } from '../i18n';
import { toBody, type LayoutBody } from '../layouts-model';
import { useLoad } from '../load';
import { createPreviewClient, type PreviewMode } from '../preview/data-client';
import { PreviewLayer } from '../preview/preview-layer';
import { readItem, safeLocalStorage, writeItem } from '../storage';
import { ErrorNote, Loading } from '../ui';
import { Canvas } from './canvas';
import { firstFreeArea, uniqueTileId } from './geometry';
import { LayoutProperties, TileProperties } from './properties';
import { configProblem, newTileConfig, withSetting, type NewTileContext } from './tile-model';

/** The saved state the draft is compared with: the server's version and its body as JSON. */
interface Saved {
  version: number;
  json: string;
}

function savedOf(layout: LayoutDocument): Saved {
  return { version: layout.version, json: JSON.stringify(toBody(layout)) };
}

const PREVIEW_MODE_KEY = 'admin.previewMode';
const storage = safeLocalStorage();

function Editor({
  api,
  initial,
  sources,
  settings,
}: {
  api: Api;
  initial: LayoutDocument;
  sources: readonly SourceRecord[];
  settings: AppSettings | null;
}) {
  const { t, locale: adminLocale } = useI18n();
  // The tiles are drawn as the tablet would: in its language and time zone.
  const tabletLocale = settings?.locale ?? adminLocale;
  const timezone = settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [mode, setMode] = useState<PreviewMode>(() =>
    readItem(storage, PREVIEW_MODE_KEY) === 'real' ? 'real' : 'sample',
  );
  const client = useMemo(
    () =>
      createPreviewClient(mode, api, () => ({ now: new Date(), timezone, locale: tabletLocale, sources })),
    [mode, api, timezone, tabletLocale, sources],
  );
  const [draft, setDraft] = useState<LayoutBody>(() => toBody(initial));
  const [saved, setSaved] = useState<Saved>(() => savedOf(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== saved.json;
  const selected = draft.tiles.find((tile) => tile.id === selectedId) ?? null;
  const problems = new Set(draft.tiles.filter((tile) => configProblem(tile) !== null).map((tile) => tile.id));

  // Tiles the server would refuse are left out of the picture; their frame on the canvas is outlined instead.
  const previewLayout: LayoutDocument = {
    ...draft,
    id: initial.id,
    version: saved.version,
    tiles: draft.tiles.filter((tile) => !problems.has(tile.id)),
  };

  function chooseMode(next: PreviewMode): void {
    writeItem(storage, PREVIEW_MODE_KEY, next);
    setMode(next);
  }

  const context = (): NewTileContext => ({
    sources,
    countdownLabel: t('tile.countdown'),
    now: new Date(),
  });

  function updateTile(id: string, change: (tile: Tile) => Tile): void {
    setDraft({ ...draft, tiles: draft.tiles.map((tile) => (tile.id === id ? change(tile) : tile)) });
  }

  function addTile(type: TileType): void {
    setNotice(null);
    if (draft.tiles.length >= MAX_TILES) {
      setNotice(t('admin.editor.tooMany', { n: MAX_TILES }));
      return;
    }
    const box = firstFreeArea(draft.tiles, type);
    if (box === null) {
      setNotice(t('admin.editor.noRoom'));
      return;
    }
    const tile: Tile = {
      id: uniqueTileId(draft.tiles, type),
      type,
      ...box,
      config: newTileConfig(type, context()),
    };
    setDraft({ ...draft, tiles: [...draft.tiles, tile] });
    setSelectedId(tile.id);
  }

  function removeTile(id: string): void {
    setDraft({ ...draft, tiles: draft.tiles.filter((tile) => tile.id !== id) });
    setSelectedId(null);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const stored = await api.put<LayoutDocument>(`/api/v1/layouts/${initial.id}`, {
        ...draft,
        ifVersion: saved.version,
      });
      // The server fills in the config defaults, so the draft continues from what it stored.
      setDraft(toBody(stored));
      setSaved(savedOf(stored));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="editor">
      <div class="editor-bar">
        <a class="button" href="#/layouts">
          ← {t('admin.nav.layouts')}
        </a>
        <input
          type="text"
          class="grow"
          maxLength={64}
          aria-label={t('admin.editor.name')}
          value={draft.name}
          onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
        />
        <span class="muted status">
          {dirty ? t('admin.editor.unsaved') : t('admin.editor.saved', { v: saved.version })}
        </span>
        <button type="button" class="primary" disabled={busy || !dirty} onClick={() => void save()}>
          {t('admin.editor.save')}
        </button>
      </div>
      {error !== null && <ErrorNote error={error} />}

      <div class="preview-mode">
        <span class="muted">{t('admin.editor.previewMode')}</span>
        <div class="segmented" role="group" aria-label={t('admin.editor.previewMode')}>
          {(['sample', 'real'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              onClick={() => chooseMode(choice)}
            >
              {t(choice === 'sample' ? 'admin.editor.previewSample' : 'admin.editor.previewReal')}
            </button>
          ))}
        </div>
      </div>

      <div class="palette" role="group" aria-label={t('admin.editor.palette')}>
        <span class="muted">{t('admin.editor.palette')}</span>
        {(Object.keys(TILE_TYPES) as TileType[]).map((type) => (
          <button key={type} type="button" onClick={() => addTile(type)}>
            + {t(`tile.${type}`)}
          </button>
        ))}
      </div>
      {notice !== null && (
        <div class="note warn" role="status">
          {notice}
        </div>
      )}

      <div class="editor-body">
        <div>
          <Canvas
            tiles={draft.tiles}
            selectedId={selectedId}
            problems={problems}
            underlay={
              <PreviewLayer
                layout={previewLayout}
                locale={tabletLocale}
                timezone={timezone}
                client={client}
              />
            }
            onSelect={setSelectedId}
            onChange={(id: string, box: GridBox) => updateTile(id, (tile) => ({ ...tile, ...box }))}
          />
          <p class="muted">{t('admin.editor.hint')}</p>
        </div>
        {selected ? (
          <TileProperties
            key={selected.id}
            tile={selected}
            tiles={draft.tiles}
            sources={sources}
            onBox={(box) => updateTile(selected.id, (tile) => ({ ...tile, ...box }))}
            onSetting={(key, value) =>
              updateTile(selected.id, (tile) => ({
                ...tile,
                config: withSetting(tile, key, value, context()),
              }))
            }
            onRemove={() => removeTile(selected.id)}
          />
        ) : (
          <LayoutProperties layout={draft} onChange={setDraft} />
        )}
      </div>
    </section>
  );
}

/** Loads the layout and the sources tiles may use, then hands them to the editor, which keeps the draft. */
export function EditorScreen({ api, layoutId }: { api: Api; layoutId: string }) {
  const layout = useLoad(() => api.get<LayoutDocument>(`/api/v1/layouts/${layoutId}`));
  const sources = useLoad(() => api.get<SourceRecord[]>('/api/v1/sources'));
  const settings = useLoad(() => api.get<AppSettings>('/api/v1/settings'));
  // The settings only decide language and time zone of the preview: without them the admin's own are used.
  if (layout.data !== null && sources.data !== null && !settings.loading) {
    return <Editor api={api} initial={layout.data} sources={sources.data} settings={settings.data} />;
  }
  const failed = layout.error ?? sources.error;
  if (failed !== null) {
    return (
      <ErrorNote
        error={failed}
        onRetry={() => {
          layout.reload();
          sources.reload();
        }}
      />
    );
  }
  return <Loading />;
}
