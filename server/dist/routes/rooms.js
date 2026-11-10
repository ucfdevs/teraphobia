import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { PRESETS } from '../models/game.js';
import { createRoom, getRoom, roomStatus } from '../rooms/store.js';
import { loadUser } from './users.js';
async function create(req, res) {
    const preset = req.body?.preset ?? 'normal';
    if (!PRESETS.includes(preset)) {
        res.status(400).json({ error: `preset must be one of ${PRESETS.join(', ')}` });
        return;
    }
    const user = await loadUser(req, res);
    if (!user)
        return;
    if (!user.emailVerified) {
        res.status(403).json({ error: 'Verify your email to host a game' });
        return;
    }
    const room = createRoom(user.id, preset);
    res.status(201).json({ code: room.code, preset: room.preset });
}
function check(req, res) {
    const room = getRoom(req.params.code);
    if (!room) {
        res.status(404).json({ error: 'Room not found' });
        return;
    }
    res.json({ code: room.code, status: roomStatus(room) });
}
export function createRoomsRouter() {
    const router = Router();
    router.post('/', requireAuth, create);
    router.get('/:code', check);
    return router;
}
