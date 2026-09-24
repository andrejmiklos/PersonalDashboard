import { createApp } from './app';
import { settingsRoutes } from './settings/routes';

const app = createApp();

app.get('/healthz', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/display/', 302));
app.route('/api/v1/settings', settingsRoutes);

export default app;
