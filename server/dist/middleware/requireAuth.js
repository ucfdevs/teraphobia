import { verifyAccessToken } from '../lib/session.js';
// Checks `Authorization: Bearer <access token>` and sets req.userId.
export function requireAuth(req, res, next) {
    const [scheme, token] = req.get('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ error: 'Sign in required' });
        return;
    }
    const userId = verifyAccessToken(token);
    if (!userId) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    req.userId = userId;
    next();
}
