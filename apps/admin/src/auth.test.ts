import { describe, expect, it, vi } from 'vitest';
import { checkToken, readToken, storeToken } from './auth';

// Fictional token used only in tests.
const TOKEN = `dsh_admin_${'A'.repeat(43)}`;

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const answering = (status: number) =>
  vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('token storage', () => {
  it('stores, reads and clears the token', () => {
    const storage = memoryStorage();
    expect(readToken(storage)).toBeNull();
    storeToken(storage, TOKEN);
    expect(readToken(storage)).toBe(TOKEN);
    storeToken(storage, null);
    expect(readToken(storage)).toBeNull();
  });

  it('works without storage', () => {
    storeToken(null, TOKEN);
    expect(readToken(null)).toBeNull();
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    storeToken(broken, TOKEN);
    expect(readToken(broken)).toBeNull();
  });
});

describe('checkToken', () => {
  it('accepts a token the server lets read the layouts', async () => {
    const fetchFn = answering(200);
    expect(await checkToken(TOKEN, fetchFn)).toBe('ok');
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(url).toBe('/api/v1/layouts');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it.each([401, 403])('rejects a token answered with %i', async (status) => {
    expect(await checkToken(TOKEN, answering(status))).toBe('invalid');
  });

  it('reports a server error as a failure, not as a wrong token', async () => {
    expect(await checkToken(TOKEN, answering(500))).toBe('failed');
  });

  it('reports an unreachable server as a failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await checkToken(TOKEN, fetchFn)).toBe('failed');
  });
});
