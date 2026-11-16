import Foundation
import Testing
@testable import Teraphobia

@MainActor
struct ProfileTests {
    private func profile(avatarId: String?, signInMethods: [String]) throws -> Profile {
        let avatar = avatarId.map { "\"\($0)\"" } ?? "null"
        let methods = signInMethods.map { "\"\($0)\"" }.joined(separator: ",")
        let json = """
        {"id":"u1","email":"gui@ucf.edu","displayName":"Gui","avatarId":\(avatar),"emailVerified":true,
         "signInMethods":[\(methods)],"stats":{"gamesPlayed":3,"villagerWins":1,"monsterWins":{"vampire":1,"witch":0,"werewolf":0}},
         "createdAt":"2026-11-01T12:00:00.000Z"}
        """
        return try JSONDecoder.server.decode(Profile.self, from: Data(json.utf8))
    }

    @Test func savedAvatarIsShown() throws {
        #expect(try profile(avatarId: "witch", signInMethods: ["password"]).avatar == .witch)
    }

    @Test(arguments: [nil, "crown"])
    func missingOrUnknownAvatarShowsVillager(avatarId: String?) throws {
        #expect(try profile(avatarId: avatarId, signInMethods: ["password"]).avatar == .villager)
    }

    @Test func bothSignInMethodsAreNamed() throws {
        #expect(try profile(avatarId: nil, signInMethods: ["password", "google"]).signInMethod == "Email and password, Google")
    }

    @Test func historyReadsServerDates() throws {
        let json = """
        {"page":1,"limit":50,"total":1,"games":[{"id":"g1","startedAt":"2026-11-16T07:10:00.000Z","endedAt":"2026-11-16T07:29:19.123Z",
         "playerCount":5,"players":["Gui","Lili"],"monsterType":"witch","winner":"villagers","role":"villager","outcome":"won"}]}
        """
        let page = try JSONDecoder.server.decode(GamesPage.self, from: Data(json.utf8))
        let game = try #require(page.games.first)
        #expect(game.won)
        #expect(game.winner == .villagers)
        #expect(abs(game.endedAt.timeIntervalSince1970 - 1_794_814_159.123) < 0.001)
    }
}
