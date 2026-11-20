import SwiftUI

// The role stays hidden until the player presses and holds, so nobody nearby can read it. Holding flips
// the card over to its face; letting go flips it back. The back looks the same for everyone, and only
// the Monster's face gets the Monster look. With Reduce Motion the two sides crossfade instead.
struct RolePeek: View {
    let you: YouRole
    @State private var peeking = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let minHeight: CGFloat = 76

    var body: some View {
        ZStack {
            side(visible: !peeking, angle: peeking ? 180 : 0) { back }
            side(visible: peeking, angle: peeking ? 0 : -180) { face }
        }
        .frame(maxWidth: .infinity)
        // Both sides take the taller one's height, so a peek never moves what's below and large text still fits.
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.45, bounce: 0.2)) {
                peeking = pressing
            }
        }, perform: {})
        .sensoryFeedback(.impact(weight: .light), trigger: peeking) { _, isPeeking in isPeeking }
        .accessibilityElement()
        .accessibilityLabel(peeking ? roleText : "Your role, hidden")
        .accessibilityHint("Double tap to show or hide your role")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { peeking.toggle() }
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
    }
    .padding(Theme.gutter)
    .frame(maxHeight: .infinity)
    .gameBackground(.night)
}
