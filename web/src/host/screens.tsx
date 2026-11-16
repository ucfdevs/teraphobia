// The shared screen, one component per PRD screen. Each takes plain props, so a finished design for any one
// screen (#13, #30, #31) can replace it without touching the others or the socket code.
// The shared screen never shows private info: no roles, no Day results, no Monster until Game over.

import { useEffect, useState } from 'react';
import type {
  Costume,
  GameOver,
  MorningReveal,
  PhaseStart,
  Preset,
  PublicSeat,
  RoomState,
  VoteReveal,
} from '../../../shared/generated/SocketEvents';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

function nameOf(room: RoomState, seatId: string | null) {
  if (seatId === null) return 'Skip';
  return room.seats.find((s) => s.seatId === seatId)?.displayName ?? 'Someone';
}

export function Countdown({ endsAt, clockOffsetMs }: { endsAt: number; clockOffsetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((endsAt - (now + clockOffsetMs)) / 1000));
  return (
    <div className="host-countdown" role="timer" aria-live="off" aria-label={`${seconds} seconds left`}>
      {seconds}
    </div>
  );
}

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: 'quick', label: 'Quick', hint: 'About 1.5 minutes a round' },
  { value: 'normal', label: 'Normal', hint: 'About 2.5 minutes a round' },
  { value: 'relaxed', label: 'Relaxed', hint: 'About 4 minutes a round' },
];

export function CreateRoom({ busy, error, onCreate, onExit }: {
  busy: boolean;
  error: string;
  onCreate(preset: Preset): void;
  onExit(): void;
}) {
  const [preset, setPreset] = useState<Preset>('normal');
  return (
    <section className="host-card" aria-labelledby="create-title">
      <h2 id="create-title" className="host-title">Create a room</h2>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <fieldset className="host-presets">
        <legend className="form-label">Timer preset</legend>
        {PRESETS.map((p) => (
          <label key={p.value} className={`host-preset${preset === p.value ? ' is-selected' : ''}`}>
            <input type="radio" name="preset" value={p.value} checked={preset === p.value} onChange={() => setPreset(p.value)} />
            <span className="host-preset-label">{p.label}</span>
            <span className="host-muted">{p.hint}</span>
          </label>
        ))}
      </fieldset>
      <div className="host-actions">
        <button type="button" className="btn-secondary" onClick={onExit}>Back</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onCreate(preset)}>
          {busy ? 'Creating...' : 'Create room'}
        </button>
      </div>
    </section>
  );
}

