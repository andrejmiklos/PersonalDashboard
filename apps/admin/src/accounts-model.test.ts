import type { SourceRecord } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { cleanLabel, flashFrom, hexColor, safeAuthorizationUrl, sourcesOf } from './accounts-model';

const params = (query: string) => new URLSearchParams(query);

describe('flashFrom', () => {
  it('reads a successful connection', () => {
    expect(flashFrom(params('connected=google'))).toEqual({ kind: 'connected', provider: 'google' });
    expect(flashFrom(params('connected=microsoft'))).toEqual({ kind: 'connected', provider: 'microsoft' });
  });

  it('reads the known errors', () => {
    expect(flashFrom(params('error=denied'))).toEqual({ kind: 'error', code: 'denied' });
    expect(flashFrom(params('error=invalid_state'))).toEqual({ kind: 'error', code: 'invalid_state' });
  });

  it('turns an unknown error into a failure', () => {
    expect(flashFrom(params('error=<b>x</b>'))).toEqual({ kind: 'error', code: 'failed' });
  });

  it('ignores an unknown provider and an empty query', () => {
    expect(flashFrom(params('connected=evil'))).toBeNull();
    expect(flashFrom(params(''))).toBeNull();
  });
});

describe('safeAuthorizationUrl', () => {
  it('accepts https addresses', () => {
    expect(safeAuthorizationUrl('https://accounts.example.com/o/oauth2/auth?x=1')).toBe(
      'https://accounts.example.com/o/oauth2/auth?x=1',
    );
  });

  it.each([
    'javascript:alert(1)',
    'http://accounts.example.com',
    'data:text/html,x',
    'not a url',
    '',
    42,
    null,
  ])('rejects %s', (value) => {
    expect(safeAuthorizationUrl(value)).toBeNull();
  });
});

describe('sourcesOf', () => {
  const source = (id: string, accountId: string): SourceRecord => ({
    id,
    accountId,
    kind: 'calendar',
    remoteId: id,
    label: id,
    color: null,
    enabled: true,
  });

  it('keeps the sources of one account in order', () => {
    const all = [source('a', 'acc1'), source('b', 'acc2'), source('c', 'acc1')];
    expect(sourcesOf('acc1', all).map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('cleanLabel', () => {
  it('trims and accepts 1–80 characters', () => {
    expect(cleanLabel('  Family  ')).toBe('Family');
    expect(cleanLabel('x'.repeat(80))).toBe('x'.repeat(80));
  });

  it('rejects an empty or too long name', () => {
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel('x'.repeat(81))).toBeNull();
  });
});

describe('hexColor', () => {
  it('keeps #rrggbb in lower case', () => {
    expect(hexColor('#9FC6E7')).toBe('#9fc6e7');
  });

  it.each([null, '', 'red', '#fff', '#12345g', 'url(x)', '#1234567'])('drops %s', (value) => {
    expect(hexColor(value)).toBeNull();
  });
});
