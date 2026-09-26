import { useEffect, useRef, useState } from 'preact/hooks';

export interface Route {
  path: string;
  params: URLSearchParams;
}

/** `#/accounts?connected=google` → `{ path: '/accounts', params }`. The OAuth callback lands on such an address. */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryAt = raw.indexOf('?');
  const pathPart = queryAt < 0 ? raw : raw.slice(0, queryAt);
  const query = queryAt < 0 ? '' : raw.slice(queryAt + 1);
  const path = pathPart === '' ? '/' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path, params: new URLSearchParams(query) };
}

export function navigate(path: string): void {
  window.location.hash = `#${path}`;
}

/** Asked before the page changes: false keeps the current one. Set by a screen with unsaved work. */
let leaveGuard: (() => boolean) | null = null;

export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const accepted = useRef(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      const next = window.location.hash;
      if (next === accepted.current) return;
      if (leaveGuard && !leaveGuard()) {
        // Back to where we were; replaceState does not fire another hashchange.
        window.history.replaceState(null, '', accepted.current === '' ? '#/' : accepted.current);
        return;
      }
      accepted.current = next;
      setRoute(parseHash(next));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

const EDITOR_PATH = /^\/layouts\/(lay_[a-z2-7]{16})$/;

/** The layout id of an editor address (`#/layouts/lay_…`), or null for any other path. */
export function editorLayoutId(path: string): string | null {
  return EDITOR_PATH.exec(path)?.[1] ?? null;
}
