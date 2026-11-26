import SwiftUI

// What the open role card says about the Monster's power (#113). It lives in the card, which only its owner
// opens, so every phone's Day screen looks the same. Used comes only from the server, never from a tap.
struct RolePower {
    var isDay = false
    var round = 0
    // From the server's you:power after each Day, or the rejoin.
    var used = false
    // The round the power was sent in. If that's today, the server holds it until Day ends and refuses another.
    var sentRound: Int?
    var use: () -> Void = {}

    private var pending: Bool { isDay && sentRound == round }

    func slot(for you: YouRole) -> PowerSlot {
        guard you.role == .monster, let type = you.monsterType else {
            return .note("Villagers have no power. Your vote is your weapon.")
        }
        switch type {
        case .werewolf:
            return .note(used ? "Your double kill is used." : "Once a game, from Night 2, you can kill two players in one night.")
        case .vampire:
            if used { return .note("Your power is used.") }
            if pending { return .note("Today's action will be blocked.") }
            return isDay ? .button("Block today's action") : .note("During Day, you can block the village's action once.")
        case .witch:
            if used { return .note("Your power is used.") }
            if pending { return .note("If the village searches or communes today, its clue is fake.") }
            return isDay ? .button("Plant a fake clue today") : .note("During Day, you can fake the village's clue once.")
        }
    }
}

enum PowerSlot: Equatable {
    case button(String)
    case note(String)
}

// Set once by GameView, read by the role card on every game screen.
extension EnvironmentValues {
    @Entry var rolePower = RolePower()
}
