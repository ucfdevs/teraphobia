// The host screen's socket: connects with the host's access token, follows the room, and exposes what the
// shared screen needs. Event payloads use the types generated from shared/schemas.

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  GameOver,
  MorningReveal,
  PhaseStart,
  RoomState,
  ServerError,
  VoteReveal,
} from '../../../shared/generated/SocketEvents';

// How long the vote reveal stays up. Night starts the moment Vote ends, so the reveal shows over its first seconds.
const VOTE_REVEAL_MS = 8000;

export interface HostGame {
  connected: boolean;
  room: RoomState | null;
  phase: PhaseStart | null;
  // Server time minus local time, so countdowns follow the server clock.
  clockOffsetMs: number;
  morning: MorningReveal | null;
  vote: VoteReveal | null;
  // True for a few seconds after vote:reveal.
  showingVote: boolean;
  gameOver: GameOver | null;
  error: ServerError | null;
  kick(seatId: string): void;
  start(): void;
  clearError(): void;
}

// getToken is called on every connect and reconnect, so a long game never connects with an expired token.
export function useHostSocket(getToken: () => Promise<string>): HostGame {
  const socketRef = useRef<Socket | null>(null);
  const getTokenRef = useRef(getToken);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [phase, setPhase] = useState<PhaseStart | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [morning, setMorning] = useState<MorningReveal | null>(null);
  const [vote, setVote] = useState<VoteReveal | null>(null);
  const [showingVote, setShowingVote] = useState(false);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [error, setError] = useState<ServerError | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const socket = io({
      transports: ['websocket'],
      // An empty token on failure makes the server refuse the connection, instead of seating us as a phone.
      auth: (cb) => {
        getTokenRef.current().then(
          (token) => cb({ token }),
          () => cb({ token: '' }),
        );
      },
    });
    socketRef.current = socket;
    let voteTimer: ReturnType<typeof setTimeout> | undefined;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => setError({ code: 'internal', message: `Can't reach the game server: ${err.message}` }));
    socket.on('room:state', (state: RoomState) => setRoom(state));
    socket.on('phase:start', (next: PhaseStart) => {
      setClockOffsetMs(next.serverNow - Date.now());
      setPhase(next);
    });
    socket.on('morning:reveal', (reveal: MorningReveal) => setMorning(reveal));
    socket.on('vote:reveal', (reveal: VoteReveal) => {
      setVote(reveal);
      setShowingVote(true);
      clearTimeout(voteTimer);
      voteTimer = setTimeout(() => setShowingVote(false), VOTE_REVEAL_MS);
    });
    socket.on('game:over', (result: GameOver) => setGameOver(result));
    socket.on('error', (err: ServerError) => setError(err));

    return () => {
      clearTimeout(voteTimer);
      socket.close();
      socketRef.current = null;
    };
  }, []);

  return {
    connected,
    room,
    phase,
    clockOffsetMs,
    morning,
    vote,
    showingVote,
    gameOver,
    error,
    kick: (seatId) => socketRef.current?.emit('room:kick', { seatId }),
    start: () => socketRef.current?.emit('room:start', {}),
    clearError: () => setError(null),
  };
}
