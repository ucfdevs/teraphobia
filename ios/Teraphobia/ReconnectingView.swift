import SwiftUI

// Shown while the socket retries. RoomClient rejoins the same seat with the rejoin token by itself.
struct ReconnectingView: View {
    var body: some View {
        VStack(spacing: 16) {
            DriftingStranger()

            Text("Reconnecting")
                .font(.display(.largeTitle))
                .foregroundStyle(Theme.text)

            ProgressView()
                .tint(Theme.mutedText)

            VStack(spacing: 6) {
                Text("Lost you in the fog for a moment.")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text("Hang on, you'll be back in your seat.")
                    .font(.callout)
                    .foregroundStyle(Theme.mutedText)
            }
            .multilineTextAlignment(.center)
        }
        .padding(Theme.gutter)
        .accessibilityElement(children: .combine)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .gameBackground(.plain)
        .navigationBarBackButtonHidden()
    }
}

// The Stranger bobbing and swaying slowly, lost in the fog. Holds still with Reduce Motion.
private struct DriftingStranger: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            StrangerView(size: 120)
                .offset(y: sin(time * 1.6) * 6)
                .rotationEffect(.degrees(sin(time * 0.9) * 4))
                .opacity(0.75 + 0.25 * cos(time * 1.2))
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    ReconnectingView()
}
