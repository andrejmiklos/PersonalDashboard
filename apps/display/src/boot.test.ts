import { describe, expect, it, vi } from 'vitest';
import { shouldReload } from './reload';
import { fitStage } from './stage';
import { currentToken, isDeviceToken, pairFromLocation, tokenFromHash } from './token';

// Fictional tokens used only in tests.
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;

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

function fakeLocation(hash: string): Location {
  return { hash, pathname: '/display/', search: '' } as Location;
}

describe('device token', () => {
  it('accepts only device tokens', () => {
    expect(isDeviceToken(DEVICE_TOKEN)).toBe(true);
    expect(isDeviceToken(ADMIN_TOKEN)).toBe(false);
    expect(isDeviceToken(`${DEVICE_TOKEN}x`)).toBe(false);
  });

  it('reads t from the fragment', () => {
    expect(tokenFromHash(`#t=${DEVICE_TOKEN}`)).toBe(DEVICE_TOKEN);
    expect(tokenFromHash('#other=1')).toBeNull();
  });

  it('stores a device token and strips the fragment', () => {
    const storage = memoryStorage();
    const history = { replaceState: vi.fn() } as unknown as History;
    expect(pairFromLocation(fakeLocation(`#t=${DEVICE_TOKEN}`), history, storage)).toBe('paired');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/display/');
    expect(currentToken(storage)).toBe(DEVICE_TOKEN);
  });

  it('strips but never stores an admin token', () => {
    const storage = memoryStorage();
    const history = { replaceState: vi.fn() } as unknown as History;
    expect(pairFromLocation(fakeLocation(`#t=${ADMIN_TOKEN}`), history, storage)).toBe('rejected');
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(storage.length).toBe(0);
  });

  it('ignores a tampered stored value', () => {
    const storage = memoryStorage();
    storage.setItem('dashboard.deviceToken', ADMIN_TOKEN);
    expect(pairFromLocation(fakeLocation(''), { replaceState: vi.fn() } as unknown as History, storage)).toBe(
      'none',
    );
  });
});

describe('fitStage', () => {
  it('fills a 16:10 viewport', () => {
    expect(fitStage(1280, 800)).toEqual({ left: 0, top: 0, width: 1280, height: 800, rootFontPx: 16 });
  });

  it('letterboxes other aspect ratios', () => {
    expect(fitStage(1920, 1080)).toEqual({ left: 96, top: 0, width: 1728, height: 1080, rootFontPx: 21.6 });
    expect(fitStage(800, 800)).toMatchObject({ left: 0, top: 150, width: 800, height: 500 });
  });
});

describe('shouldReload', () => {
  it('ignores equal and development versions', () => {
    const storage = memoryStorage();
    expect(shouldReload('b1', 'b1', 0, storage)).toBe(false);
    expect(shouldReload('dev', 'b1', 0, storage)).toBe(false);
    expect(shouldReload('b2', 'dev', 0, storage)).toBe(false);
  });

  it('reloads once per server version within the guard window', () => {
    const storage = memoryStorage();
    expect(shouldReload('b2', 'b1', 0, storage)).toBe(true);
    expect(shouldReload('b2', 'b1', 60_000, storage)).toBe(false);
    expect(shouldReload('b2', 'b1', 11 * 60_000, storage)).toBe(true);
    expect(shouldReload('b3', 'b1', 11 * 60_000 + 1, storage)).toBe(true);
  });
});
