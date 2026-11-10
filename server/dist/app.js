import express from 'express';
import { authRouter } from './routes/auth.js';
export function createApp() {
    const app = express();
    // One proxy hop (Nginx), so rate limits see the real client IP.
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use((_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
    app.use((err, _req, res, _next) => {
        const status = err.status ?? 500;
        if (status >= 500)
            console.error(err);
        res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
    });
    return app;
}
