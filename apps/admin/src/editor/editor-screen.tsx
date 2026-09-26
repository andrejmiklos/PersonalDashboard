import {
  fieldsFor,
  MAX_TILES,
  TILE_TYPES,
  type AppSettings,
  type GridBox,
  type LayoutDocument,
  type SourceRecord,
  type Tile,
  type TileType,
} from '@dashboard/shared';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Api } from '../api';
import { useI18n } from '../i18n';
import { emptyLayout, toBody, type LayoutBody } from '../layouts-model';
import { useLoad } from '../load';
import { createPreviewClient, type PreviewMode } from '../preview/data-client';
import { PreviewLayer } from '../preview/preview-layer';
import { setLeaveGuard } from '../router';
import { readItem, safeLocalStorage, writeItem } from '../storage';
import { ErrorNote, Loading } from '../ui';
import { Canvas } from './canvas';
import { draftKey, parseDraft, restorable, serializeDraft } from './draft';
import { firstFreeArea, stepBox, uniqueTileId } from './geometry';
import { interpretKey } from './keys';
import { LayoutProperties, TileProperties } from './properties';
import { configProblem, newTileConfig, withSetting, type NewTileContext } from './tile-model';
import { useHistory } from './use-history';

/** The saved state the draft is compared with: the server's version and its body as JSON. */
interface Saved {
  version: number;
  json: string;
}

function savedOf(layout: LayoutDocument): Saved {
  return { version: layout.version, json: JSON.stringify(toBody(layout)) };
}

/** The address of the editor of a layout that has been saved for the first time. */
function openSaved(id: string): void {
  setLeaveGuard(null);
  // Replaces `#/layouts/new`, so that the back button does not lead to an editor of nothing.
  window.location.replace(`#/layouts/${id}`);
}

const PREVIEW_MODE_KEY = 'admin.previewMode';
/** A draft is written to the browser this long after the last edit. */
const DRAFT_DELAY_MS = 500;
const storage = safeLocalStorage();

function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.matches('input, select, textarea, [contenteditable=""], [contenteditable="true"]')
  );
}

/**
 * `initial` is null for a new layout: nothing exists on the server until the first save, so leaving without
 * saving leaves no empty layout behind. `layoutId` is `new` then.
 */
