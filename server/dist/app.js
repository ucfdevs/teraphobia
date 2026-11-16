import express from 'express';
import { createAuthRouter } from './routes/auth.js';
import { createGamesRouter } from './routes/games.js';
import { createRoomsRouter } from './routes/rooms.js';
import { createUsersRouter } from './routes/users.js';
export function createApp() {
    const app = express();
    // One proxy hop (Nginx), so rate limits see the real client IP.
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/auth', createAuthRouter());
    app.use('/api/users', createUsersRouter());
    app.use('/api/rooms', createRoomsRouter());
    app.use('/api/games', createGamesRouter());
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
