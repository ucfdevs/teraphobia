import Foundation

// UI tests launch the app with "-screen night" (or day, discussion, vote, morning, reconnecting, gameover)
// to open that game screen with sample players, so they run without a server or a real game.
extension RoomClient {
    static func forUITest() -> RoomClient? {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-screen"), index + 1 < arguments.count else { return nil }

        let client = RoomClient()
        let you = YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: nil, role: .villager, seatID: "seat0")
        client.seatID = you.seatID
        client.you = you
        client.room = RoomState(code: "ABCD", hostConnected: true, preset: .normal, seats: PublicSeat.previews, status: .playing)
        client.phaseDeadline = .now.addingTimeInterval(60)

        switch arguments[index + 1] {
        case "reconnecting":
            client.reconnecting = true
        case "gameover":
            client.gameOver = GameOver(endReason: .banished, hunches: [], monster: Monster(monsterType: .vampire, seatID: "seat1"),
                                       rounds: 3, winner: .villagers)
        case let screen:
            guard let phase = Phase(rawValue: screen) else { return nil }
            client.phase = PhaseStart(endsAt: 0, phase: phase, round: 1, serverNow: 0)
            client.result = YouResult(action: .search, candleBlocked: nil, round: 1, trait: Trait(option: .crown, slot: .hat))
        }
        return client
        #else
        return nil
        #endif
    }
}
