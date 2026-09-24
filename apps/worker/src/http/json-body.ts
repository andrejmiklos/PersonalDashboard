import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { z } from 'zod';
import { ApiError } from '../errors';

/** Rejects request bodies over `maxSize` bytes before they are read. */
export function limitBody(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new ApiError(413, 'payload_too_large', `Body exceeds ${maxSize} bytes`);
    },
  });
}

/** Reads a JSON body and validates it; every failure becomes a 4xx with a short, input-only message. */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  if (!/^application\/json\b/i.test(c.req.header('Content-Type') ?? '')) {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_request', 'Malformed JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new ApiError(400, 'validation_error', `${path}${issue?.message ?? 'Invalid body'}`);
  }
  return result.data;
}
