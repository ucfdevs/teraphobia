import { randomInt } from 'node:crypto';
// Live rooms live in memory only (PRD). The socket handlers will import this module.
export const MAX_PLAYERS = 8;
const CODE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 4;
const rooms = new Map();
function randomCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1)
        code += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
    return code;
}
export function normalizeCode(code) {
    return code.trim().toUpperCase();
}
export function createRoom(hostUserId, preset) {
    // One live room per host: a new room replaces the old one, so rooms can't pile up.
    for (const room of rooms.values()) {
        if (room.hostUserId === hostUserId)
            rooms.delete(room.code);
    }
    // 26^4 = 456,976 codes, so collisions are rare; the cap only guards against a full store.
    for (let attempt = 0; attempt < 1000; attempt += 1) {
        const code = randomCode();
        if (rooms.has(code))
            continue;
        const room = { code, preset, hostUserId, createdAt: new Date(), seats: [] };
        rooms.set(code, room);
        return room;
    }
    throw new Error('No free room codes');
}
export function getRoom(code) {
    return rooms.get(normalizeCode(code));
}
export function roomStatus(room) {
    if (room.startedAt)
        return 'started';
    if (room.seats.length >= MAX_PLAYERS)
        return 'full';
    return 'open';
}
// Frees the code (game end or host leaves).
export function deleteRoom(code) {
    return rooms.delete(normalizeCode(code));
}
export function clearRooms() {
    rooms.clear();
}
