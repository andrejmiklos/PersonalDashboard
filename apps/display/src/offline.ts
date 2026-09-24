import { formatTime, t, type Locale } from '@dashboard/shared';

/** Short outages are covered by the tiles' stale state; the badge appears after this long. */
export const OFFLINE_AFTER_MS = 5 * 60_000;
const CHECK_MS = 30_000;

export function isOffline(lastOkAt: number, failing: boolean, now: number): boolean {
  return failing && now - lastOkAt >= OFFLINE_AFTER_MS;
}

/**
 * Small "Offline since hh:mm" badge in a corner while `display/state` keeps failing
 * (docs/01-architecture.md §5); the layout keeps rendering underneath.
 */
export function createOfflineBadge(parent: HTMLElement, format: () => { locale: Locale; timezone: string }) {
  const badge = document.createElement('div');
  badge.className = 'offline-badge';
  badge.hidden = true;
  parent.appendChild(badge);

  let lastOkAt = Date.now();
  let failing = false;

  function update(): void {
    const show = isOffline(lastOkAt, failing, Date.now());
    if (show) {
      const { locale, timezone } = format();
      const time = formatTime(new Date(lastOkAt), {
        locale,
        timeZone: timezone,
        hour12: false,
        seconds: false,
      });
      badge.textContent = t(locale, 'display.offlineSince', { time });
    }
    badge.hidden = !show;
  }

  window.setInterval(update, CHECK_MS);
  return {
    ok(): void {
      lastOkAt = Date.now();
      failing = false;
      update();
    },
    failed(): void {
      failing = true;
      update();
    },
  };
}
