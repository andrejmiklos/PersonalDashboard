declare global {
  /** Build id injected by vite.config.ts; `dev` outside production builds. */
  const __APP_VERSION__: string;
}

export {};
