// Uploads a layout file through the admin API until the editor exists (Phase 4):
//   npm run layout:import -- examples/morning.json https://<your-worker-host> [--default]
// --default also makes it the layout the display shows. The admin token is asked for without echo.
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { askBaseUrl, askToken, requireTty, runMain } from './cli.ts';

const MAX_BYTES = 64 * 1024;

interface ApiError {
  error?: { code?: string; message?: string };
}

async function send(url: string, token: string, method: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const error = (json as ApiError).error;
    throw new Error(`${method} failed: ${res.status} ${error?.code ?? ''} ${error?.message ?? ''}`.trim());
  }
  return json;
}

runMain(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { default: { type: 'boolean', default: false } },
  });
  const [file, rawUrl] = positionals;
  if (file === undefined) {
    throw new Error('Usage: npm run layout:import -- <layout.json> <https://host> [--default]');
  }
  if (statSync(file).size > MAX_BYTES) {
    throw new Error(`${file} is larger than ${MAX_BYTES} bytes`);
  }
  const layout = JSON.parse(readFileSync(file, 'utf8')) as unknown;

  requireTty();
  const baseUrl = await askBaseUrl(rawUrl);
  const token = (await askToken('admin', false)) as string;

  const created = (await send(`${baseUrl}/api/v1/layouts`, token, 'POST', layout)) as {
    id: string;
    name: string;
    version: number;
    tiles: unknown[];
  };
  console.log(`Created ${created.id} "${created.name}" (${created.tiles.length} tiles).`);
  if (values.default) {
    await send(`${baseUrl}/api/v1/settings`, token, 'PUT', { defaultLayoutId: created.id });
    console.log('It is now the default layout; the display switches within 15 s.');
  }
});
