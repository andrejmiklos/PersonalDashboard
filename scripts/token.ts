// Bootstrap CLI for API tokens (docs/07-api.md §7), writing to D1 through wrangler.
//   npm run token:create -- --role device --label "kitchen tablet" [--remote]
//   npm run token:revoke -- tok_abcdefghijklmnop [--remote]
//   npm run token:list [-- --remote]
// Without --remote it works on the local development database.
import { parseArgs } from 'node:util';
import { runMain } from './cli.ts';
import { LIST_SQL, planCreate, planRevoke } from './token-sql.ts';
import { executeD1, returnedOnly } from './wrangler-d1.ts';

runMain(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      role: { type: 'string' },
      label: { type: 'string' },
      remote: { type: 'boolean', default: false },
    },
  });
  const target = values.remote ? 'REMOTE (production)' : 'local';

  switch (command) {
    case 'create': {
      const plan = await planCreate(values.role, values.label, new Date());
      console.log(`Creating ${plan.role} token in the ${target} database…`);
      if (!returnedOnly(executeD1(plan.sql, values.remote)[0], 'id', plan.id)) {
        throw new Error('Token was not stored; nothing to show');
      }
      console.log(
        `\nCreated ${plan.id}. The token is shown only once; store it in your password manager now:\n`,
      );
      console.log(`  ${plan.token}\n`);
      return;
    }
    case 'revoke': {
      const id = positionals[0];
      const revoked = returnedOnly(executeD1(planRevoke(id, new Date()), values.remote)[0], 'id', id ?? '');
      console.log(revoked ? `Revoked ${id}.` : 'No active token with that id; nothing changed.');
      return;
    }
    case 'list': {
      console.table(executeD1(LIST_SQL, values.remote)[0]?.results);
      return;
    }
    default:
      throw new Error('Usage: token.ts create|revoke|list (see the header of scripts/token.ts)');
  }
});
