// Terminal helpers for scripts that talk to a deployed Worker with a token.
import { createInterface } from 'node:readline/promises';
import { parseTokenRole, type Role } from '../apps/worker/src/auth/token.ts';

/** Tokens are read without echo; refuse anything that is not an interactive terminal. */
export function requireTty(): void {
  if (!process.stdin.isTTY) {
    throw new Error('Run this in an interactive terminal; tokens are read without echo.');
  }
}

/** Reads one line from the terminal without echoing it. */
export function promptHidden(question: string): Promise<string> {
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

/** Asks for a token of `role` and checks its format locally before anything is sent. */
export async function askToken(role: Role, optional: boolean): Promise<string | undefined> {
  const hint = optional ? ' (Enter to skip)' : '';
  const token = await promptHidden(`${role} token${hint}: `);
  if (optional && token === '') return undefined;
  if (parseTokenRole(token) !== role) {
    throw new Error(`That is not a well-formed ${role} token; nothing was sent.`);
  }
  return token;
}

/** Worker origin from an argument or a prompt; plain HTTP only for localhost. */
export async function askBaseUrl(raw: string | undefined): Promise<string> {
  let value = raw;
  if (value === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    value = (await rl.question('Worker URL (https://…): ')).trim();
    rl.close();
  }
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) {
    throw new Error('Refusing to send tokens over plain HTTP; use https://');
  }
  return url.origin;
}

interface ApiError {
  error?: { code?: string; message?: string };
}

/** Calls the admin API; non-2xx answers become an error with the API code and message. */
export async function requestJson(
  url: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const error = (json as ApiError).error;
    throw new Error(`${method} failed: ${res.status} ${error?.code ?? ''} ${error?.message ?? ''}`.trim());
  }
  return json;
}

export function runMain(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
