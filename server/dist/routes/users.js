import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { myGames } from './games.js';
import { User } from '../models/user.js';
import { validDisplayName } from '../lib/validation.js';
export function profile(user) {
    const signInMethods = [];
    if (user.passwordHash)
        signInMethods.push('password');
    if (user.googleId)
        signInMethods.push('google');
    const { stats } = user.toObject();
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarId: user.avatarId ?? null,
        emailVerified: user.emailVerified,
        signInMethods,
        stats,
        createdAt: user.get('createdAt'),
    };
}
// Loads the signed-in user, or answers 401 if the account no longer exists.
export async function loadUser(req, res) {
    const user = await User.findById(req.userId);
    if (!user)
        res.status(401).json({ error: 'Account not found' });
    return user;
}
async function getMe(req, res) {
    const user = await loadUser(req, res);
    if (user)
        res.json(profile(user));
}
async function updateMe(req, res) {
    const { displayName, avatarId } = req.body ?? {};
    const update = {};
    if (displayName !== undefined) {
        const name = validDisplayName(displayName);
        if (!name) {
            res.status(400).json({ error: 'Display name must be 1 to 32 characters' });
            return;
        }
        update.displayName = name;
    }
    if (avatarId !== undefined) {
        // Any short id until the preset icon list exists.
        if (typeof avatarId !== 'string' || avatarId.trim().length < 1 || avatarId.trim().length > 32) {
            res.status(400).json({ error: 'Avatar id must be 1 to 32 characters' });
            return;
        }
        update.avatarId = avatarId.trim();
    }
    const user = await User.findByIdAndUpdate(req.userId, update, { returnDocument: 'after' });
    if (!user) {
        res.status(401).json({ error: 'Account not found' });
        return;
    }
    res.json(profile(user));
}
export function createUsersRouter() {
    const router = Router();
    router.use(requireAuth);
    router.get('/me', getMe);
    router.patch('/me', updateMe);
    router.get('/me/games', myGames);
    return router;
}
