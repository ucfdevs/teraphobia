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

    var body: some View {
        // Only the Monster's phone is choosing a victim, so only it gets its type's look. Villagers stay neutral.
        PhaseLayout(title: "Night \(round)", deadline: deadline, you: you, look: ScreenLook(you: you, moment: .choosingVictim)) {
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
