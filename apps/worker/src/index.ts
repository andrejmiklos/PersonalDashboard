import { accountRoutes, sourceRoutes } from './accounts/routes';
import { createApp } from './app';
import { dataRoutes } from './data/routes';
import { pairRoutes } from './display/pair';
import { displayRoutes } from './display/state';
import { rateLimit } from './http/rate-limit';
import { layoutRoutes } from './layouts/routes';
import { resolveOAuthProvider } from './oauth/registry';
import { createOAuthRoutes } from './oauth/routes';
import { settingsRoutes } from './settings/routes';
import { taskRoutes } from './tasks/routes';

const app = createApp();

app.get('/healthz', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/display/', 302));
app.use(
  '/api/*',
  rateLimit((env) => env.API_LIMITER),
);
app.use(
  '/oauth/*',
  rateLimit((env) => env.API_LIMITER),
);
app.route('/', createOAuthRoutes(resolveOAuthProvider));
app.route('/api/v1/settings', settingsRoutes);
app.route('/api/v1/accounts', accountRoutes);
app.route('/api/v1/sources', sourceRoutes);
app.route('/api/v1/layouts', layoutRoutes);
app.route('/api/v1/display/pair', pairRoutes);
app.route('/api/v1/display', displayRoutes);
app.route('/api/v1/data', dataRoutes);
app.route('/api/v1/tasks', taskRoutes);

export default app;
