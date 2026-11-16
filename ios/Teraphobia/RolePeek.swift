import SwiftUI

// The role stays hidden until the player presses and holds, so nobody nearby can read it.
struct RolePeek: View {
    let you: YouRole
    @State private var peeking = false

    var body: some View {
        Text(peeking ? roleText : "Hold to see your role")
            .font(.headline)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            .onLongPressGesture(minimumDuration: .infinity, pressing: { peeking = $0 }, perform: {})
            .accessibilityElement()
            .accessibilityLabel(peeking ? roleText : "Your role, hidden")
            .accessibilityHint("Double tap to show or hide your role")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { peeking.toggle() }
    }

    private var roleText: String {
        guard you.role == .monster, let type = you.monsterType else { return "You are a Villager" }
        return "You are the Monster: \(type.rawValue.capitalized)"
    }
}
