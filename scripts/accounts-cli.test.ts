import { describe, expect, it } from 'vitest';
import { formatDiscovered, formatOverview, parseAccountsArgs } from './accounts-cli.ts';

// Fictional ids and names used only in tests.
const ACC = 'acc_aaaaaaaaaaaaaaaa';
const SRC = 'src_bbbbbbbbbbbbbbbb';

describe('parseAccountsArgs', () => {
  it('lists without options', () => {
    expect(parseAccountsArgs({})).toEqual({ kind: 'list' });
  });

  it('connects a provider', () => {
    expect(parseAccountsArgs({ connect: 'google' })).toEqual({ kind: 'connect', provider: 'google' });
    expect(parseAccountsArgs({ connect: 'microsoft' })).toEqual({ kind: 'connect', provider: 'microsoft' });
  });

  it('discovers an account', () => {
    expect(parseAccountsArgs({ discover: ACC })).toEqual({ kind: 'discover', accountId: ACC });
  });

  it('adds a source with an optional label and a lower-case colour', () => {
    expect(parseAccountsArgs({ add: ACC, 'remote-id': 'cal-1' })).toEqual({
      kind: 'add',
      accountId: ACC,
      body: { remoteId: 'cal-1' },
    });
    expect(
      parseAccountsArgs({ add: ACC, 'remote-id': 'cal-1', label: ' Family ', color: '#ABCDEF' }),
    ).toEqual({
      kind: 'add',
      accountId: ACC,
      body: { remoteId: 'cal-1', label: 'Family', color: '#abcdef' },
    });
  });

  it('changes only what is given for a source', () => {
    expect(parseAccountsArgs({ source: SRC, color: '#112233' })).toEqual({
      kind: 'update',
      sourceId: SRC,
      body: { color: '#112233' },
    });
    expect(parseAccountsArgs({ source: SRC, disable: true })).toEqual({
      kind: 'update',
      sourceId: SRC,
      body: { enabled: false },
    });
    expect(parseAccountsArgs({ source: SRC, enable: true, label: 'Home' }).kind).toBe('update');
  });

  it('deletes an account only when confirmed', () => {
    expect(parseAccountsArgs({ 'delete-account': ACC, yes: true })).toEqual({
      kind: 'delete',
      accountId: ACC,
    });
    expect(() => parseAccountsArgs({ 'delete-account': ACC })).toThrow(/--yes/);
  });

  it.each([
    [{ connect: 'dropbox' }, /google or microsoft/],
    [{ connect: 'google', discover: ACC }, /only one of/],
    [{ discover: 'nope' }, /--discover must be an id/],
    [{ add: SRC, 'remote-id': 'x' }, /--add must be an id/],
    [{ add: ACC }, /--remote-id/],
    [{ add: ACC, 'remote-id': 'x', color: 'red' }, /#rrggbb/],
    [{ add: ACC, 'remote-id': 'x', label: '  ' }, /--label/],
    [{ add: ACC, 'remote-id': 'x', enable: true }, /--enable does not go with --add/],
    [{ source: ACC, label: 'x' }, /--source must be an id/],
    [{ source: SRC }, /needs --label/],
    [{ source: SRC, enable: true, disable: true }, /either --enable or --disable/],
    [{ source: SRC, 'remote-id': 'x', label: 'x' }, /--remote-id does not go with --source/],
    [{ label: 'x' }, /--label does not go with listing/],
    [{ connect: 'google', label: 'x' }, /--label does not go with --connect/],
    [{ discover: ACC, yes: true }, /--yes does not go with --discover/],
  ])('rejects %j', (options, message) => {
    expect(() => parseAccountsArgs(options)).toThrow(message);
  });
});

describe('formatOverview', () => {
  it('points to --connect when there is nothing', () => {
    expect(formatOverview([], [])).toMatch(/--connect/);
  });

  it('lists each account with its sources and calls out one that needs reconnecting', () => {
    const text = formatOverview(
      [
        { id: ACC, provider: 'google', displayName: 'anna@example.com', status: 'ok' },
        { id: 'acc_cccccccccccccccc', provider: 'microsoft', displayName: null, status: 'reauth_required' },
      ],
      [{ id: SRC, accountId: ACC, kind: 'calendar', label: 'Family', color: '#4f9dff', enabled: false }],
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe(`${ACC}  google  anna@example.com`);
    expect(lines[1]).toBe(`    ${SRC}  calendar   #4f9dff  off  Family`);
    expect(lines[2]).toBe('acc_cccccccccccccccc  microsoft  (no label)  [REAUTH_REQUIRED: connect it again]');
  });
});

describe('formatDiscovered', () => {
  it('shows what is added already and how to add the rest', () => {
    const text = formatDiscovered([
      { kind: 'calendar', remoteId: 'cal-1', label: 'Family', sourceId: SRC },
      { kind: 'calendar', remoteId: 'cal-2', label: 'Work', sourceId: null },
    ]);
    expect(text).toContain('added   Family');
    expect(text).toContain('new     Work\n        --remote-id cal-2');
    expect(formatDiscovered([])).toMatch(/no calendars/);
  });
});
