import SwiftUI

// Villagers name who they suspect; the Monster picks a victim. Both see the same list.
// Every tap is sent right away and the server keeps the latest pick, since Night only ends on the timer.
struct NightView: View {
    let you: YouRole
    let seats: [PublicSeat]
    let round: Int
    let deadline: Date
    let powerUsed: Bool
    let send: (NightSubmit) -> Void

    @State private var picks: NightPicks?

    private var current: NightPicks {
        picks ?? NightPicks(you: you, round: round, powerUsed: powerUsed)
    }

    private var header: String {
        if you.role == .villager { return "Who do you suspect?" }
        return current.maxPicks == 2 ? "Pick one or two victims" : "Pick a victim"
    }

    // The rule in plain words.
    private var hint: String {
        if you.role == .villager {
            return "Tap the player you think is the Monster. Your hunch stays secret, and you can change it until Night ends."
        }
        if current.maxPicks == 2 {
            return "Tap one or two players to kill tonight. You can change your picks until Night ends."
        }
        return "Tap the player you want to kill tonight. You can change your pick until Night ends."
    }

    var body: some View {
        // Only the Monster's phone is choosing a victim, so only it gets its type's look. Villagers stay neutral.
        PhaseLayout(title: "Night \(round)", deadline: deadline, you: you, heading: "The village sleeps",
                    look: ScreenLook(you: you, moment: .choosingVictim)) {
            StrangerSays(text: hint)
            PlayerPicker(header: header, seats: seats, you: you, picked: current.picked, onPick: pick)
        }
    }

    private func pick(_ seatID: String) {
        let next = current.tapping(seatID)
        picks = next
        send(next.submit)
    }
}

#Preview {
    NavigationStack {
        NightView(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0"),
                  seats: PublicSeat.previews, round: 1, deadline: .now.addingTimeInterval(30), powerUsed: false, send: { _ in })
    }
}
