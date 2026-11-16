import Foundation

// GET and PATCH /api/users/me answer with this (server/src/routes/users.ts). REST responses have no generated type.
struct Profile: Decodable {
    let email: String
    let displayName: String
    let avatarId: String?
    let emailVerified: Bool
    let signInMethods: [String]
    let stats: Stats

    struct Stats: Decodable {
        let gamesPlayed: Int
        let villagerWins: Int
        let monsterWins: MonsterWins
    }

    struct MonsterWins: Decodable {
        let vampire: Int
        let witch: Int
        let werewolf: Int
    }

    // No avatar yet, or an id this app doesn't know, shows the Villager.
    var avatar: Avatar {
        avatarId.flatMap(Avatar.init) ?? .villager
    }

    // The server says "password" and "google"; players know them as these.
    var signInMethod: String {
        signInMethods.map { $0 == "google" ? "Google" : "Email and password" }.joined(separator: ", ")
    }
}

// GET /api/users/me/games: one page of the player's games, newest first.
struct GamesPage: Decodable {
    let total: Int
    let games: [PastGame]
}

struct PastGame: Decodable, Identifiable {
    let id: String
    let endedAt: Date
    let players: [String]
    let monsterType: MonsterType
    let winner: Winner
    let role: Role
    let outcome: String

    var won: Bool { outcome == "won" }
}

// The preset Villager and Monster icons (FR-15). The raw value is the avatarId the server saves.
enum Avatar: String, CaseIterable, Identifiable {
    case villager, vampire, witch, werewolf

    var id: String { rawValue }
    var name: String { rawValue.capitalized }

    var symbol: String {
        switch self {
        case .villager: "person.fill"
        case .vampire: "drop.fill"
        case .witch: "wand.and.stars"
        case .werewolf: "pawprint.fill"
        }
    }
}

extension JSONDecoder {
    // Express sends dates like 2026-11-16T07:29:19.123Z, and the built-in .iso8601 can't read the milliseconds.
    static let server: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            return try Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text)
        }
        return decoder
    }()
}
