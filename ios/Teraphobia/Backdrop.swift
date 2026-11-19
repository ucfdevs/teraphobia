import SwiftUI

// The painted sky behind a screen. Game screens pick it by phase; account screens use plain.
enum Backdrop: Equatable {
    case night, day, candlelit, monsterWon, villageWon, plain

    init(phase: Phase) {
        switch phase {
        case .night: self = .night
        case .morning, .day: self = .day
        case .discussion, .vote: self = .candlelit
        }
    }
}

extension View {
    // The backdrop, and the Monster look on top of it, sit behind the content and never take taps.
    func gameBackground(_ backdrop: Backdrop, look: ScreenLook = .neutral) -> some View {
        background {
            ZStack {
                BackdropView(backdrop: backdrop)
                MonsterLookLayer(look: look)
            }
            .accessibilityHidden(true)
            .allowsHitTesting(false)
            .ignoresSafeArea()
        }
    }
}

struct BackdropView: View {
    let backdrop: Backdrop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch backdrop {
            case .plain:
                LinearGradient(colors: [Theme.nightRaised, Theme.night], startPoint: .top, endPoint: .bottom)
                Stars(count: 40, opacity: 0.5)
            case .night:
                LinearGradient(colors: [Color(hex: 0x121733), Theme.night], startPoint: .top, endPoint: .bottom)
                Stars(count: 70, opacity: 0.8)
                Moon(color: Theme.moon.opacity(0.9))
                Fog(tint: .white, animated: !reduceMotion)
            case .day:
                LinearGradient(colors: [Theme.duskTop, Theme.dusk, Theme.dusk], startPoint: .top, endPoint: .bottom)
                Stars(count: 25, opacity: 0.35)
                // The ember horizon: the sun just under the bottom edge.
                RadialGradient(colors: [Theme.ember.opacity(0.55), Theme.ember.opacity(0)], center: .bottom, startRadius: 0, endRadius: 420)
            case .candlelit:
                Theme.candlelit
                CandleGlow(animated: !reduceMotion)
            case .monsterWon:
                Theme.candlelit
                RadialGradient(colors: [Theme.blood.opacity(0.85), Theme.blood.opacity(0)], center: .top, startRadius: 0, endRadius: 520)
            case .villageWon:
                LinearGradient(colors: [Theme.nightRaised, Theme.night], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Theme.gold.opacity(0.6), Theme.gold.opacity(0)], center: .top, startRadius: 0, endRadius: 520)
            }
        }
        // Oversized fog and glows would otherwise widen the layout.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}

// A fixed field of stars in the top part of the sky. Seeded, so they don't jump between renders.
struct Stars: View {
    var count = 60
    var opacity = 0.8

    var body: some View {
        Canvas { context, size in
            var random = SeededRandom(seed: 7)
            for _ in 0..<count {
                let x = random.next() * size.width
                let y = random.next() * size.height * 0.6
                let radius = 0.6 + random.next() * 1.2
                let alpha = (0.3 + random.next() * 0.5) * opacity
                context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: radius, height: radius)), with: .color(.white.opacity(alpha)))
            }
        }
    }
}

// Low on the right, rising through the fog, so it stays clear of the header's ring and buttons.
struct Moon: View {
    let color: Color
    var diameter: CGFloat = 150

    var body: some View {
        GeometryReader { proxy in
            Circle()
                .fill(color)
                .frame(width: diameter, height: diameter)
                .shadow(color: color.opacity(0.6), radius: 40)
                .position(x: proxy.size.width - diameter * 0.35, y: proxy.size.height * 0.84)
        }
    }
}

// Low fog drifting across the bottom of the screen. Holds still with Reduce Motion.
struct Fog: View {
    let tint: Color
    let animated: Bool

    var body: some View {
        // Paused, the timeline renders once and stops, so it doesn't redraw for nothing.
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !animated)) { context in
            let time = animated ? context.date.timeIntervalSinceReferenceDate : 0
            GeometryReader { proxy in
                ZStack {
                    Ellipse().fill(tint.opacity(0.08)).frame(width: 520, height: 160)
                        .position(x: proxy.size.width / 2 + sin(time / 6) * 60, y: proxy.size.height * 0.78)
                    Ellipse().fill(Theme.blood.opacity(0.10)).frame(width: 420, height: 140)
                        .position(x: proxy.size.width / 2 + cos(time / 7) * 80, y: proxy.size.height * 0.92)
                }
                .blur(radius: 30)
            }
        }
    }
}

// A warm glow from a candle just below the screen, flickering a little. Steady with Reduce Motion.
struct CandleGlow: View {
    let animated: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 15, paused: !animated)) { context in
            let time = animated ? context.date.timeIntervalSinceReferenceDate : 0
            let flicker = 0.85 + 0.1 * sin(time * 7) + 0.05 * sin(time * 13)
            RadialGradient(colors: [Theme.candle.opacity(0.45 * flicker), Theme.candle.opacity(0)],
                           center: .bottom, startRadius: 0, endRadius: 460)
        }
    }
}

struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed }

    // A number from 0 to 1.
    mutating func next() -> CGFloat {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat(state >> 33) / CGFloat(UInt32.max >> 1)
    }
}

#Preview {
    TabView {
        ForEach([Backdrop.night, .day, .candlelit, .monsterWon, .villageWon, .plain], id: \.self) { backdrop in
            Text(String(describing: backdrop)).font(.display()).foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .gameBackground(backdrop)
        }
    }
    .tabViewStyle(.page)
}

extension Backdrop: Hashable {}
