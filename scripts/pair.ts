// Creates a one-time pairing code for a display (docs/06-security-and-public-repo.md §2.1):
//   npm run pair -- [--label "kitchen tablet"] [--remote]
// Type the code on the display within 10 minutes; it then receives its own device token.
// Without --remote it works on the local development database.
import { parseArgs } from 'node:util';
import { formatPairingCode } from '../apps/worker/src/display/pairing-code.ts';
import { runMain } from './cli.ts';
import { planPair } from './pair-sql.ts';
import { executeD1, returnedOnly } from './wrangler-d1.ts';

runMain(async () => {
  const { values } = parseArgs({
    options: {
      label: { type: 'string', default: 'display' },
      remote: { type: 'boolean', default: false },
    },
  });
  const plan = await planPair(values.label, new Date());
  const results = executeD1(plan.statements.join(';\n'), values.remote);
  if (!returnedOnly(results[1], 'code_hash', plan.codeHash)) {
    throw new Error('Pairing code was not stored; nothing to show');
  }
  const target = values.remote ? 'production' : 'local';
  console.log(
    `\nPairing code for the ${target} database (valid until ${plan.expiresAt.toLocaleTimeString()}):\n`,
  );
  console.log(`  ${formatPairingCode(plan.code)}\n`);
  console.log('Enter it on the display. It works once; creating a new code cancels this one.');
});
