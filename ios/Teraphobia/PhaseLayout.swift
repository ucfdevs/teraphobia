import SwiftUI

// Every in-game screen uses this layout: the phase's backdrop, a big heading with the countdown ring,
// the role card, your costume, then the screen's own content. Day, Discussion and Vote stay neutral for
// everyone; only Monster-only moments pass a Monster look (see ScreenLook).
struct PhaseLayout<Content: View>: View {
    let title: String
    let deadline: Date
    let you: YouRole
    // The big heading under the bar. Defaults to the title.
    var heading: String?
    var look: ScreenLook = .neutral
    @ViewBuilder let content: Content

    @Environment(\.gameBackdrop) private var backdrop
    @Environment(\.phaseStartedAt) private var phaseStartedAt

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .center, spacing: 12) {
                    Text(heading ?? title)
                        .font(.display(.largeTitle))
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Countdown(deadline: deadline, startedAt: phaseStartedAt, size: 72)
                }

                RolePeek(you: you)

                YourCostume(costume: you.costume)

                content
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .gameBackground(backdrop, look: look)
        // The bar keeps the phase name (VoiceOver and the UI tests find the screen by it), drawn over the sky.
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                MuteButton()
            }
        }
    }
}

// Costumes are public, so everyone can see and talk about their own. Shown big on every game screen.
struct YourCostume: View {
    let costume: Costume

    var body: some View {
        HStack(spacing: 14) {
            CostumeView(costume: costume, size: 96, boxed: false)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Your costume")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedText)
                Text(costumeName(costume).capitalized)
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .surface(.card)
        .accessibilityElement(children: .combine)
    }
}

// Living players other than you, as costume cards. Used for Night picks, the Candle, the Monster's power and the vote.
struct PlayerPicker: View {
    let header: String
    let seats: [PublicSeat]
    let you: YouRole
    let picked: [String]
    let onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(header)
            CostumeGrid(seats: seats.filter { $0.lifeStatus == .alive && $0.seatID != you.seatID },
                        picked: picked, onPick: onPick)
        }
    }
}

// Set once by GameView for the current phase, read by PhaseLayout.
extension EnvironmentValues {
    var gameBackdrop: Backdrop {
        get { self[GameBackdropKey.self] }
        set { self[GameBackdropKey.self] = newValue }
    }

    var phaseStartedAt: Date? {
        get { self[PhaseStartedAtKey.self] }
        set { self[PhaseStartedAtKey.self] = newValue }
    }
}

private struct GameBackdropKey: EnvironmentKey {
    static let defaultValue = Backdrop.night
}

private struct PhaseStartedAtKey: EnvironmentKey {
    static let defaultValue: Date? = nil
}

// Sample players for the Night and Day previews.
extension PublicSeat {
    static let previews = ["Gui", "Cameron", "Lili", "Bernardo", "Teresa"].enumerated().map { index, name in
        PublicSeat(connected: true, costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask),
                   displayName: name, lifeStatus: .alive, seatID: "seat\(index)")
    }
}