function Editor({
  api,
  layoutId,
  initial,
  sources,
  settings,
}: {
  api: Api;
  layoutId: string;
  initial: LayoutDocument | null;
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

  const isNew = initial === null;
  const [base] = useState<{ body: LayoutBody; saved: Saved }>(() => {
    if (initial) return { body: toBody(initial), saved: savedOf(initial) };
    const body = emptyLayout(t('admin.layouts.new'));
    return { body, saved: { version: 0, json: JSON.stringify(body) } };
  });
  const [saved, setSaved] = useState<Saved>(base.saved);
  // What the server holds, for "discard": the draft of an earlier visit may differ from it.
  const serverBody = useRef<LayoutBody>(base.body);
  const [start] = useState(() => {
    const stored = restorable(parseDraft(readItem(storage, draftKey(layoutId))), base.saved);
    return { body: stored ?? base.body, restored: stored !== null };
  });
  const history = useHistory<LayoutBody>(() => start.body);
  const draft = history.value;
  const setDraft = history.set;
  const [restoredNotice, setRestoredNotice] = useState(start.restored);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const dirty = JSON.stringify(draft) !== saved.json;
  const selected = draft.tiles.find((tile) => tile.id === selectedId) ?? null;
  const problems = new Set(draft.tiles.filter((tile) => configProblem(tile) !== null).map((tile) => tile.id));

  // Tiles the server would refuse are left out of the picture; their frame on the canvas is outlined instead.
  const previewLayout: LayoutDocument = {
    ...draft,
    id: layoutId,
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

  function updateTile(id: string, change: (tile: Tile) => Tile, key?: string): void {
    setDraft({ ...draft, tiles: draft.tiles.map((tile) => (tile.id === id ? change(tile) : tile)) }, key);
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

  /** Typing in a text field is one step of the history, not one per key. */
  function changeSetting(tile: Tile, key: string, value: unknown): void {
    const typing = fieldsFor(tile.type, tile.config).find((field) => field.key === key)?.kind === 'text';
    updateTile(
      tile.id,
      (current) => ({ ...current, config: withSetting(current, key, value, context()) }),
      typing ? `setting:${tile.id}:${key}` : undefined,
    );
  }

  /** The saved layout (created the first time), or null when the server refused it. */
  async function save(): Promise<LayoutDocument | null> {
    setBusy(true);
    setError(null);
    try {
      const stored = isNew
        ? await api.post<LayoutDocument>('/api/v1/layouts', draft)
        : await api.put<LayoutDocument>(`/api/v1/layouts/${layoutId}`, {
            ...draft,
            ifVersion: saved.version,
          });
      // The server fills in the config defaults, so the draft continues from what it stored.
      serverBody.current = toBody(stored);
      history.replace(toBody(stored));
      setSaved(savedOf(stored));
      setRestoredNotice(false);
      return stored;
    } catch (failure) {
      setError(failure);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveOnly(): Promise<void> {
    const stored = await save();
    if (stored && isNew) openSaved(stored.id);
  }

  /** Saves what is unsaved, then pins the layout on the tablet (`PUT /api/v1/override`). */
  async function saveAndShow(): Promise<void> {
    setNotice(null);
    setShown(false);
    let id = layoutId;
    if (dirty || isNew) {
      const stored = await save();
      if (!stored) return;
      id = stored.id;
    }
    setBusy(true);
    try {
      await api.put('/api/v1/override', { layoutId: id });
      setShown(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
    if (isNew) openSaved(id);
  }

  // The draft is kept in the browser while it differs from what is saved.
  useEffect(() => {
    const key = draftKey(layoutId);
    if (!dirty) {
      writeItem(storage, key, null);
      return;
    }
    const timer = window.setTimeout(
      () => writeItem(storage, key, serializeDraft({ baseVersion: saved.version, body: draft })),
      DRAFT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [draft, dirty, saved.version, layoutId]);

  // Leaving with unsaved changes asks first, whether by a link, the back button or closing the tab.
  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard(() => window.confirm(t('admin.editor.leaveConfirm')));
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty, t]);

  // Keyboard: arrows move, Shift+arrows resize, Delete removes, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+S saves.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const command = interpretKey({
        key: event.key,
        primary: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
        inField: isField(event.target),
        hasSelection: selected !== null,
      });
      if (command === null) return;
      event.preventDefault();
      switch (command.type) {
        case 'undo':
          history.undo();
          break;
        case 'redo':
          history.redo();
          break;
        case 'save':
          if ((dirty || isNew) && !busy) void saveOnly();
          break;
        case 'deselect':
          setSelectedId(null);
          break;
        case 'remove':
          if (selected) removeTile(selected.id);
          break;
        case 'step': {
          const box = selected ? stepBox(draft.tiles, selected, command.field, command.delta) : null;
          if (selected && box) updateTile(selected.id, (tile) => ({ ...tile, ...box }));
          break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value }, 'name')}
        />
        <button type="button" disabled={!history.canUndo} onClick={history.undo}>
          {t('admin.editor.undo')}
        </button>
        <button type="button" disabled={!history.canRedo} onClick={history.redo}>
          {t('admin.editor.redo')}
        </button>
        <span class="muted status">
          {dirty ? t('admin.editor.unsaved') : isNew ? '' : t('admin.editor.saved', { v: saved.version })}
        </span>
        <button type="button" disabled={busy || (!dirty && !isNew)} onClick={() => void saveOnly()}>
          {t('admin.editor.save')}
        </button>
        <button type="button" class="primary" disabled={busy} onClick={() => void saveAndShow()}>
          {t(dirty || isNew ? 'admin.editor.saveAndShow' : 'admin.editor.showNow')}
        </button>
      </div>
      {restoredNotice && dirty && (
        <div class="note" role="status">
          <span>{t('admin.editor.draftRestored')}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(serverBody.current);
              setRestoredNotice(false);
              setSelectedId(null);
            }}
          >
            {t('admin.editor.draftDiscard')}
          </button>
        </div>
      )}
      {error !== null && <ErrorNote error={error} />}
      {shown && !dirty && (
        <div class="note ok" role="status">
          {t('admin.editor.shown')}
        </div>
      )}

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
          <p class="muted keys">{t('admin.editor.shortcuts')}</p>
        </div>
        {selected ? (
          <TileProperties
            key={selected.id}
            tile={selected}
            tiles={draft.tiles}
            sources={sources}
            onBox={(box) => updateTile(selected.id, (tile) => ({ ...tile, ...box }))}
            onSetting={(key, value) => changeSetting(selected, key, value)}
            onRemove={() => removeTile(selected.id)}
          />
        ) : (
          <LayoutProperties layout={draft} onChange={(next, key) => setDraft(next, key)} />
        )}
      </div>
    </section>
  );
}

/** Loads the layout and the sources tiles may use, then hands them to the editor, which keeps the draft. */
export function EditorScreen({ api, layoutId }: { api: Api; layoutId: string }) {
  // `new`: nothing to load, the layout is created by the first save.
  const layout = useLoad<LayoutDocument | 'new'>(() =>
    layoutId === 'new' ? Promise.resolve('new') : api.get<LayoutDocument>(`/api/v1/layouts/${layoutId}`),
  );
  const sources = useLoad(() => api.get<SourceRecord[]>('/api/v1/sources'));
  const settings = useLoad(() => api.get<AppSettings>('/api/v1/settings'));
  // The settings only decide language and time zone of the preview: without them the admin's own are used.
  if (layout.data !== null && sources.data !== null && !settings.loading) {
    return (
      <Editor
        api={api}
        layoutId={layoutId}
        initial={layout.data === 'new' ? null : layout.data}
        sources={sources.data}
        settings={settings.data}
      />
    );
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
