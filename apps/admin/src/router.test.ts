import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('parseHash', () => {
  it('splits the path from the query', () => {
    const route = parseHash('#/accounts?connected=google');
    expect(route.path).toBe('/accounts');
    expect(route.params.get('connected')).toBe('google');
  });

  it('treats an empty hash as the root', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('#').path).toBe('/');
  });

  it('adds a missing leading slash', () => {
    expect(parseHash('#layouts').path).toBe('/layouts');
  });

  it('keeps a question mark inside the query value', () => {
    expect(parseHash('#/accounts?error=a?b').params.get('error')).toBe('a?b');
  });
});
