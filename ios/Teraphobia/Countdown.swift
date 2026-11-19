import SwiftUI

// Seconds left in the phase, ticking once a second.
struct Countdown: View {
    let deadline: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = PhaseClock(deadline: deadline, now: context.date).secondsLeft
            Text("\(left)s")
                .font(.title3.monospacedDigit())
                .accessibilityLabel("\(left) seconds left")
                // Toolbar text doesn't grow with Dynamic Type, so a long press shows it large instead.
                .accessibilityShowsLargeContentViewer()
        }
    }
}
