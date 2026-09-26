import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';
import { errorKey } from './errors';

// Fictional token used only in tests.
const TOKEN = `dsh_admin_${'A'.repeat(43)}`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(respond: () => Response | Promise<Response>) {
  const fetchFn = vi.fn(async () => respond()) as unknown as typeof fetch;
  const onUnauthorized = vi.fn();
  return { api: createApi(TOKEN, onUnauthorized, fetchFn), fetchFn, onUnauthorized };
}

describe('createApi', () => {
  it('sends the token and parses the answer', async () => {
    const { api, fetchFn } = setup(() => json(200, [{ id: 'acc_1' }]));
    expect(await api.get('/api/v1/accounts')).toEqual([{ id: 'acc_1' }]);
    const [path, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(path).toBe('/api/v1/accounts');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(init?.body).toBeUndefined();
  });

  it('sends a JSON body with its content type', async () => {
    const { api, fetchFn } = setup(() => json(201, { id: 'src_1' }));
    await api.post('/api/v1/accounts/acc_1/sources', { remoteId: 'r1' });
    const [, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(init?.body).toBe('{"remoteId":"r1"}');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('accepts 204 without a body', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.delete('/api/v1/accounts/acc_1')).resolves.toBeUndefined();
  });

  it('turns an error answer into an ApiError with its code', async () => {
    const { api } = setup(() => json(409, { error: { code: 'reauth_required', message: 'again' } }));
    const error = await api.get('/api/v1/accounts/acc_1/discover').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'reauth_required' });
  });

  it('names the code after the status when the answer is not JSON', async () => {
    const { api } = setup(() => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(api.get('/api/v1/accounts')).rejects.toMatchObject({ status: 502, code: 'http_502' });
  });

  it('calls onUnauthorized on 401 only', async () => {
    const rejected = setup(() => json(401, { error: { code: 'unauthorized', message: 'no' } }));
    await rejected.api.get('/api/v1/accounts').catch(() => undefined);
    expect(rejected.onUnauthorized).toHaveBeenCalledTimes(1);

    const forbidden = setup(() => json(403, { error: { code: 'forbidden', message: 'no' } }));
    await forbidden.api.get('/api/v1/accounts').catch(() => undefined);
    expect(forbidden.onUnauthorized).not.toHaveBeenCalled();
  });

  it('reports an unreachable server as the network error', async () => {
    const { api } = setup(() => {
      throw new TypeError('offline');
    });
    await expect(api.get('/api/v1/accounts')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});

describe('errorKey', () => {
  it('maps known codes and falls back to the generic message', () => {
    expect(errorKey(new ApiError(0, 'network', ''))).toBe('admin.error.network');
    expect(errorKey(new ApiError(409, 'reauth_required', ''))).toBe('admin.error.reauth');
    expect(errorKey(new ApiError(503, 'provider_unavailable', ''))).toBe('admin.error.unavailable');
    expect(errorKey(new ApiError(500, 'not_configured', ''))).toBe('admin.error.notConfigured');
    expect(errorKey(new ApiError(400, 'validation_error', ''))).toBe('admin.error.generic');
    expect(errorKey(new Error('x'))).toBe('admin.error.generic');
  });
});
