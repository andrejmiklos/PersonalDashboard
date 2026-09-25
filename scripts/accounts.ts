// Connects provider accounts and chooses calendars / task lists through the admin API until the admin app
// exists (Phase 4). The admin token is asked for without echo.
//   npm run accounts -- https://<your-worker-host>                                    list
//   npm run accounts -- https://<your-worker-host> --connect google|microsoft         prints the URL to open
//   npm run accounts -- https://<your-worker-host> --discover <account id>            what the account has
//   npm run accounts -- https://<your-worker-host> --add <account id> --remote-id <id> [--label <text>] [--color #rrggbb]
//   npm run accounts -- https://<your-worker-host> --source <source id> [--label <text>] [--color #rrggbb] [--enable|--disable]
//   npm run accounts -- https://<your-worker-host> --delete-account <account id> --yes
import { parseArgs } from 'node:util';
import { formatDiscovered, formatOverview, parseAccountsArgs } from './accounts-cli.ts';
import { askBaseUrl, askToken, requestJson, requireTty, runMain } from './cli.ts';

runMain(async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      connect: { type: 'string' },
      discover: { type: 'string' },
      add: { type: 'string' },
      'remote-id': { type: 'string' },
      source: { type: 'string' },
      label: { type: 'string' },
      color: { type: 'string' },
      enable: { type: 'boolean' },
      disable: { type: 'boolean' },
      'delete-account': { type: 'string' },
      yes: { type: 'boolean' },
    },
  });
  if (positionals.length > 1) {
    throw new Error(
      'Usage: npm run accounts -- <https://host> [--connect <provider> | --discover <account id> | …]',
    );
  }
  const action = parseAccountsArgs(values);

  requireTty();
  const baseUrl = await askBaseUrl(positionals[0]);
  const token = (await askToken('admin', false)) as string;
  const api = (path: string, method = 'GET', body?: unknown) =>
    requestJson(`${baseUrl}/api/v1${path}`, token, method, body);

  switch (action.kind) {
    case 'list': {
      const accounts = (await api('/accounts')) as Parameters<typeof formatOverview>[0];
      const sources = (await api('/sources')) as Parameters<typeof formatOverview>[1];
      console.log(formatOverview(accounts, sources));
      break;
    }
    case 'connect': {
      const { url } = (await api(`/admin/oauth/${action.provider}/start`, 'POST')) as { url: string };
      console.log('Open this address in a browser on your phone or PC and sign in (valid for 10 minutes):\n');
      console.log(url);
      console.log(
        '\nAfterwards the browser lands on /admin/#/accounts?connected=… (the page itself does not exist before ' +
          'Phase 4); ?error=… means the connection failed. Check with: npm run accounts -- <host>',
      );
      break;
    }
    case 'discover':
      console.log(
        formatDiscovered(
          (await api(`/accounts/${action.accountId}/discover`)) as Parameters<typeof formatDiscovered>[0],
        ),
      );
      break;
    case 'add':
      console.log(
        JSON.stringify(await api(`/accounts/${action.accountId}/sources`, 'POST', action.body), null, 2),
      );
      break;
    case 'update':
      console.log(JSON.stringify(await api(`/sources/${action.sourceId}`, 'PUT', action.body), null, 2));
      break;
    case 'delete':
      await api(`/accounts/${action.accountId}`, 'DELETE');
      console.log("Deleted. Revoke the app in the provider's account security page as well (docs/06 §7).");
      break;
  }
});
