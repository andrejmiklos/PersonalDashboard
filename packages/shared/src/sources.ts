export type SourceKind = 'calendar' | 'task_list';
export type AccountProviderId = 'google' | 'microsoft';
export type AccountStatus = 'ok' | 'reauth_required';

/** An account as the admin API returns it (docs/07-api.md §6): never tokens or scopes. */
export interface AccountSummary {
  id: string;
  provider: AccountProviderId;
  displayName: string | null;
  status: AccountStatus;
}

/** A chosen calendar or task list of an account (`GET /api/v1/sources`). */
export interface SourceRecord {
  id: string;
  accountId: string;
  kind: SourceKind;
  remoteId: string;
  label: string;
  color: string | null;
  enabled: boolean;
}

/** A calendar or list that exists at the provider (`GET /api/v1/accounts/:id/discover`). */
export interface DiscoveredItem {
  kind: SourceKind;
  remoteId: string;
  label: string;
  /** The provider's own colour, only a hint. */
  color: string | null;
  /** Set when it was added as a source already. */
  sourceId: string | null;
}

/** A calendar or task list of a data payload: what a tile needs to colour and label its items. */
export interface SourceInfo {
  id: string;
  label: string;
  /** `#rrggbb` chosen by the owner. */
  color: string | null;
}
