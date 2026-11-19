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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        PhaseLayout(title: "Vote", deadline: deadline, you: you, heading: "The village decides") {
            Group {
                if lockedIn {
                    lockedCard
                        .transition(reduceMotion ? .opacity : .scale(scale: 0.92).combined(with: .opacity))
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        PlayerPicker(header: "Who should be banished?", seats: seats, you: you, picked: [], onPick: { vote($0) })
                        Button("Skip") { vote(nil) }
                            .buttonStyle(.quiet)
                        Text("Your first tap is your vote. It can't be changed.")
                            .font(.footnote)
                            .foregroundStyle(Theme.mutedText)
                    }
                    .transition(.opacity)
                }
            }
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.4, bounce: 0.3), value: lockedIn)
        }
        // Only the moment the vote locks, so rejoining into a locked vote stays quiet.
        .onChange(of: lockedIn) { wasLocked, isLocked in
            if !wasLocked && isLocked {
                SoundEngine.shared.play(.voteLock)
            }
        }
    }

    private var lockedCard: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "lock.fill")
                .font(.title2)
                .foregroundStyle(Theme.candle)
                .frame(width: 32)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(lockedText)
                    .font(.display(.title3))
                    .foregroundStyle(Theme.text)
                Text("Your vote is locked in. Watch the shared screen for the result.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedText)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surface(.card)
        .accessibilityElement(children: .combine)
    }

    private var lockedText: String {
        guard let votedTargetID else { return "You voted to skip" }
        let name = seats.first { $0.seatID == votedTargetID }?.displayName ?? "a player"
        return "You voted for \(name)"
    }
}

#Preview {
    NavigationStack {
        VoteView(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0"),
                 seats: PublicSeat.previews, deadline: .now.addingTimeInterval(30), lockedIn: false, votedTargetID: nil, vote: { _ in })
    }
}
