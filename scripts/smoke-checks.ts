// Read-only checks of a deployed Worker. Nothing here may change stored state:
// the only non-GET requests are ones the server must reject.

export interface SmokeInput {
  baseUrl: string;
  adminToken: string;
  deviceToken?: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const SETTING_KEYS = ['defaultLayoutId', 'locale', 'location', 'powerMode', 'timezone'];
const WORKER_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    return ((await res.json()) as { error?: { code?: string } }).error?.code;
  } catch {
    return undefined;
  }
}

function result(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, detail };
}

/** Status plus error code; never the body itself, which may hold personal settings. */
async function expectError(name: string, res: Response, status: number, code: string): Promise<CheckResult> {
  const actual = await errorCode(res);
  return result(name, res.status === status && actual === code, `${res.status} ${actual ?? '-'}`);
}

export async function runChecks(input: SmokeInput, fetchImpl: Fetch = fetch): Promise<CheckResult[]> {
  const url = (path: string) => new URL(path, input.baseUrl).toString();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const settings = url('/api/v1/settings');
  const checks: CheckResult[] = [];

  const health = await fetchImpl(url('/healthz'));
  checks.push(result('healthz answers', health.status === 200, `${health.status}`));

  const display = await fetchImpl(url('/display/'));
  const displayCsp = display.headers.get('Content-Security-Policy') ?? '';
  checks.push(
    result(
      'display shell has its CSP',
      display.status === 200 && displayCsp.includes("script-src 'self'"),
      `${display.status}`,
    ),
  );

  const anonymous = await fetchImpl(settings);
  checks.push(
    result('no token -> WWW-Authenticate', anonymous.headers.get('WWW-Authenticate') === 'Bearer', 'header'),
    await expectError('no token -> 401', anonymous, 401, 'unauthorized'),
  );

  const forged = `dsh_admin_${'A'.repeat(43)}`;
  checks.push(
    await expectError(
      'unknown token -> 401',
      await fetchImpl(settings, { headers: bearer(forged) }),
      401,
      'unauthorized',
    ),
  );

  const admin = await fetchImpl(settings, { headers: bearer(input.adminToken) });
  let keys: string[] = [];
  try {
    keys = Object.keys((await admin.json()) as object).sort();
  } catch {
    // Reported below as a failed check.
  }
  checks.push(
    result(
      'admin reads settings',
      admin.status === 200 && keys.join() === SETTING_KEYS.join(),
      `${admin.status}`,
    ),
    result('API sends deny-all CSP', admin.headers.get('Content-Security-Policy') === WORKER_CSP, 'header'),
    result('API sends nosniff', admin.headers.get('X-Content-Type-Options') === 'nosniff', 'header'),
    result('API sends no-store', admin.headers.get('Cache-Control') === 'no-store', 'header'),
  );

  const json = { 'Content-Type': 'application/json' };
  const crossOrigin = await fetchImpl(settings, {
    method: 'PUT',
    headers: { ...bearer(input.adminToken), ...json, Origin: 'https://evil.example' },
    body: '{"locale":"en"}',
  });
  checks.push(await expectError('foreign Origin write -> 403', crossOrigin, 403, 'forbidden_origin'));

  const invalid = await fetchImpl(settings, {
    method: 'PUT',
    headers: { ...bearer(input.adminToken), ...json },
    body: '{"smokeTestUnknownField":true}',
  });
  checks.push(await expectError('invalid write -> 400', invalid, 400, 'validation_error'));

  if (input.deviceToken !== undefined) {
    const device = await fetchImpl(settings, { headers: bearer(input.deviceToken) });
    checks.push(await expectError('device token -> 403', device, 403, 'forbidden'));
    const state = await fetchImpl(url('/api/v1/display/state'), { headers: bearer(input.deviceToken) });
    const etag = state.headers.get('ETag');
    checks.push(
      result('device reads display state', state.status === 200 && etag !== null, `${state.status}`),
    );
    if (etag !== null) {
      const again = await fetchImpl(url('/api/v1/display/state'), {
        headers: { ...bearer(input.deviceToken), 'If-None-Match': etag },
      });
      checks.push(result('display state honours ETag', again.status === 304, `${again.status}`));
    }
  }
  return checks;
}
