import '@dashboard/tiles/tiles.css';
import './style.css';
import { DEFAULT_LOCALE, t, type DisplayState, type MessageKey } from '@dashboard/shared';
import { applyStage, createLayoutRenderer, fitStage } from '@dashboard/tiles';
import { fetchState } from './api';
import { clearCache, readCache, writeCache } from './cache';
import { createDataClient } from './data';
import { scheduleNightlyReload } from './nightly';
import { createOfflineBadge } from './offline';
import { shouldReload } from './reload';
import { createPairingForm } from './pairing';
import { currentToken, pairFromLocation, storeToken } from './token';
import { keepScreenAwake } from './wake-lock';

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
const pairing = pairFromLocation(window.location, window.history, storage);

const dataClient = createDataClient(() => currentToken(storage), storage);
const STATE_CACHE_KEY = 'state';

const stage = document.getElementById('stage') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const layoutRenderer = createLayoutRenderer(stage);

let state: DisplayState | null = null;
let etag: string | null = null;
let failures = 0;
let pollTimer: number | undefined;
let nightlyPlanned = false;

const offlineBadge = createOfflineBadge(document.body, () => ({
  locale: state?.locale ?? DEFAULT_LOCALE,
  timezone: state?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

/** Single polling loop: scheduling always replaces the pending poll. */
function schedulePoll(ms: number): void {
  window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void poll(), ms);
}

const pairingForm = createPairingForm(stage, (token) => {
  if (storeToken(token, storage)) {
    pairingForm.hide();
    etag = null;
    showMessage('state.loading');
    schedulePoll(0);
  }
});

function askForPairing(key: MessageKey): void {
  showMessage(key);
  pairingForm.show(state?.locale ?? DEFAULT_LOCALE);
}

/** Full-stage message instead of a layout (not paired, no layout, offline before first state). */
function showMessage(key: MessageKey): void {
  layoutRenderer.clear();
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
  pairingForm.hide();
  layoutRenderer.render(layout, current.locale, current.timezone, dataClient);
  if (!nightlyPlanned) {
    nightlyPlanned = true;
    scheduleNightlyReload(() => state?.timezone ?? current.timezone);
  }
}

function resize(): void {
  applyStage(stage, document.documentElement, fitStage(window.innerWidth, window.innerHeight));
}

async function poll(): Promise<void> {
  const token = currentToken(storage);
  if (token === null) {
    askForPairing(pairing === 'rejected' ? 'display.badLink' : 'display.notPaired');
    return;
  }

  const result = await fetchState(token, etag);
  let nextMs = POLL_MS;
  switch (result.kind) {
    case 'changed':
      failures = 0;
      offlineBadge.ok();
      state = result.state;
      etag = result.etag;
      writeCache(storage, STATE_CACHE_KEY, state);
      if (shouldReload(state.appVersion, __APP_VERSION__, Date.now(), storage)) {
        window.location.reload();
        return;
      }
      render(state);
      break;
    case 'unchanged':
      failures = 0;
      offlineBadge.ok();
      break;
    case 'unauthorized':
      etag = null;
      // A revoked display must not keep showing the owner's data after a restart.
      clearCache(storage);
      offlineBadge.ok();
      askForPairing('display.tokenRejected');
      nextMs = UNAUTHORIZED_POLL_MS;
      break;
    case 'failed':
      failures += 1;
      nextMs = Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
      offlineBadge.failed();
      if (state === null) showMessage('display.offline');
      break;
  }
  schedulePoll(nextMs);
}

window.addEventListener('resize', resize);
// Kiosk: no long-press menu (docs/02-tablet-and-kiosk.md §3).
document.addEventListener('contextmenu', (event) => event.preventDefault());
// Wi-Fi back: do not wait for the backoff.
window.addEventListener('online', () => schedulePoll(0));
// Absent over plain HTTP.
keepScreenAwake('wakeLock' in navigator ? navigator.wakeLock : undefined, document);
resize();
showMessage('state.loading');
// Show the last known dashboard at once; the first poll replaces it (docs/01-architecture.md §5).
const cachedState = currentToken(storage) === null ? null : readCache<DisplayState>(storage, STATE_CACHE_KEY);
if (cachedState) {
  state = cachedState;
  render(cachedState);
}
void poll();
