import Foundation
import Testing
@testable import Teraphobia

// The server's socket.io JSON has to decode into the types generated from shared/schemas.
@MainActor
struct SocketEventsTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    @Test func rejoinMidGame() throws {
        let rejoined = try decode(YouRejoined.self, """
        {"room":{"code":"ABCD","hostConnected":true,"preset":"normal","status":"playing",
          "seats":[{"seatId":"s1","displayName":"Gui","connected":true,"lifeStatus":"alive",
                    "costume":{"hat":"top-hat","mask":"domino-mask","item":"lantern"}},
                   {"seatId":"s2","displayName":"Lili","connected":false,"lifeStatus":"dead","costume":null}]},
         "you":{"seatId":"s1","role":"monster","monsterType":"witch","costume":{"hat":"top-hat","mask":"domino-mask","item":"lantern"}},
         "phase":{"phase":"day","round":2,"endsAt":1794814190000,"serverNow":1794814160000},
         "results":[{"round":1,"action":"search","trait":{"slot":"hat","option":"crown"}}],
         "powerUsed":false,"lastCandleTargetId":null}
        """)
        #expect(rejoined.room.seats.count == 2)
        #expect(rejoined.room.seats[1].lifeStatus == .dead)
        #expect(rejoined.you?.monsterType == .witch)
        #expect(rejoined.phase?.phase == .day)
        #expect(rejoined.results.first?.trait == Trait(option: .crown, slot: .hat))
    }

    @Test func rejoinInLobbyHasNoRole() throws {
        let rejoined = try decode(YouRejoined.self, """
        {"room":{"code":"ABCD","hostConnected":true,"preset":"quick","status":"lobby","seats":[]},"results":[]}
        """)
        #expect(rejoined.you == nil)
        #expect(rejoined.phase == nil)
    }

    @Test func gameOver() throws {
        let over = try decode(GameOver.self, """
        {"winner":"villagers","endReason":"banished","rounds":3,"monster":{"seatId":"s2","monsterType":"vampire"},
         "hunches":[{"round":1,"seatId":"s1","suspectId":"s2"}]}
        """)
        #expect(over.winner == .villagers)
        #expect(over.monster.monsterType == .vampire)
        #expect(over.hunches.first?.suspectID == "s2")
    }

    @Test func serverErrorCode() throws {
        let error = try decode(ServerError.self, #"{"code":"name_taken","message":"That name is taken"}"#)
        #expect(error.code == .nameTaken)
    }

    @Test func nightPickUsesServerKeys() throws {
        let data = try JSONEncoder().encode(NightSubmit(victimIDS: ["s2"], suspectID: nil))
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(json?["victimIds"] as? [String] == ["s2"])
    }
}
