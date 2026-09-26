import type { GridBox, LayoutDocument } from '@dashboard/shared';
import { useState } from 'preact/hooks';
import type { Api } from '../api';
import { useI18n } from '../i18n';
import { toBody, type LayoutBody } from '../layouts-model';
import { useLoad } from '../load';
import { ErrorNote, Loading } from '../ui';
import { Canvas } from './canvas';

/** The saved state the draft is compared with: the server's version and its body as JSON. */
interface Saved {
  version: number;
  json: string;
}

function savedOf(layout: LayoutDocument): Saved {
  return { version: layout.version, json: JSON.stringify(toBody(layout)) };
}

function Editor({ api, initial }: { api: Api; initial: LayoutDocument }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<LayoutBody>(() => toBody(initial));
  const [saved, setSaved] = useState<Saved>(() => savedOf(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = JSON.stringify(draft) !== saved.json;

  function moveTile(id: string, box: GridBox): void {
    setDraft({ ...draft, tiles: draft.tiles.map((tile) => (tile.id === id ? { ...tile, ...box } : tile)) });
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
      <Canvas tiles={draft.tiles} selectedId={selectedId} onSelect={setSelectedId} onChange={moveTile} />
      <p class="muted">{t('admin.editor.hint')}</p>
    </section>
  );
}

/** Loads the layout, then hands it to the editor, which keeps the draft. */
export function EditorScreen({ api, layoutId }: { api: Api; layoutId: string }) {
  const layout = useLoad(() => api.get<LayoutDocument>(`/api/v1/layouts/${layoutId}`));
  if (layout.data !== null) return <Editor api={api} initial={layout.data} />;
  if (layout.error !== null) return <ErrorNote error={layout.error} onRetry={layout.reload} />;
  return <Loading />;
}
