// Command-line options of scripts/accounts.ts turned into one action, and the text it prints. The Worker
// validates again; checking here gives a clear message before the token is asked for.

const PROVIDERS = ['google', 'microsoft'] as const;
type Provider = (typeof PROVIDERS)[number];

export interface AccountsOptions {
  connect?: string;
  discover?: string;
  add?: string;
  'remote-id'?: string;
  source?: string;
  label?: string;
  color?: string;
  enable?: boolean;
  disable?: boolean;
  'delete-account'?: string;
  yes?: boolean;
}

export type AccountsAction =
  | { kind: 'list' }
  | { kind: 'connect'; provider: Provider }
  | { kind: 'discover'; accountId: string }
  | { kind: 'add'; accountId: string; body: { remoteId: string; label?: string; color?: string } }
  | { kind: 'update'; sourceId: string; body: { label?: string; color?: string; enabled?: boolean } }
  | { kind: 'delete'; accountId: string };

const ACCOUNT_ID = /^acc_[a-z2-7]{16}$/;
const SOURCE_ID = /^src_[a-z2-7]{16}$/;

function id(name: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value))
    throw new Error(
      `--${name} must be an id as shown by the list (e.g. ${name === 'source' ? 'src_…' : 'acc_…'})`,
    );
  return value;
}

function appearance(options: AccountsOptions): { label?: string; color?: string } {
  const result: { label?: string; color?: string } = {};
  if (options.label !== undefined) {
    const label = options.label.trim();
    if (label === '' || label.length > 80) throw new Error('--label must be 1–80 characters');
    result.label = label;
  }
  if (options.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(options.color)) throw new Error('--color must be #rrggbb');
    result.color = options.color.toLowerCase();
  }
  return result;
}

/** Exactly one of the main options is allowed; without any the script lists accounts and sources. */
export function parseAccountsArgs(options: AccountsOptions): AccountsAction {
  const main = (['connect', 'discover', 'add', 'source', 'delete-account'] as const).filter(
    (name) => options[name] !== undefined,
  );
  if (main.length > 1) throw new Error(`Use only one of ${main.map((name) => `--${name}`).join(', ')}`);
  if (options.enable && options.disable) throw new Error('Use either --enable or --disable');

  const action = main[0];
  const stray = (names: (keyof AccountsOptions)[]) => {
    const used = names.find((name) => options[name] !== undefined);
    if (used) throw new Error(`--${used} does not go with ${action ? `--${action}` : 'listing'}`);
  };

  switch (action) {
    case undefined:
      stray(['remote-id', 'label', 'color', 'enable', 'disable', 'yes']);
      return { kind: 'list' };
    case 'connect': {
      stray(['remote-id', 'label', 'color', 'enable', 'disable', 'yes']);
      const provider = PROVIDERS.find((p) => p === options.connect);
      if (!provider) throw new Error('--connect must be google or microsoft');
      return { kind: 'connect', provider };
    }
    case 'discover':
      stray(['remote-id', 'label', 'color', 'enable', 'disable', 'yes']);
      return { kind: 'discover', accountId: id('discover', options.discover as string, ACCOUNT_ID) };
    case 'add': {
      stray(['enable', 'disable', 'yes']);
      if (options['remote-id'] === undefined || options['remote-id'] === '') {
        throw new Error('--add needs --remote-id <id from --discover>');
      }
      return {
        kind: 'add',
        accountId: id('add', options.add as string, ACCOUNT_ID),
        body: { remoteId: options['remote-id'], ...appearance(options) },
      };
    }
    case 'source': {
      stray(['remote-id', 'yes']);
      const body: { label?: string; color?: string; enabled?: boolean } = appearance(options);
      if (options.enable) body.enabled = true;
      if (options.disable) body.enabled = false;
      if (Object.keys(body).length === 0)
        throw new Error('--source needs --label, --color, --enable or --disable');
      return { kind: 'update', sourceId: id('source', options.source as string, SOURCE_ID), body };
    }
    case 'delete-account':
      stray(['remote-id', 'label', 'color', 'enable', 'disable']);
      if (!options.yes) {
        throw new Error('--delete-account removes the account and its sources; add --yes to confirm');
      }
      return {
        kind: 'delete',
        accountId: id('delete-account', options['delete-account'] as string, ACCOUNT_ID),
      };
    default:
      return action satisfies never;
  }
}

interface AccountView {
  id: string;
  provider: string;
  displayName: string | null;
  status: string;
}

interface SourceView {
  id: string;
  accountId: string;
  kind: string;
  label: string;
  color: string | null;
  enabled: boolean;
}

/** Accounts with their sources; a status other than ok is called out. */
export function formatOverview(accounts: AccountView[], sources: SourceView[]): string {
  if (accounts.length === 0) return 'No accounts yet. Connect one with --connect google|microsoft.';
  return accounts
    .map((account) => {
      const state = account.status === 'ok' ? '' : `  [${account.status.toUpperCase()}: connect it again]`;
      const own = sources.filter((s) => s.accountId === account.id);
      const lines = own.map(
        (s) =>
          `    ${s.id}  ${s.kind === 'calendar' ? 'calendar ' : 'task list'}  ${s.color ?? '-      '}  ${s.enabled ? 'on ' : 'off'}  ${s.label}`,
      );
      return [
        `${account.id}  ${account.provider}  ${account.displayName ?? '(no label)'}${state}`,
        ...lines,
      ].join('\n');
    })
    .join('\n');
}

interface DiscoveredView {
  kind: string;
  remoteId: string;
  label: string;
  sourceId: string | null;
}

export function formatDiscovered(items: DiscoveredView[]): string {
  if (items.length === 0) return 'The account has no calendars or task lists.';
  return items
    .map(
      (item) => `${item.sourceId ? 'added ' : 'new   '}  ${item.label}\n        --remote-id ${item.remoteId}`,
    )
    .join('\n');
}
