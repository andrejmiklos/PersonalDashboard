import { msUntilLocalTime } from '@dashboard/tiles';

// Nightly soft reload (docs/01-architecture.md §5): a long-running page in the old browser leaks
// memory, so it starts fresh every night.

const RELOAD_AT = { hour: 3, minute: 30 };
const RETRY_MS = 5 * 60_000;
const CHECK_TIMEOUT_MS = 10_000;

/**
 * The page has no service worker: reloading without a network would leave Chrome's error page on the
 * wall until someone reloads by hand. So reload only when the Worker answers.
 */
async function serverReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch('/healthz', {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Plans the next reload at 03:30 in the zone `getTimezone` returns at planning time. */
export function scheduleNightlyReload(getTimezone: () => string): void {
  async function attempt(): Promise<void> {
    if (await serverReachable()) {
      window.location.reload();
    } else {
      window.setTimeout(() => void attempt(), RETRY_MS);
    }
  }
  const delay = msUntilLocalTime(new Date(), getTimezone(), RELOAD_AT.hour, RELOAD_AT.minute);
  window.setTimeout(() => void attempt(), delay);
}
