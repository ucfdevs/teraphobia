import SwiftUI

// The phase timer as a ring that empties as time runs out. In the last 5 seconds it turns red,
// and every second it pulses, thumps a heartbeat haptic and plays the heartbeat sound.
struct Countdown: View {
    let deadline: Date
    // When the phase began, for how full the ring is. Without one the ring treats the phase as a minute long.
    var startedAt: Date?
    var size: CGFloat = 64

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let clock = PhaseClock(deadline: deadline, now: context.date)
            RingFace(secondsLeft: clock.secondsLeft,
                     fraction: clock.fractionLeft(since: startedAt ?? deadline.addingTimeInterval(-60)),
                     isFinalSeconds: clock.isFinalSeconds,
                     size: size)
        }
    }
}

private struct RingFace: View {
    let secondsLeft: Int
    let fraction: Double
    let isFinalSeconds: Bool
    let size: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    // Counts the pulses. Each new value plays the grow-and-settle keyframes once.
    @State private var pulses = 0

    var body: some View {
        let color = isFinalSeconds ? Theme.urgent : Theme.candle
        ZStack {
            Circle().stroke(Theme.text.opacity(0.15), lineWidth: 5)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                // Each tick slides smoothly into the next instead of jumping once a second.
                .animation(reduceMotion ? nil : .linear(duration: 1), value: fraction)
            Text("\(secondsLeft)")
                .font(.numbers(size > 56 ? .title2 : .headline))
                .foregroundStyle(Theme.text)
                .minimumScaleFactor(0.6)
        }
        .padding(6)
        .frame(width: size, height: size)
        .surface(.control)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .keyframeAnimator(initialValue: 1.0, trigger: pulses) { ring, scale in
            ring.scaleEffect(scale)
        } keyframes: { _ in
            CubicKeyframe(1.12, duration: 0.12)
            CubicKeyframe(1, duration: 0.35)
        }
        .sensoryFeedback(.impact(weight: .heavy), trigger: secondsLeft) { _, left in (1...5).contains(left) }
        .onChange(of: secondsLeft) {
            guard isFinalSeconds else { return }
            SoundEngine.shared.play(.heartbeat)
            // With Reduce Motion the ring still turns red and the haptic still thumps, it just doesn't grow.
            if !reduceMotion { pulses += 1 }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(secondsLeft) seconds left")
        .accessibilityAddTraits(.updatesFrequently)
        // The ring's number is small, so a long press with large text on shows it big.
        .accessibilityShowsLargeContentViewer {
            Text("\(secondsLeft) seconds left")
        }
    }
}

#Preview {
    HStack(spacing: 20) {
        Countdown(deadline: .now.addingTimeInterval(40), startedAt: .now.addingTimeInterval(-20))
        Countdown(deadline: .now.addingTimeInterval(5), startedAt: .now.addingTimeInterval(-55))
    }
    .padding(40)
    .gameBackground(.night)
}
