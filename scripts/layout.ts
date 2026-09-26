// Uploads a layout file through the admin API (the admin app can import a file too):
//   npm run layout:import -- examples/morning.json https://<your-worker-host> [--default] [--new]
// A layout with the name of the file is updated, so importing the same file again does not add a copy;
// --new adds a separate layout anyway. --default also makes it the layout the display shows.
// The admin token is asked for without echo.
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { askBaseUrl, askToken, requestJson, requireTty, runMain } from './cli.ts';
import { planImport, type ExistingLayout } from './layout-plan.ts';

const MAX_BYTES = 64 * 1024;

interface Saved {
  id: string;
  name: string;
  version: number;
  tiles: unknown[];
}

runMain(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { default: { type: 'boolean', default: false }, new: { type: 'boolean', default: false } },
  });
  const [file, rawUrl] = positionals;
  if (file === undefined) {
    throw new Error('Usage: npm run layout:import -- <layout.json> <https://host> [--default] [--new]');
  }
  if (statSync(file).size > MAX_BYTES) {
    throw new Error(`${file} is larger than ${MAX_BYTES} bytes`);
  }
  const layout = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

  requireTty();
  const baseUrl = await askBaseUrl(rawUrl);
  const token = (await askToken('admin', false)) as string;

  const existing = (await requestJson(`${baseUrl}/api/v1/layouts`, token, 'GET')) as ExistingLayout[];
  const plan = planImport(existing, layout['name'], values.new);
  if (plan.action === 'ambiguous') {
    throw new Error(
      `${plan.ids.length} layouts are named "${String(layout['name'])}" (${plan.ids.join(', ')}). ` +
        'Delete the copies you do not need in the admin app, or import with --new to add another one.',
    );
  }

  const saved = (
    plan.action === 'update'
      ? await requestJson(`${baseUrl}/api/v1/layouts/${plan.id}`, token, 'PUT', {
          ...layout,
          ifVersion: plan.version,
        })
      : await requestJson(`${baseUrl}/api/v1/layouts`, token, 'POST', layout)
  ) as Saved;
  console.log(
    `${plan.action === 'update' ? 'Updated' : 'Created'} ${saved.id} "${saved.name}" ` +
      `(${saved.tiles.length} tiles, version ${saved.version}).`,
  );
  if (values.default) {
    await requestJson(`${baseUrl}/api/v1/settings`, token, 'PUT', { defaultLayoutId: saved.id });
    console.log('It is now the default layout; the display switches within 15 s.');
  }
});
