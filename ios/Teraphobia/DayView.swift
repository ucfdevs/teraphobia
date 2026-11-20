import SwiftUI

// Villagers pick Search, Commune, or Candle. The Monster sees the same three cards as cover
// (they send nothing), a rotating flavor message, and its power button until it's used.
// Every card looks and sounds the same for every role, so a glance at the Monster's phone gives nothing away.
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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isMonster: Bool { you.role == .monster }

    // Vampire and Witch powers are used during Day. The Werewolf's is at Night.
    private var showPower: Bool {
        isMonster && you.monsterType != .werewolf && !powerUsed
    }

    // Choosing a power target is a Monster-only moment, so only then does the screen take the Monster look.
    private var look: ScreenLook {
        showPower && choosingPowerTarget ? ScreenLook(you: you, moment: .usingPower) : .neutral
    }

    var body: some View {
        PhaseLayout(title: "Day \(round)", deadline: deadline, you: you, heading: "Daylight, for now", look: look) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Pick one")
                // Not in a GlassGroup: inside one, the selected card's orange border blends into the glass and disappears.
                actionCard(.search, "Search the crime scene", detail: "Learn one thing the Monster wears or carries.",
                           icon: "magnifyingglass")
                actionCard(.commune, "Commune with the dead", detail: "Learn one thing the Monster doesn't have.",
                           icon: "moon.stars")
                actionCard(.candle, "Light a candle", detail: "Protect another player from tonight's kill.",
                           icon: "flame.fill")
            }

            if action == .candle {
                PlayerPicker(header: "Protect who tonight?", seats: seats, you: you,
                             picked: candleTarget.map { [$0] } ?? [], onPick: lightCandle)
                    .transition(.opacity)
            }

            // The same card in the same spot for both roles.
            NoteCard {
                Image(systemName: "hourglass")
                    .font(.title2)
                    .foregroundStyle(Theme.moon)
            } content: {
                if isMonster {
                    FlavorMessage()
                } else {
                    Text(lockedIn ? "Locked in. Your result comes when Day ends." : "Your result comes when Day ends.")
                }
            }

            if showPower {
                if choosingPowerTarget {
                    VStack(alignment: .leading, spacing: 12) {
                        PlayerPicker(header: powerTitle, seats: seats, you: you, picked: [], onPick: { seatID in
                            usePower(PowerUse(targetID: seatID))
                            choosingPowerTarget = false
                        })
                        Button("Not now") { choosingPowerTarget = false }
                            .buttonStyle(.quiet)
                    }
                    .transition(.opacity)
                } else {
                    Button(powerTitle) { choosingPowerTarget = true }
                        .buttonStyle(.quiet)
                }
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.35), value: action)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: choosingPowerTarget)
    }

    // A Candle only counts once it has someone to protect.
    private var lockedIn: Bool {
        guard let action else { return false }
        return action != .candle || candleTarget != nil
    }

    private var powerTitle: String {
        you.monsterType == .vampire ? "Block a player's action" : "Plant a fake clue"
    }

    private func actionCard(_ value: DayAction, _ title: String, detail: String, icon: String) -> some View {
        let selected = action == value
        let shape = RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
        return Button {
            // Same sound for every role, before anything role-specific happens.
            SoundEngine.shared.play(.pick)
            action = value
            candleTarget = nil
            // A Candle is only sent once it has a target.
            if !isMonster && value != .candle {
                sendAction(DaySubmit(action: value, targetID: nil))
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(selected ? Theme.candle : Theme.moon)
                    .frame(width: 32)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(Theme.text)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedText)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                ZStack {
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(Theme.onCandle, Theme.candle)
                            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
                    }
                }
                .frame(width: 28)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .surface(.card, selected: selected, interactive: true)
            .contentShape(shape)
            .animation(reduceMotion ? nil : .spring(duration: 0.25, bounce: 0.4), value: selected)
        }
        .buttonStyle(CardPressStyle())
        .sensoryFeedback(.selection, trigger: selected)
        // The icons and checkmark are decoration; the Selected trait says it's picked.
        .accessibilityLabel(title)
        .accessibilityHint(detail)
        .accessibilityAddTraits(selected ? .isSelected : [])
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

// A short private note on a card: art on the left, words on the right. The Villager's and the Monster's
// versions use this same card, so the two screens look alike from across the table.
private struct NoteCard<Art: View, Content: View>: View {
    var artWidth: CGFloat = 32
    @ViewBuilder let art: Art
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 14) {
            art
                .frame(width: artWidth)
                .accessibilityHidden(true)
            content
                .font(.headline)
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .surface(.card)
        .accessibilityElement(children: .combine)
    }
}

// The private Day result, shown during Discussion. The Monster sees a flavor message in the same card.
struct ResultView: View {
    let you: YouRole
    let round: Int
    let deadline: Date
    let result: YouResult?

    private let spriteSize: CGFloat = 96

    var body: some View {
        PhaseLayout(title: "Discussion", deadline: deadline, you: you, heading: "Who's lying?") {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Your clue")
                NoteCard(artWidth: spriteSize) {
                    // The Stranger fills the spot when there's no trait to show, so every card has the same shape.
                    if you.role != .monster, let clueTrait {
                        TraitView(trait: clueTrait, size: spriteSize, boxed: false)
                    } else {
                        StrangerView(size: spriteSize)
                    }
                } content: {
                    Group {
                        if you.role == .monster {
                            FlavorMessage()
                        } else {
                            Text(ClueText(result: result, round: round).text)
                        }
                    }
                    .font(.display(.title3))
                }
            }
        }
    }

    // Only Search and Commune results carry a trait.
    private var clueTrait: Trait? {
        guard let result, result.round == round else { return nil }
        return result.trait
    }
}

#Preview {
    NavigationStack {
        DayView(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: .vampire, role: .monster, seatID: "seat0"),
                seats: PublicSeat.previews, round: 1, deadline: .now.addingTimeInterval(30), powerUsed: false,
                sendAction: { _ in }, usePower: { _ in })
    }
}
