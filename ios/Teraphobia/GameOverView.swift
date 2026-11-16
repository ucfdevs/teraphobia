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

    private var monsterName: String {
        seats.first { $0.seatID == gameOver.monster.seatID }?.displayName ?? "Someone"
    }

    private var reason: String {
        switch gameOver.endReason {
        case .banished: "The village banished the Monster."
        case .outnumbered: "The Monster outnumbered the village."
        case .forfeit: "The Monster left the game."
        }
    }

    var body: some View {
        ContentUnavailableView {
            Label(won ? "You win" : "You lose", systemImage: won ? "trophy" : "moon")
        } description: {
            Text("\(monsterName) was the \(gameOver.monster.monsterType.rawValue.capitalized). \(reason)")
        } actions: {
            Button("Done", action: done)
        }
        .navigationBarBackButtonHidden()
    }
}

#Preview {
    GameOverView(gameOver: GameOver(endReason: .banished, hunches: [], monster: Monster(monsterType: .vampire, seatID: "seat1"), rounds: 3, winner: .villagers),
                 you: YouRole(costume: Costume(hat: "hat1", item: "item1", mask: "mask1"), monsterType: nil, role: .villager, seatID: "seat0"),
                 seats: PublicSeat.previews, done: {})
}
