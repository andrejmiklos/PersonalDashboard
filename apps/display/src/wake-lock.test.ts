import { describe, expect, it, vi } from 'vitest';
import { keepScreenAwake } from './wake-lock';

type FakeDocument = EventTarget & { visibilityState: DocumentVisibilityState };

function fakeDocument(visibilityState: DocumentVisibilityState): FakeDocument {
  return Object.assign(new EventTarget(), { visibilityState });
}

function fakeWakeLock(refuseFirst = false) {
  const sentinels: EventTarget[] = [];
  const request = vi.fn(async () => {
    if (refuseFirst && request.mock.calls.length === 1) throw new Error('NotAllowedError');
    const sentinel = new EventTarget();
    sentinels.push(sentinel);
    return sentinel;
  });
  return { lock: { request } as unknown as WakeLock, request, sentinels };
}

function start(lock: WakeLock, doc: FakeDocument): void {
  keepScreenAwake(lock, doc as unknown as Document);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('keepScreenAwake', () => {
  it('requests a screen lock while the page is visible', async () => {
    const { lock, request } = fakeWakeLock();
    start(lock, fakeDocument('visible'));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('waits until a hidden page becomes visible', async () => {
    const { lock, request } = fakeWakeLock();
    const doc = fakeDocument('hidden');
    start(lock, doc);
    await settle();
    expect(request).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not stack locks while one is held', async () => {
    const { lock, request } = fakeWakeLock();
    const doc = fakeDocument('visible');
    start(lock, doc);
    await settle();
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requests the lock again after the browser released it', async () => {
    const { lock, request, sentinels } = fakeWakeLock();
    const doc = fakeDocument('visible');
    start(lock, doc);
    await settle();

    sentinels[0]!.dispatchEvent(new Event('release'));
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries a refused request on the next visibility change', async () => {
    const { lock, request, sentinels } = fakeWakeLock(true);
    const doc = fakeDocument('visible');
    start(lock, doc);
    await settle();
    expect(sentinels).toHaveLength(0);

    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(sentinels).toHaveLength(1);
  });

  it('does nothing without the API', () => {
    expect(() => keepScreenAwake(undefined, fakeDocument('visible') as unknown as Document)).not.toThrow();
  });
});
