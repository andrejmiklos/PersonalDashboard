// Bootstrap CLI for API tokens (docs/07-api.md §7), writing to D1 through wrangler.
//   npm run token:create -- --role device --label "kitchen tablet" [--remote]
//   npm run token:revoke -- tok_abcdefghijklmnop [--remote]
//   npm run token:list [-- --remote]
// Without --remote it works on the local development database.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { LIST_SQL, planCreate, planRevoke } from './token-sql.ts';

interface D1Result {
  results: Record<string, unknown>[];
}

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

/** True when the statement's RETURNING clause reported exactly this one row. */
function affectedOnly(result: D1Result, id: string): boolean {
  return result.results.length === 1 && result.results[0]?.['id'] === id;
}

/** Runs one SQL statement via wrangler without a shell, so nothing is interpreted by it. */
function execute(sql: string, remote: boolean): D1Result {
  const args = [WRANGLER, 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--json', '--command', sql];
  const proc = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (proc.status !== 0) {
    throw new Error(`wrangler failed (exit ${proc.status}):\n${proc.stdout}`);
  }
  const [result] = JSON.parse(proc.stdout) as D1Result[];
  if (!result) {
    throw new Error('wrangler returned no result');
  }
  return result;
}

async function main(): Promise<void> {
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
      if (!affectedOnly(execute(plan.sql, values.remote), plan.id)) {
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
      const revoked = affectedOnly(execute(planRevoke(id, new Date()), values.remote), id ?? '');
      console.log(revoked ? `Revoked ${id}.` : 'No active token with that id; nothing changed.');
      return;
    }
    case 'list': {
      console.table(execute(LIST_SQL, values.remote).results);
      return;
    }
    default:
      throw new Error('Usage: token.ts create|revoke|list (see the header of scripts/token.ts)');
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
