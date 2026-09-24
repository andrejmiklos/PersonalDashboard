// Read-only smoke test of a deployed Worker:
//   npm run smoke -- https://<your-worker-host>
// Tokens are asked for without echo, so they never reach the shell history or the output.
import { askBaseUrl, askToken, requireTty, runMain } from './cli.ts';
import { runChecks } from './smoke-checks.ts';

runMain(async () => {
  requireTty();
  const baseUrl = await askBaseUrl(process.argv[2]);
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
});
