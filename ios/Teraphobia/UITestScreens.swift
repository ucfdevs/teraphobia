import Foundation

// UI tests launch the app with "-screen night" (or day, discussion, vote, morning, reconnecting, gameover)
// to open that game screen with sample players, so they run without a server or a real game.
// For screenshots there are also waiting, out-dead, out-banished and gameover-monster.
extension RoomClient {
    static func forUITest() -> RoomClient? {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-screen"), index + 1 < arguments.count else { return nil }

        let client = RoomClient()
        // "-monster vampire" (or witch, werewolf) makes this phone the Monster, to see its look.
        let monsterType = arguments.firstIndex(of: "-monster").flatMap { $0 + 1 < arguments.count ? MonsterType(rawValue: arguments[$0 + 1]) : nil }
        let you = YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: monsterType,
                          role: monsterType == nil ? .villager : .monster, seatID: "seat0")
        client.seatID = you.seatID
        client.you = you
        client.room = RoomState(code: "ABCD", hostConnected: true, preset: .normal, seats: PublicSeat.previews, status: .playing)
        client.phaseDeadline = .now.addingTimeInterval(60)
        client.phaseStartedAt = .now.addingTimeInterval(-30)

        switch arguments[index + 1] {
        case "reconnecting":
            client.reconnecting = true
        case "gameover":
            client.gameOver = GameOver(endReason: .banished, hunches: [], monster: Monster(monsterType: .vampire, seatID: "seat1"),
                                       rounds: 3, winner: .villagers)
        case "gameover-monster":
            // The Monster wins. Played as the Monster ("-monster vampire"), this phone is the one that won.
            let monster = Monster(monsterType: monsterType ?? .witch, seatID: monsterType == nil ? "seat1" : "seat0")
            client.gameOver = GameOver(endReason: .outnumbered, hunches: [], monster: monster, rounds: 4, winner: .monster)
        case "waiting":
            // The lobby: no role or phase yet, and costumes aren't dealt until the game starts.
            client.you = nil
            let seats = PublicSeat.previews.map {
                PublicSeat(connected: $0.seatID != "seat3", costume: nil, displayName: $0.displayName,
                           lifeStatus: .alive, seatID: $0.seatID)
            }
            client.room = RoomState(code: "ABCD", hostConnected: true, preset: .normal, seats: seats, status: .lobby)
        case "out-dead", "out-banished":
            let status: LifeStatus = arguments[index + 1] == "out-dead" ? .dead : .banished
            let seats = PublicSeat.previews.map {
                $0.seatID == you.seatID
                    ? PublicSeat(connected: true, costume: $0.costume, displayName: $0.displayName, lifeStatus: status, seatID: $0.seatID)
                    : $0
            }
            client.room = RoomState(code: "ABCD", hostConnected: true, preset: .normal, seats: seats, status: .playing)
            client.phase = PhaseStart(endsAt: 0, phase: .day, round: 2, serverNow: 0)
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
