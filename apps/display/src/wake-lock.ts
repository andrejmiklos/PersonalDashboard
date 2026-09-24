// Screen Wake Lock (docs/02-tablet-and-kiosk.md §3): a second guard next to Android's "Stay awake".
// Chrome 84+, HTTPS only (verified on the tablet in Phase 0).

type Visibility = Pick<Document, 'visibilityState' | 'addEventListener'>;

/**
 * Holds a screen wake lock while the page is visible. The browser releases it whenever the page is
 * hidden (or on its own, e.g. in power saving), so it is requested again on the next visibility change.
 * Without the API (plain HTTP) this does nothing.
 */
export function keepScreenAwake(wakeLock: WakeLock | undefined, doc: Visibility): void {
  if (!wakeLock) return;
  const lock = wakeLock;
  let held = false;
  let pending = false;

  function acquire(): void {
    if (held || pending || doc.visibilityState !== 'visible') return;
    pending = true;
    lock
      .request('screen')
      .then(
        (sentinel) => {
          held = true;
          sentinel.addEventListener('release', () => {
            held = false;
          });
        },
        () => {
          // Refused: "Stay awake" still keeps the screen on; the next visibility change tries again.
        },
      )
      .finally(() => {
        pending = false;
      });
  }

  doc.addEventListener('visibilitychange', acquire);
  acquire();
}
