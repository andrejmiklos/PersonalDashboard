import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface Loaded<T> {
  /** The last successful result; kept while a reload is running. */
  data: T | null;
  error: unknown;
  loading: boolean;
  reload(): void;
}

/** Runs `load` on mount and whenever `reload` is called; an answer that is no longer the latest is dropped. */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const latest = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const run = useCallback(() => {
    const id = ++latest.current;
    setState((previous) => ({ ...previous, error: null, loading: true }));
    loader
      .current()
      .then((data) => {
        if (id === latest.current) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (id === latest.current) setState((previous) => ({ ...previous, error, loading: false }));
      });
  }, []);

  useEffect(() => {
    run();
    return () => {
      latest.current++;
    };
  }, [run]);

  return { ...state, reload: run };
}
