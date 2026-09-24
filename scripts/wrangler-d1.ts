// Runs SQL against D1 through wrangler, for bootstrap scripts that work without an admin token.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface D1Result {
  results: Record<string, unknown>[];
}

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

/**
 * Executes SQL (one or more `;`-separated statements) and returns one result per statement.
 * wrangler is spawned without a shell, so nothing in the SQL is interpreted by one.
 */
export function executeD1(sql: string, remote: boolean): D1Result[] {
  const args = [WRANGLER, 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--json', '--command', sql];
  const proc = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (proc.status !== 0) {
    throw new Error(`wrangler failed (exit ${proc.status}):\n${proc.stdout}`);
  }
  const results = JSON.parse(proc.stdout) as D1Result[];
  if (results.length === 0) {
    throw new Error('wrangler returned no result');
  }
  return results;
}

/** True when a RETURNING clause reported exactly one row whose `column` equals `value`. */
export function returnedOnly(result: D1Result | undefined, column: string, value: string): boolean {
  return result?.results.length === 1 && result.results[0]?.[column] === value;
}
