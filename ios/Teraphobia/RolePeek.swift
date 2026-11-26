import SwiftUI

// The role stays hidden until the player holds the card for half a second, so nobody nearby can read it.
// The card flips to its face and stays open after letting go, so the Monster can tap its power (#113).
// A tap closes it, and it closes by itself after 8 seconds. The gesture and the back are the same on
// every phone, and only the Monster's face gets the Monster look. With Reduce Motion the sides crossfade.
struct RolePeek: View {
    let you: YouRole
    @State private var peeking = false
    @Environment(\.rolePower) private var power
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    private let minHeight: CGFloat = 76
    // The power row is the same height whether it holds a button or a note, so an open card is the same size on every phone.
    private let powerRowHeight: CGFloat = 56

    var body: some View {
        VStack(spacing: 8) {
            card
            if peeking {
                powerRow
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
        }
        // Closes by itself so it isn't left open on the table. VoiceOver users close it themselves,
        // since swiping to the power button can take longer than 8 seconds.
        .task(id: peeking) {
            guard peeking, !voiceOver else { return }
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { setPeeking(false) }
        }
    }

    private var card: some View {
        ZStack {
            side(visible: !peeking, angle: peeking ? 180 : 0) { back }
            side(visible: peeking, angle: peeking ? 0 : -180) { face }
        }
        .frame(maxWidth: .infinity)
        // Both sides take the taller one's height, so a flip never moves what's below and large text still fits.
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        // The hold wins, so letting go after it doesn't count as the tap that closes the card.
        .gesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in setPeeking(true) }
                .exclusively(before: TapGesture().onEnded { if peeking { setPeeking(false) } })
        )
        .sensoryFeedback(.impact(weight: .light), trigger: peeking) { _, isPeeking in isPeeking }
        .accessibilityElement()
        .accessibilityLabel(peeking ? roleText : "Your role, hidden")
        .accessibilityHint("Double tap to show or hide your role")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { setPeeking(!peeking) }
    }

    private func setPeeking(_ value: Bool) {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.45, bounce: 0.2)) {
            peeking = value
        }
    }

    // The Vampire's or Witch's power button during Day, or a line about the power (or its absence).
    @ViewBuilder
    private var powerRow: some View {
        switch power.slot(for: you) {
        case .button(let title):
            // Navy like a Villager's note, not candle orange, so an open card doesn't stand out across the table.
            Button(title, action: power.use)
                .buttonStyle(.quiet)
                .frame(minHeight: powerRowHeight)
        case .note(let text):
            HStack(spacing: 12) {
                Image(systemName: "info.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Theme.moon)
                    .frame(width: 32)
                    .accessibilityHidden(true)
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: powerRowHeight)
            .surface(.card)
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private func side<Content: View>(visible: Bool, angle: Double, @ViewBuilder content: () -> Content) -> some View {
        if reduceMotion {
            content().opacity(visible ? 1 : 0)
        } else {
            content().modifier(FlipSide(angle: angle))
        }
    }

    // Neutral for everyone, so a glance at any phone looks the same.
    private var back: some View {
        HStack(spacing: 12) {
            Image(systemName: "hand.tap.fill")
                .font(.title2)
                .foregroundStyle(Theme.candle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Hold to see your role")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text("Keep it hidden from your neighbors")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedText)
            }
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: minHeight, maxHeight: .infinity)
        .surface(.card)
    }

    private var face: some View {
        let look = ScreenLook(you: you, moment: .roleCardFace)
        let color = look.effectColor
        return HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color ?? Theme.moon)
                .frame(width: 32)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.display(.title3))
                    .foregroundStyle(Theme.text)
                Text(subtitle)
                    .font(.subheadline)
                    // Muted gray goes faint on a Monster tint, so the Monster's line stays near white.
                    .foregroundStyle(color == nil ? Theme.mutedText : Theme.text.opacity(0.85))
            }
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: minHeight, maxHeight: .infinity)
        .surface(.card, tint: color?.opacity(0.3))
        .background {
            // Without glass the tint is the whole background, so give it solid navy underneath.
            if color != nil && !Self.usesGlass {
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).fill(Theme.surface)
            }
        }
        .overlay {
            if let color {
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .strokeBorder(color, lineWidth: Theme.borderWidth)
            }
        }
    }

    private static var usesGlass: Bool {
        if Glassy.allowed, #available(iOS 26, *) { return true }
        return false
    }

    private var isMonster: Bool { you.role == .monster && you.monsterType != nil }

    private var title: String {
        guard isMonster, let type = you.monsterType else { return "You are a Villager" }
        return "You are the \(type.rawValue.capitalized)"
    }

    private var subtitle: String {
        isMonster ? "The Monster. Don't get caught." : "Find the Monster before it finds you."
    }

    private var icon: String {
        switch you.monsterType {
        case .vampire? where isMonster: "drop.fill"
        case .witch? where isMonster: "wand.and.stars"
        case .werewolf? where isMonster: "pawprint.fill"
        default: "house.fill"
        }
    }

    private var roleText: String {
        guard isMonster, let type = you.monsterType else { return "You are a Villager" }
        return "You are the Monster: \(type.rawValue.capitalized)"
    }
}

// One side of the flip card. It turns around the vertical axis and shows only while it faces the player,
// so the back never shows through the face mid-turn.
private struct FlipSide: ViewModifier, Animatable {
    var angle: Double

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    func body(content: Content) -> some View {
        content
            .opacity(abs(angle) < 90 ? 1 : 0)
            .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0), perspective: 0.4)
    }
}

#Preview {
    VStack(spacing: 16) {
        RolePeek(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0"))
        RolePeek(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: .witch, role: .monster, seatID: "seat0"))
            .environment(\.rolePower, RolePower(isDay: true))
    }
    .padding(Theme.gutter)
    .frame(maxHeight: .infinity)
    .gameBackground(.night)
}
