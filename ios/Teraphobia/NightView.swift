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

    @State private var picked: [String] = []

    // The Werewolf can kill two players once per game, never on Night 1.
    private var maxPicks: Int {
        you.monsterType == .werewolf && !powerUsed && round > 1 ? 2 : 1
    }

    private var header: String {
        if you.role == .villager { return "Who do you suspect?" }
        return maxPicks == 2 ? "Pick one or two victims" : "Pick a victim"
    }

    var body: some View {
        PhaseLayout(title: "Night \(round)", deadline: deadline, you: you) {
            PlayerPicker(header: header, seats: seats, you: you, picked: picked, onPick: pick)
        }
    }

    private func pick(_ seatID: String) {
        if maxPicks == 1 {
            picked = [seatID]
        } else if picked.contains(seatID) {
            // A pick can't be taken back, so keep at least one.
            if picked.count > 1 { picked.removeAll { $0 == seatID } }
        } else {
            picked.append(seatID)
            if picked.count > 2 { picked.removeFirst() }
        }

        if you.role == .monster {
            send(NightSubmit(victimIDS: picked, suspectID: nil))
        } else {
            send(NightSubmit(victimIDS: nil, suspectID: seatID))
        }
    }
}

#Preview {
    NavigationStack {
        NightView(you: YouRole(costume: Costume(hat: "hat1", item: "item1", mask: "mask1"), monsterType: nil, role: .villager, seatID: "seat0"),
                  seats: PublicSeat.previews, round: 1, deadline: .now.addingTimeInterval(30), powerUsed: false, send: { _ in })
    }
}
