import { useState } from 'react';
import type { MorningReveal, PhaseStart, RoomState } from '../../../shared/generated/SocketEvents';
import { DayScreen, MorningScreen, NightScreen } from './screens';

const mockRoom: RoomState = {
    code: 'MOCK',
    hostConnected: true,
    preset: 'normal',
    status: 'playing',
    seats: [
        {
            seatId: 'seat-1',
            displayName: 'Mina',
            connected: true,
            lifeStatus: 'alive',
            costume: { hat: 'top-hat', mask: 'domino-mask', item: 'lantern' },
        },
        {
            seatId: 'seat-2',
            displayName: 'Theo',
            connected: true,
            lifeStatus: 'dead',
            costume: { hat: 'jester-cap', mask: 'pumpkin-mask', item: 'pitchfork' },
        },
        {
            seatId: 'seat-3',
            displayName: 'Raven',
            connected: true,
            lifeStatus: 'alive',
            costume: { hat: 'crown', mask: 'skull-mask', item: 'raven' },
        },
        {
            seatId: 'seat-4',
            displayName: 'Salem',
            connected: true,
            lifeStatus: 'banished',
            costume: { hat: 'horned-helmet', mask: 'beak-mask', item: 'umbrella' },
        },
    ],
};

function makeMockPhaseStart(phase: PhaseStart['phase']): PhaseStart {
    const serverNow = Date.now();
    return { phase, round: 1, serverNow, endsAt: serverNow + 60_000 };
}

export default function HostScreenPreview() {
    const [phase, setPhase] = useState(() => makeMockPhaseStart('night'));
    const [morning, setMorning] = useState<MorningReveal>({
        round: 1,
        deadIds: ['seat-2'],
    });

    const selectPhase = (nextPhase: PhaseStart['phase']) => {
        setPhase(makeMockPhaseStart(nextPhase));
    };

    const toggleMorningReveal = () => {
        setMorning((current) => ({
            ...current,
            deadIds: current.deadIds.length === 0 ? ['seat-2'] : [],
        }));
    };

    return (
        <div className="host-root">
            <div className="host-preview-controls" role="group" aria-label="Preview game screens">
                {(['night', 'morning', 'day'] as const).map((nextPhase) => (
                    <button
                        key={nextPhase}
                        type="button"
                        className="btn-secondary"
                        aria-pressed={phase.phase === nextPhase}
                        onClick={() => selectPhase(nextPhase)}
                    >
                        {nextPhase[0].toUpperCase() + nextPhase.slice(1)}
                    </button>
                ))}
                <button type="button" className="btn-secondary" onClick={toggleMorningReveal}>
                    {morning.deadIds.length === 0 ? 'Preview a death' : 'Preview everyone survived'}
                </button>
            </div>

            {phase.phase === 'night' ? (
                <NightScreen phase={phase} clockOffsetMs={0} />
            ) : phase.phase === 'morning' ? (
                <MorningScreen room={mockRoom} phase={phase} morning={morning} clockOffsetMs={0} />
            ) : (
                <DayScreen room={mockRoom} phase={phase} clockOffsetMs={0} />
            )}
        </div>
    );
}