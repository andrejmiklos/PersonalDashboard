import { describe, expect, it } from 'vitest';
import { editorLayoutId, parseHash } from './router';

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

describe('editorLayoutId', () => {
  it('reads the layout id of an editor path', () => {
    expect(editorLayoutId('/layouts/lay_abcdefghijklmnop')).toBe('lay_abcdefghijklmnop');
  });

  it('reads a layout that is not saved yet as `new`', () => {
    expect(editorLayoutId('/layouts/new')).toBe('new');
  });

  it.each([
    '/layouts',
    '/layouts/',
    '/layouts/x',
    '/layouts/lay_short',
    '/layouts/lay_abcdefghijklmnop/x',
    '/accounts',
  ])('is null for %s', (path) => {
    expect(editorLayoutId(path)).toBeNull();
  });
});
