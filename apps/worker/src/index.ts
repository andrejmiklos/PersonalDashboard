import { createApp } from './app';
import { displayRoutes } from './display/state';
import { layoutRoutes } from './layouts/routes';
import { settingsRoutes } from './settings/routes';

const app = createApp();

app.get('/healthz', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/display/', 302));
app.route('/api/v1/settings', settingsRoutes);
app.route('/api/v1/layouts', layoutRoutes);
app.route('/api/v1/display', displayRoutes);

export default app;
