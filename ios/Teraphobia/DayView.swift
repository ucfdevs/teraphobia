import SwiftUI

// The village's Day vote (#102): every living player, the Monster included, votes for one action
// the whole village takes. A vote can change until Day ends. The Monster also sees a rotating flavor
// message and its power button until it's used.
// Every card looks and sounds the same for every role, so a glance at the Monster's phone gives nothing away.
struct DayView: View {
    let you: YouRole
    let seats: [PublicSeat]
    let round: Int
    let deadline: Date
    let powerUsed: Bool
    // This phone's vote today, or nil before it votes.
    let ballot: DaySubmit?
    let options: BallotOptions
    let progress: DayProgress?
    let cast: (DaySubmit) -> Void
    let usePower: (PowerUse) -> Void

    // Candle tapped but nobody picked to protect yet. A Candle vote isn't sent until it has a target.
    @State private var choosingCandle = false
    @State private var choosingPowerTarget = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isMonster: Bool { you.role == .monster }

    // The card shown as picked: a Candle still waiting for its target, or the vote the server has.
    private var picked: DayAction? { choosingCandle ? .candle : ballot?.action }

    private var candleTarget: String? { ballot?.action == .candle ? ballot?.targetID : nil }

    // A Candle waiting for its target hasn't replaced the vote the server already has.
    private var noteText: String {
        if choosingCandle && ballot?.action != .candle {
            return ballot == nil ? "Pick who to protect to cast your vote." : "Pick who to protect. Your earlier vote counts until then."
        }
        return ballot == nil ? "The village does whatever gets the most votes." : "Locked in. You can change your vote until Day ends."
    }

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
                SectionHeading("Vote for one")
                // Not in a GlassGroup: inside one, the selected card's orange border blends into the glass and disappears.
                actionCard(.search, "Search the crime scene",
                           detail: "One Villager learns something the Monster wears or carries.", icon: "magnifyingglass")
                actionCard(.commune, "Commune with the dead",
                           detail: "Everyone learns something the Monster doesn't have.", icon: "moon.stars")
                actionCard(.candle, "Light a candle",
                           detail: "Protect a player from tonight's kill.", icon: "flame.fill")
            }

            if picked == .candle {
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
                VStack(alignment: .leading, spacing: 4) {
                    if isMonster {
                        FlavorMessage()
                    } else {
                        Text(noteText)
                    }
                    if let progress, progress.round == round {
                        Text("\(progress.voted) of \(progress.voters) have voted")
                            .font(.subheadline)
                            .foregroundStyle(Theme.mutedText)
                            .contentTransition(.numericText())
                    }
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
        .animation(reduceMotion ? nil : .spring(duration: 0.35), value: picked)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: choosingPowerTarget)
    }

    private var powerTitle: String {
        you.monsterType == .vampire ? "Block a player's action" : "Plant a fake clue"
    }

    private func actionCard(_ value: DayAction, _ title: String, detail: String, icon: String) -> some View {
        let selected = picked == value
        let reason = options.reason(for: value)
        let shape = RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
        return Button {
            // Same sound for every role.
            SoundEngine.shared.play(.pick)
            if value == .candle {
                choosingCandle = true
            } else {
                choosingCandle = false
                cast(DaySubmit(action: value, targetID: nil))
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
                    Text(reason ?? detail)
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
            .surface(.card, selected: selected, interactive: reason == nil)
            .contentShape(shape)
            .opacity(reason == nil ? 1 : 0.45)
            .animation(reduceMotion ? nil : .spring(duration: 0.25, bounce: 0.4), value: selected)
        }
        .buttonStyle(CardPressStyle())
        .disabled(reason != nil)
        .sensoryFeedback(.selection, trigger: selected)
        // The icons and checkmark are decoration; the Selected trait says it's picked. A greyed card's reason is
        // its value, not a hint, because VoiceOver users can turn hints off.
        .accessibilityLabel(title)
        .accessibilityValue(reason ?? "")
        .accessibilityHint(reason == nil ? detail : "")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func lightCandle(_ seatID: String) {
        choosingCandle = false
        cast(DaySubmit(action: .candle, targetID: seatID))
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

// A short note on a card: art on the left, words on the right. The Villager's and the Monster's
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

// The village's Day result, shown during Discussion. Every phone shows the public result; the Villager
// who searched also sees their private clue in the same card.
struct ResultView: View {
    let you: YouRole
    let deadline: Date
    let outcome: DayOutcome

    private let spriteSize: CGFloat = 96

    var body: some View {
        PhaseLayout(title: "Discussion", deadline: deadline, you: you, heading: "Who's lying?") {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Today's action")
                NoteCard(artWidth: spriteSize) {
                    // The Stranger fills the spot when there's no trait to show, so every card has the same shape.
                    if let trait = outcome.trait {
                        TraitView(trait: trait, size: spriteSize, boxed: false)
                    } else {
                        StrangerView(size: spriteSize)
                    }
                } content: {
                    Text(outcome.text)
                        .font(.display(.title3))
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        DayView(you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: .vampire, role: .monster, seatID: "seat0"),
                seats: PublicSeat.previews, round: 2, deadline: .now.addingTimeInterval(30), powerUsed: false,
                ballot: DaySubmit(action: .commune, targetID: nil),
                options: BallotOptions(options: DayOptions(commune: true, round: 2, search: false), round: 2),
                progress: DayProgress(round: 2, voted: 3, voters: 5),
                cast: { _ in }, usePower: { _ in })
    }
}
