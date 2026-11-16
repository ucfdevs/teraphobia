import SwiftUI

// Villagers pick Search, Commune, or Candle. The Monster sees the same three buttons as cover
// (they send nothing), a rotating flavor message, and its power button until it's used.
struct DayView: View {
    let you: YouRole
    let seats: [PublicSeat]
    let round: Int
    let deadline: Date
    let powerUsed: Bool
    let sendAction: (DaySubmit) -> Void
    let usePower: (PowerUse) -> Void

    @State private var action: DayAction?
    @State private var candleTarget: String?
    @State private var choosingPowerTarget = false

    private var isMonster: Bool { you.role == .monster }

    // Vampire and Witch powers are used during Day. The Werewolf's is at Night.
    private var showPower: Bool {
        isMonster && you.monsterType != .werewolf && !powerUsed
    }

    var body: some View {
        PhaseLayout(title: "Day \(round)", deadline: deadline, you: you) {
            Section("Pick one") {
                actionButton(.search, "Search the crime scene", icon: "magnifyingglass")
                actionButton(.commune, "Commune with the dead", icon: "moon.stars")
                actionButton(.candle, "Light a candle", icon: "flame")
            }

            if action == .candle {
                PlayerPicker(header: "Protect who tonight?", seats: seats, you: you,
                             picked: candleTarget.map { [$0] } ?? [], onPick: lightCandle)
            }

            Section {
                if isMonster {
                    FlavorMessage()
                } else {
                    Text(action == nil ? "Your result comes when Day ends." : "Locked in. Your result comes when Day ends.")
                }
            }

            if showPower {
                if choosingPowerTarget {
                    PlayerPicker(header: powerTitle, seats: seats, you: you, picked: [], onPick: { seatID in
                        usePower(PowerUse(targetID: seatID))
                        choosingPowerTarget = false
                    })
                } else {
                    Section {
                        Button(powerTitle) { choosingPowerTarget = true }
                    }
                }
            }
        }
    }

    private var powerTitle: String {
        you.monsterType == .vampire ? "Block a player's action" : "Plant a fake clue"
    }

    private func actionButton(_ value: DayAction, _ title: String, icon: String) -> some View {
        Button {
            action = value
            candleTarget = nil
            // A Candle is only sent once it has a target.
            if !isMonster && value != .candle {
                sendAction(DaySubmit(action: value, targetID: nil))
            }
        } label: {
            HStack {
                Label(title, systemImage: icon)
                    .foregroundStyle(.primary)
                Spacer()
                if action == value {
                    Image(systemName: "checkmark")
                }
            }
        }
        .accessibilityAddTraits(action == value ? .isSelected : [])
    }

    private func lightCandle(_ seatID: String) {
        candleTarget = seatID
        if !isMonster {
            sendAction(DaySubmit(action: .candle, targetID: seatID))
        }
    }
}

// Changes every 4 seconds while the Monster waits.
struct FlavorMessage: View {
    private let messages = [
        "The villagers are looking for you!",
        "Wait for your turn to strike!",
    ]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 4)) { context in
            Text(messages[Int(context.date.timeIntervalSince1970 / 4) % messages.count])
        }
    }
}

// The private Day result, shown during Discussion. The Monster sees a flavor message in the same spot.
struct ResultView: View {
    let you: YouRole
    let round: Int
    let deadline: Date
    let result: YouResult?

    var body: some View {
        PhaseLayout(title: "Discussion", deadline: deadline, you: you) {
            Section("Your clue") {
                if you.role == .monster {
                    FlavorMessage()
                } else {
                    Text(text)
                }
            }
        }
    }

    private var text: String {
        guard let result, result.round == round else { return "You didn't pick an action today." }
        switch result.action {
        case .search:
            guard let trait = result.trait else { return "You found nothing" }
            return "The Monster has \(trait.slot.rawValue) \(trait.option)"
        case .commune:
            guard let trait = result.trait else { return "The dead are silent" }
            return "The Monster doesn't have \(trait.slot.rawValue) \(trait.option)"
        case .candle:
            return result.candleBlocked == true ? "The Monster blocked your candle" : "Your candle is lit for tonight"
        }
    }
}

#Preview {
    NavigationStack {
        DayView(you: YouRole(costume: Costume(hat: "hat1", item: "item1", mask: "mask1"), monsterType: .vampire, role: .monster, seatID: "seat0"),
                seats: PublicSeat.previews, round: 1, deadline: .now.addingTimeInterval(30), powerUsed: false,
                sendAction: { _ in }, usePower: { _ in })
    }
}
