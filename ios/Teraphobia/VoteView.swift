import SwiftUI

// Living players vote to banish someone or Skip. The first tap is final, because the server
// would take a second vote as a change of mind.
struct VoteView: View {
    let you: YouRole
    let seats: [PublicSeat]
    let deadline: Date
    let lockedIn: Bool
    let votedTargetID: String?
    let vote: (String?) -> Void

    var body: some View {
        PhaseLayout(title: "Vote", deadline: deadline, you: you) {
            if lockedIn {
                Section {
                    Label(lockedText, systemImage: "lock.fill")
                } footer: {
                    Text("Your vote is locked in. Watch the shared screen for the result.")
                }
            } else {
                PlayerPicker(header: "Who should be banished?", seats: seats, you: you, picked: [], onPick: { vote($0) })
                Section {
                    Button("Skip") { vote(nil) }
                } footer: {
                    Text("Your first tap is your vote. It can't be changed.")
                }
            }
        }
    }

    private var lockedText: String {
        guard let votedTargetID else { return "You voted to skip" }
        let name = seats.first { $0.seatID == votedTargetID }?.displayName ?? "a player"
        return "You voted for \(name)"
    }
}

#Preview {
    NavigationStack {
        VoteView(you: YouRole(costume: Costume(hat: "hat1", item: "item1", mask: "mask1"), monsterType: nil, role: .villager, seatID: "seat0"),
                 seats: PublicSeat.previews, deadline: .now.addingTimeInterval(30), lockedIn: false, votedTargetID: nil, vote: { _ in })
    }
}