export function Lobby({ room, onKick, onStart }: { room: RoomState; onKick(seatId: string): void; onStart(): void }) {
  const count = room.seats.length;
  const full = count >= MAX_PLAYERS;
  const canStart = count >= MIN_PLAYERS;
  return (
    <section className="host-card host-lobby" aria-labelledby="lobby-title">
      <h2 id="lobby-title" className="host-muted">Join on your phone with code</h2>
      <p className="host-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</p>
      <p className="host-muted">Open the Teraphobia app, enter the code and your name. Preset: {room.preset}.</p>

      <h3 className="host-subtitle">
        Players {count}/{MAX_PLAYERS} {full && <span className="host-badge">Room full</span>}
      </h3>
      {count === 0 ? (
        <p className="host-muted">Waiting for players...</p>
      ) : (
        <ul className="host-players">
          {room.seats.map((seat) => (
            <li key={seat.seatId} className="host-player">
              <span>{seat.displayName}{!seat.connected && <span className="host-muted"> (away)</span>}</span>
              <button type="button" className="btn-link" onClick={() => onKick(seat.seatId)} aria-label={`Kick ${seat.displayName}`}>
                Kick
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn-primary host-start" disabled={!canStart} onClick={onStart}>
        {canStart ? 'Start' : `Start (needs ${MIN_PLAYERS - count} more)`}
      </button>
    </section>
  );
}

function PhaseHeader({ title, phase, clockOffsetMs }: { title: string; phase: PhaseStart; clockOffsetMs: number }) {
  return (
    <header className="host-phase-header">
      <div>
        <p className="host-muted">Round {phase.round}</p>
        <h2 className="host-title">{title}</h2>
      </div>
      <Countdown endsAt={phase.endsAt} clockOffsetMs={clockOffsetMs} />
    </header>
  );
}

export function NightScreen({ phase, clockOffsetMs }: { phase: PhaseStart; clockOffsetMs: number }) {
  return (
    <section className="host-stage host-night" aria-labelledby="phase-title">
      <PhaseHeader title="Night falls on the manor" phase={phase} clockOffsetMs={clockOffsetMs} />
      <div className="host-moon" aria-hidden="true" />
      <p className="host-lead">Everyone, look at your phone. The Monster is choosing a victim...</p>
    </section>
  );
}

export function MorningScreen({ room, phase, morning, clockOffsetMs }: {
  room: RoomState;
  phase: PhaseStart;
  morning: MorningReveal | null;
  clockOffsetMs: number;
}) {
  const deadIds = morning && morning.round === phase.round ? morning.deadIds : [];
  return (
    <section className="host-stage" aria-labelledby="phase-title">
      <PhaseHeader title="Morning" phase={phase} clockOffsetMs={clockOffsetMs} />
      <p className="host-reveal" role="status">
        {deadIds.length === 0
          ? 'Everyone survived the night'
          : `${deadIds.map((id) => nameOf(room, id)).join(' and ')} did not survive the night`}
      </p>
    </section>
  );
}

// Traits are told apart by shape and name, never by color alone.
const TRAIT_SHAPES = { hat: '▲', mask: '●', item: '■' } as const;

function CostumeTraits({ costume }: { costume: Costume }) {
  return (
    <ul className="host-traits">
      {(['hat', 'mask', 'item'] as const).map((slot) => (
        <li key={slot}>
          <span aria-hidden="true" className="host-trait-shape">{TRAIT_SHAPES[slot]}</span> {slot}: {costume[slot]}
        </li>
      ))}
    </ul>
  );
}

function SeatCard({ seat }: { seat: PublicSeat }) {
  const out = seat.lifeStatus !== 'alive';
  return (
    <li className={`host-seat${out ? ' is-out' : ''}`}>
      <p className="host-seat-name">
        {seat.displayName}
        {out && <span className="host-badge">{seat.lifeStatus === 'banished' ? 'Banished' : 'Dead'}</span>}
        {!seat.connected && !out && <span className="host-muted"> (away)</span>}
      </p>
      {seat.costume && <CostumeTraits costume={seat.costume} />}
    </li>
  );
}

export function DayScreen({ room, phase, clockOffsetMs }: { room: RoomState; phase: PhaseStart; clockOffsetMs: number }) {
  return (
    <section className="host-stage" aria-labelledby="phase-title">
      <PhaseHeader title="Day" phase={phase} clockOffsetMs={clockOffsetMs} />
      <p className="host-lead">Villagers: Search, Commune, or light a Candle on your phone.</p>
      <ul className="host-seats">
        {room.seats.map((seat) => <SeatCard key={seat.seatId} seat={seat} />)}
      </ul>
    </section>
  );
}

export function DiscussionScreen({ room, phase, clockOffsetMs }: { room: RoomState; phase: PhaseStart; clockOffsetMs: number }) {
  const voting = phase.phase === 'vote';
  return (
    <section className="host-stage" aria-labelledby="phase-title">
      <PhaseHeader title={voting ? 'Vote' : 'Discussion'} phase={phase} clockOffsetMs={clockOffsetMs} />
      <p className="host-lead">
        {voting ? 'Vote on your phone: banish a player, or Skip.' : 'Share your clues, or lie about them. Who is the Monster?'}
      </p>
      <ul className="host-seats">
        {room.seats.map((seat) => <SeatCard key={seat.seatId} seat={seat} />)}
      </ul>
    </section>
  );
}

export function VoteRevealScreen({ room, vote }: { room: RoomState; vote: VoteReveal }) {
  return (
    <section className="host-stage" aria-labelledby="reveal-title">
      <h2 id="reveal-title" className="host-title">The votes are in</h2>
      <ul className="host-votes">
        {vote.votes.map((v) => (
          <li key={v.voterId}>
            <strong>{nameOf(room, v.voterId)}</strong> voted for <strong>{nameOf(room, v.targetId)}</strong>
          </li>
        ))}
      </ul>
      <p className="host-reveal" role="status">
        {vote.banishedId ? `${nameOf(room, vote.banishedId)} is banished` : 'Nobody was banished'}
      </p>
    </section>
  );
}

const END_REASONS = {
  banished: 'The Monster was banished.',
  outnumbered: 'Only one Villager was left.',
  forfeit: 'The Monster left the game.',
} as const;

export function GameOverScreen({ room, result, onPlayAgain }: { room: RoomState; result: GameOver; onPlayAgain(): void }) {
  return (
    <section className="host-stage" aria-labelledby="over-title">
      <h2 id="over-title" className="host-title">{result.winner === 'villagers' ? 'The Villagers win!' : 'The Monster wins!'}</h2>
      <p className="host-reveal">
        The Monster was <strong>{nameOf(room, result.monster.seatId)}</strong>, a {result.monster.monsterType}.
      </p>
      <p className="host-muted">{END_REASONS[result.endReason]} The game lasted {result.rounds} round{result.rounds === 1 ? '' : 's'}.</p>

      <h3 className="host-subtitle">Night hunches</h3>
      {result.hunches.length === 0 ? (
        <p className="host-muted">Nobody named a suspect.</p>
      ) : (
        <ul className="host-votes">
          {result.hunches.map((h) => (
            <li key={`${h.seatId}-${h.round}`}>
              Night {h.round}: <strong>{nameOf(room, h.seatId)}</strong> suspected <strong>{nameOf(room, h.suspectId)}</strong>
              {h.suspectId === result.monster.seatId && ' ✓'}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-primary host-start" onClick={onPlayAgain}>Play again</button>
    </section>
  );
}

export function PausedOverlay() {
  return (
    <div className="host-paused" role="alert">
      <h2 className="host-title">Paused</h2>
      <p>The host screen lost its connection. Timers are paused and will pick up where they stopped.</p>
    </div>
  );
}
