import SwiftUI

// Win or lose for this player. The shared screen shows the full reveal and the night hunches.
struct GameOverView: View {
    let gameOver: GameOver
    let you: YouRole
    let seats: [PublicSeat]
    let done: () -> Void

    private var won: Bool {
        you.role == .monster ? gameOver.winner == .monster : gameOver.winner == .villagers
    }

    private var monsterWon: Bool { gameOver.winner == .monster }

    private var monsterName: String {
        seats.first { $0.seatID == gameOver.monster.seatID }?.displayName ?? "Someone"
    }

    private var monsterCostume: Costume? {
        seats.first { $0.seatID == gameOver.monster.seatID }?.costume
    }

    private var flavor: String {
        monsterWon ? "The night belongs to the Monster." : "The sun rises on a safe village."
    }

    private var reason: String {
        switch gameOver.endReason {
        case .banished: "The village banished the Monster."
        case .outnumbered: "The Monster outnumbered the village."
        case .forfeit: "The Monster left the game."
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 6) {
                    Text(won ? "You win" : "You lose")
                        .font(.display(.largeTitle))
                        .foregroundStyle(Theme.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(flavor)
                        .font(.headline)
                        .foregroundStyle(Theme.text.opacity(0.85))
                }
                .multilineTextAlignment(.center)
                .padding(.top, 16)

                MonsterReveal(costume: monsterCostume, monsterWon: monsterWon)

                VStack(spacing: 6) {
                    Text("\(monsterName) was the \(gameOver.monster.monsterType.rawValue.capitalized).")
                        .font(.display(.title2))
                        .foregroundStyle(Theme.text)
                    Text(reason)
                        .font(.callout)
                        .foregroundStyle(Theme.mutedText)
                }
                .multilineTextAlignment(.center)

                Button("Done", action: done)
                    .buttonStyle(.candle)
                    .padding(.top, 8)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .gameBackground(monsterWon ? .monsterWon : .villageWon)
        .navigationBarBackButtonHidden()
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

// The Monster's costume, big. When the Monster wins, a crown drops onto its head; when the village wins,
// gold sparkles burst around the caught Monster. With Reduce Motion they fade in where they land.
private struct MonsterReveal: View {
    let costume: Costume?
    let monsterWon: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var landed = false

    // Where the sparkles sit around the card, and how big each one is.
    private let sparkles: [(x: CGFloat, y: CGFloat, size: CGFloat)] = [
        (-96, -70, 26), (100, -54, 20), (-110, 36, 18), (104, 60, 28), (-40, -104, 16), (54, 100, 16),
    ]

    var body: some View {
        ZStack {
            Group {
                if let costume {
                    CostumeView(costume: costume, size: 160, boxed: false)
                } else {
                    StrangerView(size: 160)
                }
            }
            .padding(20)
            .surface(.card, tint: (monsterWon ? Theme.blood : Theme.gold).opacity(0.25))

            if monsterWon {
                Image(systemName: "crown.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(Theme.gold)
                    .shadow(color: Theme.blood, radius: 12)
                    .rotationEffect(.degrees(-12))
                    .offset(x: 18, y: landed || reduceMotion ? -112 : -260)
                    .opacity(landed ? 1 : 0)
            } else {
                ForEach(sparkles.indices, id: \.self) { index in
                    let sparkle = sparkles[index]
                    Image(systemName: "sparkle")
                        .font(.system(size: sparkle.size))
                        .foregroundStyle(Theme.gold)
                        .shadow(color: Theme.gold.opacity(0.8), radius: 8)
                        .offset(x: sparkle.x, y: sparkle.y)
                        .scaleEffect(landed || reduceMotion ? 1 : 0.2)
                        .opacity(landed ? 1 : 0)
                        .animation(reduceMotion ? .easeOut(duration: 0.4)
                                                : .spring(duration: 0.5, bounce: 0.5).delay(0.35 + Double(index) * 0.06),
                                   value: landed)
                }
            }
        }
        .frame(height: 210)
        // Room above the card for the crown and the top sparkles.
        .padding(.top, 24)
        .accessibilityHidden(true)
        .onAppear {
            withAnimation(reduceMotion ? .easeOut(duration: 0.4) : .spring(duration: 0.7, bounce: 0.45).delay(0.3)) {
                landed = true
            }
        }
    }
}

#Preview("Village won") {
    GameOverView(gameOver: GameOver(endReason: .banished, hunches: [], monster: Monster(monsterType: .vampire, seatID: "seat1"), rounds: 3, winner: .villagers),
                 you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0"),
                 seats: PublicSeat.previews, done: {})
}

#Preview("Monster won") {
    GameOverView(gameOver: GameOver(endReason: .outnumbered, hunches: [], monster: Monster(monsterType: .witch, seatID: "seat1"), rounds: 4, winner: .monster),
                 you: YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0"),
                 seats: PublicSeat.previews, done: {})
}
