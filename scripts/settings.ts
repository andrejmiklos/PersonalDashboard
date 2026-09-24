// Shows or changes the Worker settings through the admin API until the admin app exists (Phase 4):
//   npm run settings -- https://<your-worker-host>
//   npm run settings -- https://<your-worker-host> --location "My city" --lat 50 --lon 10
//   npm run settings -- https://<your-worker-host> --no-location
//   npm run settings -- https://<your-worker-host> --locale en --timezone Europe/Prague
// Negative coordinates: --lon=-3.7. The admin token is asked for without echo.
import { parseArgs } from 'node:util';
import { askBaseUrl, askToken, requestJson, requireTty, runMain } from './cli.ts';
import { buildSettingsPatch } from './settings-patch.ts';

runMain(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      location: { type: 'string' },
      lat: { type: 'string' },
      lon: { type: 'string' },
      'no-location': { type: 'boolean' },
      locale: { type: 'string' },
      timezone: { type: 'string' },
    },
  });
  if (positionals.length > 1) {
    throw new Error('Usage: npm run settings -- <https://host> [--location <label> --lat <n> --lon <n>]');
  }
  const patch = buildSettingsPatch(values);

  requireTty();
  const baseUrl = await askBaseUrl(positionals[0]);
  const token = (await askToken('admin', false)) as string;

  const url = `${baseUrl}/api/v1/settings`;
  const settings =
    patch === null ? await requestJson(url, token, 'GET') : await requestJson(url, token, 'PUT', patch);
  if (patch !== null) console.log('Saved.');
  console.log(JSON.stringify(settings, null, 2));
});
