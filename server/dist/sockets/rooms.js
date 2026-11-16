// The lobby over socket.io (FR-5, FR-6): phones join by code and name, the host screen sees the live list,
// can kick before Start, and starts the game. Every payload goes through onEvent and emitEvent (schemas.ts).
import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/session.js';
import { addSeat, findRoomByHost, getRoom, MAX_PLAYERS, MIN_PLAYERS, nameTaken, removeSeat } from '../rooms/store.js';
import { emitEvent, onEvent, rejectUnknownEvents, sendError } from './events.js';
function channel(code) {
    return `room:${code}`;
}
export function roomState(room) {
    return {
        code: room.code,
        status: room.startedAt ? 'playing' : 'lobby',
        preset: room.preset,
        hostConnected: room.hostConnected,
        seats: room.seats.map((seat) => ({
            seatId: seat.seatId,
            displayName: seat.displayName,
            connected: seat.connected,
            // Death and costumes come with the game engine (#23, #24).
            lifeStatus: 'alive',
            costume: null,
        })),
    };
}
export function createSocketServer(httpServer) {
    const io = new Server(httpServer, { path: '/socket.io', serveClient: false });
    // The socket in each seat and the host screen of each room, so a kick can disconnect the right phone
    // and an old host tab closing doesn't mark a newer one as gone.
    const seatSockets = new Map();
    const hostSockets = new Map();
    function broadcast(room) {
        emitEvent(io.to(channel(room.code)), 'room:state', roomState(room));
    }
    // A bad token is refused before connecting, so the host screen sees connect_error instead of joining as a phone.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (token === undefined)
            return next();
        const userId = typeof token === 'string' ? verifyAccessToken(token) : null;
        if (!userId)
            return next(new Error('Invalid or expired token'));
        socket.data.userId = userId;
        next();
    });
    io.on('connection', (socket) => {
        const data = socket.data;
        rejectUnknownEvents(socket);
        if (data.userId)
            connectHost(socket, data);
        onEvent(socket, 'room:join', ({ code, displayName }) => {
            if (data.role)
                return sendError(socket, 'not_allowed', 'Already in a room', 'room:join');
            const room = getRoom(code);
            if (!room)
                return sendError(socket, 'room_not_found', 'No room with that code', 'room:join');
            if (room.startedAt)
                return sendError(socket, 'game_started', 'Game already started', 'room:join');
            if (room.seats.length >= MAX_PLAYERS)
                return sendError(socket, 'room_full', 'This room is full', 'room:join');
            if (nameTaken(room, displayName))
                return sendError(socket, 'name_taken', 'That name is taken in this room', 'room:join');
            const seat = addSeat(room, displayName);
            Object.assign(data, { role: 'player', code: room.code, seatId: seat.seatId });
            seatSockets.set(seat.seatId, socket);
            socket.join(channel(room.code));
            broadcast(room);
        });
        onEvent(socket, 'room:kick', ({ seatId }) => {
            const room = hostRoom(socket, data, 'room:kick');
            if (!room)
                return;
            if (room.startedAt)
                return sendError(socket, 'game_started', 'Players can only be kicked before Start', 'room:kick');
            if (!removeSeat(room, seatId))
                return sendError(socket, 'invalid_target', 'No player in that seat', 'room:kick');
            const kicked = seatSockets.get(seatId);
            seatSockets.delete(seatId);
            if (kicked) {
                // Cleared first (the same object its handlers hold), so its disconnect handler does nothing more.
                Object.assign(kicked.data, { role: undefined, code: undefined, seatId: undefined });
                kicked.disconnect(true);
            }
            broadcast(room);
        });
        onEvent(socket, 'room:start', () => {
            const room = hostRoom(socket, data, 'room:start');
            if (!room)
                return;
            if (room.startedAt)
                return sendError(socket, 'game_started', 'Game already started', 'room:start');
            if (room.seats.length < MIN_PLAYERS) {
                return sendError(socket, 'not_enough_players', `At least ${MIN_PLAYERS} players are needed to start`, 'room:start');
            }
            // Closes the code to new phones; dealing and phases come with #23 and #24.
            room.startedAt = new Date();
            broadcast(room);
        });
        socket.on('disconnect', () => {
            const room = data.code ? getRoom(data.code) : undefined;
            if (!room)
                return;
            if (data.role === 'host') {
                if (hostSockets.get(room.code) !== socket)
                    return;
                hostSockets.delete(room.code);
                room.hostConnected = false;
            }
            else if (data.role === 'player' && data.seatId) {
                seatSockets.delete(data.seatId);
                // Before Start a phone that leaves frees its seat. After Start the seat stays for rejoining (#29).
                if (!room.startedAt)
                    removeSeat(room, data.seatId);
                else {
                    const seat = room.seats.find((s) => s.seatId === data.seatId);
                    if (seat)
                        seat.connected = false;
                }
            }
            broadcast(room);
        });
    });
    // The host screen joins its own room as the screen, not a seat.
    function connectHost(socket, data) {
        const room = findRoomByHost(data.userId);
        if (!room) {
            sendError(socket, 'room_not_found', 'Create a room first');
            socket.disconnect(true);
            return;
        }
        // A newer host tab replaces an older one. The new one is recorded first, so the old one's disconnect is ignored.
        const previous = hostSockets.get(room.code);
        hostSockets.set(room.code, socket);
        previous?.disconnect(true);
        Object.assign(data, { role: 'host', code: room.code });
        room.hostConnected = true;
        socket.join(channel(room.code));
        broadcast(room);
    }
    function hostRoom(socket, data, event) {
        const room = data.role === 'host' && data.code ? getRoom(data.code) : undefined;
        if (!room || room.hostUserId !== data.userId) {
            sendError(socket, 'not_host', 'Only the host can do that', event);
            return undefined;
        }
        return room;
    }
    return io;
}
