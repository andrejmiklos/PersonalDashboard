import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { createSecretBox, fromBase64, SecretBoxError, toBase64 } from './secret-box';

// Fictional keys used only in tests.
const KEY = toBase64(new Uint8Array(32).fill(7));
const OTHER_KEY = toBase64(new Uint8Array(32).fill(8));

describe('secret box', () => {
  it('opens what it sealed', async () => {
    const box = await createSecretBox(KEY);
    const sealed = await box.seal('refresh-token-value', 'refresh:acc_a');
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(sealed).not.toContain('refresh-token-value');
    expect(await box.open(sealed, 'refresh:acc_a')).toBe('refresh-token-value');
  });

  it('seals large and non-ASCII payloads', async () => {
    const box = await createSecretBox(KEY);
    const text = 'Príhoda ☀ '.repeat(20_000);
    expect(await box.open(await box.seal(text, 'ctx'), 'ctx')).toBe(text);
  });

  it('uses a fresh IV for every seal', async () => {
    const box = await createSecretBox(KEY);
    expect(await box.seal('same', 'ctx')).not.toBe(await box.seal('same', 'ctx'));
  });

  it('rejects another context, another key and tampered values', async () => {
    const box = await createSecretBox(KEY);
    const sealed = await box.seal('secret', 'refresh:acc_a');

    await expect(box.open(sealed, 'refresh:acc_b')).rejects.toBeInstanceOf(SecretBoxError);
    await expect(box.open(sealed, 'access:acc_a')).rejects.toBeInstanceOf(SecretBoxError);
    await expect((await createSecretBox(OTHER_KEY)).open(sealed, 'refresh:acc_a')).rejects.toBeInstanceOf(
      SecretBoxError,
    );

    const [version, iv, cipher] = sealed.split('.') as [string, string, string];
    const flipped = fromBase64(cipher);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    await expect(box.open(`${version}.${iv}.${toBase64(flipped)}`, 'refresh:acc_a')).rejects.toBeInstanceOf(
      SecretBoxError,
    );
  });

  it('rejects malformed sealed values', async () => {
    const box = await createSecretBox(KEY);
    for (const bad of ['', 'plain', 'v2.AAAA.AAAA', 'v1.AAAA', 'v1.AAAA.AAAA.AAAA', 'v1.!!!.???']) {
      await expect(box.open(bad, 'ctx')).rejects.toBeInstanceOf(SecretBoxError);
    }
  });

  it('refuses a missing or wrongly sized key', async () => {
    for (const bad of [
      undefined,
      '',
      'not base64 !!',
      toBase64(new Uint8Array(16)),
      toBase64(new Uint8Array(33)),
    ]) {
      const err = await createSecretBox(bad).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('not_configured');
    }
  });
});
