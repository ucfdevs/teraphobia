// The host flow: Create room, then the live shared screen for that room until Game over, then Play again.
// Self-contained so it can be replaced screen by screen (see screens.tsx) or removed in one revert.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Preset } from '../../../shared/generated/SocketEvents';
import { useHostSocket } from './useHostSocket';
import {
  CreateRoom,
  DayScreen,
  DiscussionScreen,
  GameOverScreen,
  Lobby,
  MorningScreen,
  NightScreen,
  PausedOverlay,
  VoteRevealScreen,
} from './screens';
import './host.css';

export interface Session {
  accessToken: string;
  refreshToken: string;
  // When accessToken was issued (ms). Access tokens last 15 minutes.
  issuedAt: number;
}

// Refreshed a little before the 15-minute expiry.
const ACCESS_TOKEN_MAX_AGE_MS = 12 * 60 * 1000;

interface Props {
  session: Session;
  onSessionChange(session: Session): void;
  onExit(): void;
}

export default function HostScreen({ session, onSessionChange, onExit }: Props) {
  const sessionRef = useRef(session);
  const refreshing = useRef<Promise<string> | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // A fresh access token, refreshing first if this one is about to expire (or if `force`, after the server
  // refused it). Refresh tokens rotate, so callers share one refresh in flight, and the new pair goes back to
  // App for the next time.
  const getToken = useCallback(
    async (force = false) => {
      const current = sessionRef.current;
      if (!force && Date.now() - current.issuedAt < ACCESS_TOKEN_MAX_AGE_MS) return current.accessToken;
      refreshing.current ??= (async () => {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!res.ok) throw new Error('Your session expired. Sign in again.');
        const data = await res.json();
        const next = { accessToken: data.accessToken, refreshToken: data.refreshToken, issuedAt: Date.now() };
        sessionRef.current = next;
        onSessionChange(next);
        return next.accessToken;
      })().finally(() => {
        refreshing.current = null;
      });
      return refreshing.current;
    },
    [onSessionChange],
  );

  const createRoom = async (preset: Preset) => {
    setCreating(true);
    setCreateError('');
    try {
      const post = async (token: string) =>
        fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preset }),
        });
      let res = await post(await getToken());
      // The token can still be refused (clock skew, revoked): refresh once and try again.
      if (res.status === 401) res = await post(await getToken(true));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create a room');
      setCode(data.code);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create a room');
    } finally {
      setCreating(false);
    }
  };

  if (!code) return <CreateRoom busy={creating} error={createError} onCreate={createRoom} onExit={onExit} />;
  // Keyed by code, so Play again starts a fresh socket for the new room.
  return <LiveRoom key={code} getToken={getToken} onPlayAgain={() => setCode(null)} />;
}

function LiveRoom({ getToken, onPlayAgain }: { getToken(): Promise<string>; onPlayAgain(): void }) {
  const game = useHostSocket(getToken);
  const { room, phase, error, clearError } = game;

  // Errors fade after a few seconds; most are one-off refusals like "needs 4 players".
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  let screen;
  if (!room) {
    screen = <p className="host-lead" role="status">Connecting to the game server...</p>;
  } else if (game.vote && game.showingVote) {
    screen = <VoteRevealScreen room={room} vote={game.vote} />;
  } else if (game.gameOver) {
    screen = <GameOverScreen room={room} result={game.gameOver} onPlayAgain={onPlayAgain} />;
  } else if (room.status === 'lobby' || !phase) {
    screen = <Lobby room={room} onKick={game.kick} onStart={game.start} />;
  } else if (phase.phase === 'night') {
    screen = <NightScreen phase={phase} clockOffsetMs={game.clockOffsetMs} />;
  } else if (phase.phase === 'morning') {
    screen = <MorningScreen room={room} phase={phase} morning={game.morning} clockOffsetMs={game.clockOffsetMs} />;
  } else if (phase.phase === 'day') {
    screen = <DayScreen room={room} phase={phase} clockOffsetMs={game.clockOffsetMs} dayProgress={game.dayProgress} dayResult={game.dayResult} />;
  } else {
    screen = <DiscussionScreen room={room} phase={phase} clockOffsetMs={game.clockOffsetMs} dayResult={game.dayResult} />;
  }

  return (
    <div className="host-root">
      {error && (
        <div className="alert-error host-toast" role="alert">
          {error.message}
          <button type="button" className="btn-link" onClick={clearError} aria-label="Dismiss">×</button>
        </div>
      )}
      {screen}
      {!game.connected && room?.status === 'playing' && !game.gameOver && <PausedOverlay />}
    </div>
  );
}
