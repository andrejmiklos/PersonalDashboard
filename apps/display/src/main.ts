import './style.css';
import { DEFAULT_LOCALE, t, type DisplayState, type MessageKey } from '@dashboard/shared';
import { fetchState } from './api';
import { clearLayout, renderLayout } from './layout/engine';
import { shouldReload } from './reload';
import { applyStage, fitStage } from './stage';
import { currentToken, pairFromLocation } from './token';

const POLL_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const UNAUTHORIZED_POLL_MS = 60_000;

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = safeLocalStorage();
// First thing on boot: take the token out of the URL.
pairFromLocation(window.location, window.history, storage);

const stage = document.getElementById('stage') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

let state: DisplayState | null = null;
let etag: string | null = null;
let failures = 0;

/** Full-stage message instead of a layout (not paired, no layout, offline before first state). */
function showMessage(key: MessageKey): void {
  clearLayout();
  status.textContent = t(state?.locale ?? DEFAULT_LOCALE, key);
  status.hidden = false;
}

function render(current: DisplayState): void {
  const layout = current.layoutSpec ? current.layouts[current.layoutSpec.layoutId] : undefined;
  if (!layout) {
    showMessage('display.noLayout');
    return;
  }
  status.hidden = true;
  renderLayout(stage, layout, current.locale, current.timezone);
}

function resize(): void {
  applyStage(stage, document.documentElement, fitStage(window.innerWidth, window.innerHeight));
}

async function poll(): Promise<void> {
  const token = currentToken(storage);
  if (token === null) {
    showMessage('display.notPaired');
    return;
  }

  const result = await fetchState(token, etag);
  let nextMs = POLL_MS;
  switch (result.kind) {
    case 'changed':
      failures = 0;
      state = result.state;
      etag = result.etag;
      if (shouldReload(state.appVersion, __APP_VERSION__, Date.now(), storage)) {
        window.location.reload();
        return;
      }
      render(state);
      break;
    case 'unchanged':
      failures = 0;
      break;
    case 'unauthorized':
      etag = null;
      showMessage('display.notPaired');
      nextMs = UNAUTHORIZED_POLL_MS;
      break;
    case 'failed':
      failures += 1;
      nextMs = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
      if (state === null) showMessage('display.offline');
      break;
  }
  window.setTimeout(() => void poll(), nextMs);
}

window.addEventListener('resize', resize);
// Kiosk: no long-press menu (docs/02-tablet-and-kiosk.md §3).
document.addEventListener('contextmenu', (event) => event.preventDefault());
resize();
showMessage('state.loading');
void poll();
