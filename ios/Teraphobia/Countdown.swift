import SwiftUI

// Seconds left in the phase, ticking once a second.
struct Countdown: View {
    let deadline: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(deadline.timeIntervalSince(context.date).rounded(.up)))
            Text("\(left)s")
                .font(.title3.monospacedDigit())
                .accessibilityLabel("\(left) seconds left")
        }
    }
}
