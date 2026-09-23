export interface Env {
  ASSETS: Fetcher;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return json({ ok: true });
    }
    if (url.pathname === '/' || url.pathname === '/display') {
      return Response.redirect(new URL('/display/', url).toString(), 302);
    }

    // Matching static assets are normally served before the Worker runs; this covers `run_worker_first` routes.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return asset;
    }
    return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  },
} satisfies ExportedHandler<Env>;
