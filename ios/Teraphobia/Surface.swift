import SwiftUI

// A card holds content (a costume, a clue); a control is something you press or read at a glance (a button, the timer).
enum SurfaceKind {
    case card, control
}

enum Glassy {
    // Our own surfaces use Liquid Glass on iOS 26 and later. In debug builds, "-noGlass" shows the solid look
    // older iOS versions get, since the Simulators here only run iOS 26 and later.
    static let allowed: Bool = {
        #if DEBUG
        !ProcessInfo.processInfo.arguments.contains("-noGlass")
        #else
        true
        #endif
    }()
}

extension View {
    // Every raised shape in the app goes through here: radius 14, a 2pt border, and an orange border once selected.
    // On iOS 26 and later it's Liquid Glass tinted navy, so it keeps the night color. Earlier versions get solid navy.
    @ViewBuilder
    func surface(_ kind: SurfaceKind = .card, tint: Color? = nil, selected: Bool = false, interactive: Bool = false) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
        let border = shape.strokeBorder(selected ? Theme.candle : Theme.border.opacity(0.8), lineWidth: Theme.borderWidth)
        if Glassy.allowed, #available(iOS 26, *) {
            let glass = Glass.regular.tint(tint ?? Theme.surface.opacity(kind == .card ? 0.7 : 0.55))
            self
                .glassEffect(interactive ? glass.interactive() : glass, in: shape)
                .overlay(border)
        } else {
            self
                .background(tint ?? Theme.surface, in: shape)
                .overlay(border)
        }
    }
}

// Glass shapes close together can share one container so they blend and render together. A plain stack before iOS 26.
// Only for cards that never show a selected state or badges: the container's glass draws over a card's overlays.
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 12
    @ViewBuilder let content: Content

    var body: some View {
        if Glassy.allowed, #available(iOS 26, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}

// The main action on a screen: candle orange with a darker bottom edge that the face presses down into.
struct CandleButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let edge: CGFloat = 4

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let shape = RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
        configuration.label
            .font(.display(.headline))
            .foregroundStyle(Theme.onCandle)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background { face(shape, pressed: pressed) }
            .offset(y: pressed && !reduceMotion ? edge : 0)
            .background {
                // The edge sits behind the face, peeking out below it until the face is pressed.
                shape.fill(Theme.candleEdge).offset(y: edge)
            }
            .padding(.bottom, edge)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(.spring(duration: 0.18, bounce: 0.3), value: pressed)
            .sensoryFeedback(.impact(weight: .light), trigger: pressed) { _, isDown in isDown }
            .contentShape(shape)
    }

    @ViewBuilder
    private func face(_ shape: RoundedRectangle, pressed: Bool) -> some View {
        let color = pressed && reduceMotion ? Theme.candleEdge : Theme.candle
        if Glassy.allowed, #available(iOS 26, *) {
            Color.clear.glassEffect(.regular.tint(color), in: shape)
        } else {
            shape.fill(color)
        }
    }
}

// A secondary action: a navy control with light text.
struct QuietButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Theme.text)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 48)
            .surface(.control)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.45)
            .animation(.spring(duration: 0.18), value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

// A card you tap, like a player in a picker: it shrinks a little under the finger.
struct CardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(duration: 0.2, bounce: 0.3), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == CandleButtonStyle {
    static var candle: CandleButtonStyle { CandleButtonStyle() }
}

extension ButtonStyle where Self == QuietButtonStyle {
    static var quiet: QuietButtonStyle { QuietButtonStyle() }
}

// A heading over a group of cards, in place of a List section header.
struct SectionHeading: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.display(.title2))
            .foregroundStyle(Theme.text)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(spacing: 16) {
        SectionHeading("Who walks among us?")
        Text("A card").padding().frame(maxWidth: .infinity).surface()
        Text("Selected").padding().frame(maxWidth: .infinity).surface(selected: true)
        Button("Lock in hunch") {}.buttonStyle(.candle)
        Button("Lock in hunch") {}.buttonStyle(.candle).disabled(true)
        Button("Skip") {}.buttonStyle(.quiet)
    }
    .padding(Theme.gutter)
    .frame(maxHeight: .infinity)
    .gameBackground(.night)
}
