import SwiftUI

extension ScreenLook {
    // The color of the Monster type's effects. Taps stay candle orange in every look.
    var effectColor: Color? {
        switch self {
        case .neutral: nil
        case .monster(.vampire): Theme.vampire
        case .monster(.witch): Theme.witch
        case .monster(.werewolf): Theme.werewolf
        }
    }
}

// The Monster look, painted over the backdrop: Vampire red drips, Witch green smoke, Werewolf amber moon
// and claw marks. Neutral draws nothing. With Reduce Motion each one holds still.
struct MonsterLookLayer: View {
    let look: ScreenLook
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        switch look {
        case .neutral:
            EmptyView()
        case .monster(.vampire):
            ZStack {
                Vignette(color: Theme.vampire)
                Drips(color: Theme.vampire, animated: !reduceMotion)
            }
        case .monster(.witch):
            ZStack {
                Vignette(color: Theme.witch.opacity(0.6))
                Smoke(color: Theme.witch, animated: !reduceMotion)
            }
        case .monster(.werewolf):
            ZStack {
                Vignette(color: Theme.werewolf.opacity(0.7))
                // A big amber moon over the pale one, and claw marks across the sky.
                Moon(color: Theme.werewolf, diameter: 180)
                ClawMarks(color: Theme.werewolf)
            }
        }
    }
}

// The screen's edges stained with the Monster's color.
private struct Vignette: View {
    let color: Color

    var body: some View {
        Rectangle()
            .fill(RadialGradient(colors: [.clear, color.opacity(0.35)], center: .center, startRadius: 180, endRadius: 520))
    }
}

// Blood running down from the top edge, slowly getting longer, then starting over.
private struct Drips: View {
    let color: Color
    let animated: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !animated)) { context in
            let time = animated ? context.date.timeIntervalSinceReferenceDate : 4
            Canvas { canvas, size in
                // A band along the top edge that the drips hang from.
                canvas.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: 10)), with: .color(color))
                var random = SeededRandom(seed: 3)
                let count = 9
                for index in 0..<count {
                    let x = (CGFloat(index) + 0.3 + random.next() * 0.4) / CGFloat(count) * size.width
                    let width = 6 + random.next() * 8
                    let speed = 0.6 + random.next() * 0.8
                    let maxLength = 40 + random.next() * 110
                    // Each drip grows over 8 seconds at its own pace, then resets.
                    let progress = (time * speed / 8 + Double(random.next())).truncatingRemainder(dividingBy: 1)
                    let length = 10 + maxLength * CGFloat(progress)
                    let body = Path(roundedRect: CGRect(x: x - width / 2, y: 0, width: width, height: length),
                                    cornerRadius: width / 2)
                    canvas.fill(body, with: .color(color.opacity(0.9)))
                    // A round bead at the tip.
                    canvas.fill(Path(ellipseIn: CGRect(x: x - width * 0.7, y: length - width, width: width * 1.4, height: width * 1.4)),
                                with: .color(color))
                }
            }
        }
    }
}

// Green smoke rising from the bottom and fading as it goes.
private struct Smoke: View {
    let color: Color
    let animated: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !animated)) { context in
            let time = animated ? context.date.timeIntervalSinceReferenceDate : 2
            GeometryReader { proxy in
                ZStack {
                    ForEach(0..<6, id: \.self) { index in
                        // Each puff rises over 9 seconds, offset from the others.
                        let progress = ((time / 9) + Double(index) / 6).truncatingRemainder(dividingBy: 1)
                        Ellipse()
                            .fill(color.opacity(0.28 * (1 - progress)))
                            .frame(width: 220 + 80 * progress, height: 120 + 60 * progress)
                            .position(x: proxy.size.width * (0.15 + 0.14 * CGFloat(index)) + sin(time / 3 + Double(index)) * 30,
                                      y: proxy.size.height * (1.05 - 0.6 * progress))
                    }
                }
                .blur(radius: 28)
            }
        }
    }
}

// Three torn scratches low on the left, across from the moon and clear of the header.
private struct ClawMarks: View {
    let color: Color

    var body: some View {
        Canvas { canvas, size in
            for index in 0..<3 {
                let offset = CGFloat(index) * 26
                var path = Path()
                path.move(to: CGPoint(x: size.width * 0.06 + offset, y: size.height * 0.66))
                path.addQuadCurve(to: CGPoint(x: size.width * 0.42 + offset, y: size.height * 0.94),
                                  control: CGPoint(x: size.width * 0.14 + offset, y: size.height * 0.86))
                canvas.stroke(path, with: .color(color.opacity(0.35)), style: StrokeStyle(lineWidth: 7 - CGFloat(index), lineCap: .round))
            }
        }
    }
}

#Preview {
    TabView {
        ForEach([MonsterType.vampire, .witch, .werewolf], id: \.self) { type in
            Text(type.rawValue.capitalized).font(.display()).foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .gameBackground(.night, look: .monster(type))
        }
    }
    .tabViewStyle(.page)
}
