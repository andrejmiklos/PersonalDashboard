import { createApp } from './app';

const app = createApp();

app.get('/healthz', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/display/', 302));

export default app;
