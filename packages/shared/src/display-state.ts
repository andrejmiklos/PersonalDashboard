import type { LayoutDocument } from './layout';
import type { Locale } from './locale';

/** Response of `GET /api/v1/display/state` (docs/07-api.md §2). */
export interface DisplayState {
  serverTime: string;
  /** Build id of the deployed display bundle; the tablet reloads when it differs from its own. */
  appVersion: string;
  screen: 'on' | 'off';
  /** `pinned`: the admin chose this layout for now (an override); `layout`: the default one. */
  layoutSpec: { kind: 'layout' | 'pinned'; layoutId: string } | null;
  layouts: Record<string, LayoutDocument>;
  rotation: null;
  touch: { enabled: boolean; cycle: string[]; timeoutSec: number };
  locale: Locale;
  timezone: string;
  power: { mode: 'always_on' | 'scheduled' | 'manual' };
}

/** Value used when no build id is available (local development, tests). */
export const DEV_APP_VERSION = 'dev';
