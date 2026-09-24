import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';

/** Uniform error body (docs/07-api.md). */
export interface ErrorBody {
  error: { code: string; message: string };
}

/** An error that is safe to show to the client as is. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const HTTP_EXCEPTION_CODES: Partial<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
};

export function errorJson(c: Context, status: ContentfulStatusCode, code: string, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return c.json(body, status);
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof ApiError) {
    return errorJson(c, err.status, err.code, err.message);
  }
  // Thrown by Hono itself and its middleware (e.g. malformed input).
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    return errorJson(
      c,
      status,
      HTTP_EXCEPTION_CODES[status] ?? 'http_error',
      err.message || 'Request failed',
    );
  }
  // Name and message only: never log request data, tokens or provider payloads.
  console.error(`unhandled ${err.name}: ${err.message}`);
  return errorJson(c, 500, 'internal_error', 'Internal error');
}

export function handleNotFound(c: Context): Response {
  return errorJson(c, 404, 'not_found', 'Not found');
}
