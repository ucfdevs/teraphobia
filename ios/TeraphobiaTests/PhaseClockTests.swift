import Foundation
import Testing
@testable import Teraphobia

@MainActor
struct PhaseClockTests {
    private let deadline = Date(timeIntervalSinceReferenceDate: 1_000)

    @Test(arguments: [(970.0, 30), (990.2, 10), (999.9, 1), (1_000.0, 0), (1_004.0, 0)])
    func secondsLeftRoundUpAndStopAtZero(now: Double, expected: Int) {
        let clock = PhaseClock(deadline: deadline, now: Date(timeIntervalSinceReferenceDate: now))
        #expect(clock.secondsLeft == expected)
    }

    // The ring pulses (with a heartbeat) on 5, 4, 3, 2, 1, and stops once time is up.
    @Test(arguments: [(994.0, false), (995.5, true), (999.5, true), (1_000.0, false)])
    func pulsesOnlyInTheLastFiveSeconds(now: Double, expected: Bool) {
        let clock = PhaseClock(deadline: deadline, now: Date(timeIntervalSinceReferenceDate: now))
        #expect(clock.isFinalSeconds == expected)
    }

    @Test(arguments: [(970.0, 1.0), (985.0, 0.5), (1_000.0, 0.0), (960.0, 1.0), (1_010.0, 0.0)])
    func ringShowsTheShareOfThePhaseLeft(now: Double, expected: Double) {
        let clock = PhaseClock(deadline: deadline, now: Date(timeIntervalSinceReferenceDate: now))
        #expect(clock.fractionLeft(since: Date(timeIntervalSinceReferenceDate: 970)) == expected)
    }
}
