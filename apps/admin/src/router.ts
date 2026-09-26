import { useEffect, useState } from 'preact/hooks';

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

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
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
