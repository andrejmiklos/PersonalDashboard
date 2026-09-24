// Read-only smoke test of a deployed Worker:
//   npm run smoke -- https://<your-worker-host>
// Tokens are asked for without echo, so they never reach the shell history or the output.
import { createInterface } from 'node:readline/promises';
import { parseTokenRole, type Role } from '../apps/worker/src/auth/token.ts';
import { runChecks } from './smoke-checks.ts';

/** Reads one line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (finish: () => void) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      finish();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(() => resolve(value.trim()));
        if (ch === '\u0003') return done(() => reject(new Error('Cancelled')));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function askToken(role: Role, optional: boolean): Promise<string | undefined> {
  const hint = optional ? ' (Enter to skip)' : '';
  const token = await promptHidden(`${role} token${hint}: `);
  if (optional && token === '') return undefined;
  if (parseTokenRole(token) !== role) {
    throw new Error(`That is not a well-formed ${role} token; nothing was sent.`);
  }
  return token;
}

async function askBaseUrl(): Promise<string> {
  let raw = process.argv[2];
  if (raw === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    raw = (await rl.question('Worker URL (https://…): ')).trim();
    rl.close();
  }
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) {
    throw new Error('Refusing to send tokens over plain HTTP; use https://');
  }
  return url.origin;
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('Run this in an interactive terminal; tokens are read without echo.');
  }
  const baseUrl = await askBaseUrl();
  const adminToken = (await askToken('admin', false)) as string;
  const deviceToken = await askToken('device', true);

  const checks = await runChecks({ baseUrl, adminToken, ...(deviceToken ? { deviceToken } : {}) });
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}  (${check.detail})`);
  }
  const failed = checks.filter((check) => !check.ok).length;
  console.log(
    failed === 0 ? `\nAll ${checks.length} checks passed.` : `\n${failed} of ${checks.length} checks failed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
