import Foundation

// The phase countdown at one moment: what the ring shows and when it starts to pulse.
struct PhaseClock {
    let deadline: Date
    let now: Date

    // Rounded up, so it reads 1 until the very end, then 0.
    var secondsLeft: Int {
        max(0, Int(deadline.timeIntervalSince(now).rounded(.up)))
    }

    var isFinalSeconds: Bool {
        (1...5).contains(secondsLeft)
    }

    // 1 when the phase starts, 0 when time is up.
    func fractionLeft(since start: Date) -> Double {
        let total = deadline.timeIntervalSince(start)
        guard total > 0 else { return 0 }
        return min(1, max(0, deadline.timeIntervalSince(now) / total))
    }
}
