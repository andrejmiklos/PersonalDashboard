import { STAGE_HEIGHT, STAGE_WIDTH, type LayoutDocument, type Locale } from '@dashboard/shared';
import { createLayoutRenderer, type DataClient, type LayoutRenderer } from '@dashboard/tiles';
import tilesCss from '@dashboard/tiles/tiles.css?inline';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n';

/** The tile styles, parsed once. A shadow root keeps them apart from the styles of the admin app. */
let tileSheet: CSSStyleSheet | null = null;
function sheet(): CSSStyleSheet {
  if (!tileSheet) {
    tileSheet = new CSSStyleSheet();
    tileSheet.replaceSync(tilesCss);
  }
  return tileSheet;
}

/** Redrawing waits for this long after the last edit, so typing does not rebuild every tile per key. */
const REDRAW_DELAY_MS = 250;

/**
 * The real tiles of `packages/tiles` drawn at their true 1280×800 size and scaled down with a CSS transform
 * to the width of the canvas (docs/04-layouts-and-editor.md §2.2). It ignores the pointer: the tiles on it
 * are a picture, the editor's own boxes above it take the clicks.
 */
export function PreviewLayer({
  layout,
  locale,
  timezone,
  client,
}: {
  layout: LayoutDocument;
  locale: Locale;
  timezone: string;
  client: DataClient;
}) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<LayoutRenderer | null>(null);
  const drawn = useRef(false);
  const [failed, setFailed] = useState(false);
  const signature = JSON.stringify(layout);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet()];

    const scaler = document.createElement('div');
    scaler.style.position = 'absolute';
    scaler.style.left = '0';
    scaler.style.top = '0';
    scaler.style.width = `${STAGE_WIDTH}px`;
    scaler.style.height = `${STAGE_HEIGHT}px`;
    scaler.style.transformOrigin = '0 0';
    // What the display's body provides to the tiles.
    scaler.style.font = '16px sans-serif';
    scaler.style.color = '#ddd';
    root.appendChild(scaler);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) scaler.style.transform = `scale(${entry.contentRect.width / STAGE_WIDTH})`;
    });
    observer.observe(el);

    const created = createLayoutRenderer(scaler);
    renderer.current = created;
    return () => {
      observer.disconnect();
      created.clear();
      scaler.remove();
      renderer.current = null;
      drawn.current = false;
    };
  }, []);

  useEffect(() => {
    const target = renderer.current;
    if (!target) return;
    const timer = window.setTimeout(
      () => {
        target.clear();
        try {
          target.render(layout, locale, timezone, client);
          setFailed(false);
        } catch {
          target.clear();
          setFailed(true);
        }
        drawn.current = true;
      },
      drawn.current ? REDRAW_DELAY_MS : 0,
    );
    return () => window.clearTimeout(timer);
    // `signature` stands for the parts of `layout` that matter.
  }, [signature, locale, timezone, client]);

  return (
    <>
      <div class="preview-layer" ref={host} />
      {failed && (
        <div class="note warn preview-failed" role="status">
          {t('admin.editor.previewFailed')}
        </div>
      )}
    </>
  );
}
