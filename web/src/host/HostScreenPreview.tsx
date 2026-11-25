import { useState } from 'react';
import type { DayProgress, DayResult, MorningReveal, PhaseStart, RoomState } from '../../../shared/generated/SocketEvents';
import { DayScreen, DiscussionScreen, MorningScreen, NightScreen } from './screens';

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

const SAMPLE_DAY_PROGRESS: DayProgress = {
    round: 1,
    voted: 2,
    voters: 3,
};

const SAMPLE_DAY_RESULT: DayResult = {
    round: 1,
    action: 'commune',
    blocked: false,
    trait: { slot: 'hat', option: 'top-hat' },
};

export function HostScreenPreview() {
    const [phase, setPhase] = useState<PhaseStart>(() => makeMockPhaseStart('day'));
    const [morning, setMorning] = useState<MorningReveal>(() => ({
        round: 1,
        deadIds: ['seat-2'],
    }));
    const [showDayResult, setShowDayResult] = useState(false);

    const selectPhase = (nextPhase: PhaseStart['phase']) => {
        setPhase(makeMockPhaseStart(nextPhase));
    };

    const toggleMorningReveal = () => {
        setMorning((current) => ({
            round: 1,
            deadIds: current.deadIds.length === 0 ? ['seat-2'] : [],
        }));
    };

    return (
        <div className="host-root">
            <div className="host-preview-controls" role="group" aria-label="Preview game screens">
                {(['night', 'morning', 'day', 'discussion'] as const).map((nextPhase) => (
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
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowDayResult((prev) => !prev)}
                >
                    {showDayResult ? 'Preview Day voting' : 'Preview Day result'}
                </button>
            </div>

            {phase.phase === 'night' ? (
                <NightScreen phase={phase} clockOffsetMs={0} />
            ) : phase.phase === 'morning' ? (
                <MorningScreen room={mockRoom} phase={phase} morning={morning} clockOffsetMs={0} />
            ) : phase.phase === 'day' ? (
                <DayScreen
                    room={mockRoom}
                    phase={phase}
                    clockOffsetMs={0}
                    dayProgress={SAMPLE_DAY_PROGRESS}
                    dayResult={showDayResult ? SAMPLE_DAY_RESULT : null}
                />
            ) : (
                <DiscussionScreen
                    room={mockRoom}
                    phase={phase}
                    clockOffsetMs={0}
                    dayResult={SAMPLE_DAY_RESULT}
                />
            )}
        </div>
    );
}

export default HostScreenPreview;