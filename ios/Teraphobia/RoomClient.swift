import Foundation
import Observation
import SocketIO

// The phone's side of the lobby (FR-5, FR-6): checks the code over REST, then takes a seat over socket.io.
@Observable
final class RoomClient {
    // The Simulator reaches the server running on this Mac. A real iPhone, run from Xcode or TestFlight,
    // uses the live server: on a phone, localhost would be the phone itself.
    #if targetEnvironment(simulator)
    static let serverURL = URL(string: "http://localhost:4000")!
    #else
    static let serverURL = URL(string: "https://teraphobia.com")!
    #endif

    var isJoining = false
    var joined = false
    var room: RoomState?
    var seatID: String?
    var nameError: String?
    var roomError: String?

    // The game, from the server's private and phase events.
    var you: YouRole?
    var phase: PhaseStart?
    var phaseDeadline = Date()
    // When this phase began on the phone, so the countdown ring knows how full to be.
    var phaseStartedAt: Date?
    // True when the phase came back from a rejoin rather than starting, so its sound doesn't play again.
    var phaseFromRejoin = false
    var result: YouResult?
    // The village's Day vote (#102): today's ballot, how many have voted, and the latest public result.
    var dayOptions: DayOptions?
    var dayProgress: DayProgress?
    var dayResult: DayResult?
    // This phone's own ballot and the round it was cast in. The server keeps the last one sent.
    var ballot: DaySubmit?
    var ballotRound: Int?
    // The Monster's power, as the server last said (you:power after each Day, or the rejoin).
    var powerUsed = false
    // The Day round the Vampire's or Witch's power was sent in. The server holds it until Day ends.
    var powerSentRound: Int?
    var nightVictims = 0
    var gameError: String?

    // Reconnecting after a drop (#36), the end of the game, and this round's vote.
    var reconnecting = false
    var gameOver: GameOver?
    var votedRound: Int?
    var votedTargetID: String?

    // Goes up each time someone dies or is banished while this phone watches, for the death sting.
    var deaths = 0

    // The ballot the server held before the last cast, put back if it refuses the new one.
    private var ballotBeforeCast: DaySubmit?
    private var manager: SocketManager?
    // From you:joined. Sent back in room:join after a drop to get the same seat.
    private var rejoinToken: String?
    // The full length of each phase, seen at its phase:start. A rejoin or a resume only gets the time left,
    // so it uses these to find the start.
    private var phaseLengths: [Phase: TimeInterval] = [:]

    // Where the ring starts: a full phase length before the deadline. Without one, the ring starts full from now.
    private func startOfPhase(_ phase: Phase) -> Date {
        phaseLengths[phase].map { phaseDeadline.addingTimeInterval(-$0) } ?? Date()
    }

    private static func outCount(_ room: RoomState?) -> Int {
        room?.seats.filter { $0.lifeStatus != .alive }.count ?? 0
    }

    func join(code: String, displayName: String, accessToken: String? = nil) async {
        roomError = nil
        nameError = nil
        isJoining = true
        // A bad code is caught here, so no socket opens for it.
        if let problem = await checkRoom(code) {
            roomError = problem
            isJoining = false
            return
        }
        connect(code: code, displayName: displayName, accessToken: accessToken)
    }

    // At launch, takes back the seat this phone had when iOS closed the app (#112). True when there was one to try.
    func resume(accessToken: String?) -> Bool {
        guard let seat = Self.savedSeat() else { return false }
        rejoinToken = seat.rejoinToken
        isJoining = true
        reconnecting = true
        connect(code: seat.code, displayName: seat.displayName, accessToken: accessToken)
        return true
    }

    // Back from the background. A locked phone can wake up holding a socket the server already dropped, which
    // still says connected until its ping check runs out, so a game in progress always reconnects now.
    func reconnectNow() {
        guard let manager else { return }
        // Before Start the server frees a dropped seat, so the lobby only retries a socket that's already gone.
        if you == nil, manager.defaultSocket.status == .connected { return }
        reconnecting = true
        manager.reconnect()
    }

    func leave() {
        // Handlers go first, so our own disconnect isn't shown as an error.
        manager?.defaultSocket.removeAllHandlers()
        manager?.disconnect()
        manager = nil
        isJoining = false
        joined = false
        room = nil
        seatID = nil
        you = nil
        phase = nil
        phaseStartedAt = nil
        phaseFromRejoin = false
        phaseLengths = [:]
        deaths = 0
        result = nil
        dayOptions = nil
        dayProgress = nil
        dayResult = nil
        ballot = nil
        ballotRound = nil
        powerUsed = false
        powerSentRound = nil
        nightVictims = 0
        gameError = nil
        reconnecting = false
        gameOver = nil
        votedRound = nil
        votedTargetID = nil
        rejoinToken = nil
        Self.clearSeat()
    }

    // What a closed app needs to get its seat back. In the Keychain, so it survives iOS ending the app.
    struct SavedSeat: Codable, Equatable {
        let code: String
        let displayName: String
        let rejoinToken: String
    }

    static func saveSeat(_ seat: SavedSeat) {
        guard let data = try? JSONEncoder().encode(seat) else { return }
        Keychain.save(data, account: "seat")
    }

    static func savedSeat() -> SavedSeat? {
        Keychain.load(account: "seat").flatMap { try? JSONDecoder().decode(SavedSeat.self, from: $0) }
    }

    static func clearSeat() {
        Keychain.delete(account: "seat")
    }

    func emit(_ event: String, _ value: some Encodable) {
        manager?.defaultSocket.emit(event, Self.payload(value))
    }

    // A Day ballot. Sending another replaces it, until Day ends.
    func cast(_ submit: DaySubmit) {
        // Only today's ballot can be put back; yesterday's no longer counts.
        ballotBeforeCast = ballotRound == phase?.round ? ballot : nil
        ballot = submit
        ballotRound = phase?.round
        emit("day:submit", submit)
    }

    // The Vampire's or Witch's power. It's only marked used when the server's you:power says so.
    func usePower() {
        // Already sent today: the server holds it, and a second one would only be refused.
        guard let round = phase?.round, powerSentRound != round else { return }
        powerSentRound = round
        emit("power:use", PowerUse(targetID: nil))
    }

    // Skip is "targetId": null, but VoteSubmit(targetID: nil) encodes as {}, which the server refuses. So this payload is built by hand.
    func vote(for targetID: String?) {
        votedRound = phase?.round
        votedTargetID = targetID
        let payload: [String: Any] = targetID.map { ["targetId": $0] } ?? ["targetId": NSNull()]
        manager?.defaultSocket.emit("vote:submit", payload)
    }

    // The message to show, or nil when the room can be joined.
    private func checkRoom(_ code: String) async -> String? {
        let url = Self.serverURL.appending(path: "api/rooms/\(code)")
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(from: url)
        } catch {
            return "Can't reach the server"
        }
        if (response as? HTTPURLResponse)?.statusCode == 404 { return "Room not found" }
        switch (try? JSONDecoder().decode(RoomCheck.self, from: data))?.status {
        case "open": return nil
        case "started": return "Game already started"
        case "full": return "Room is full"
        default: return "Something went wrong"
        }
    }

    private func connect(code: String, displayName: String, accessToken: String?) {
        // A dropped socket retries every 1 to 5 seconds (the default is 10 to 30) and rejoins with the token.
        let manager = SocketManager(socketURL: Self.serverURL, config: [.reconnectWait(1), .reconnectWaitMax(5)])
        let socket = manager.defaultSocket
        self.manager = manager

        // The socket keeps these handlers and this object keeps the socket, so they hold self weakly.
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            // Also runs after every reconnect, when the token gets the same seat back.
            self?.emit("room:join", RoomJoin(code: code, displayName: displayName, rejoinToken: self?.rejoinToken))
        }
        socket.on("you:joined") { [weak self] data, _ in
            guard let self, let you = Self.decode(YouJoined.self, data) else { return }
            seatID = you.seatID
            rejoinToken = you.rejoinToken
            Self.saveSeat(SavedSeat(code: code, displayName: displayName, rejoinToken: you.rejoinToken))
            isJoining = false
            joined = true
        }
        socket.on("room:state") { [weak self] data, _ in
            guard let self else { return }
            let next = Self.decode(RoomState.self, data)
            // While reconnecting, the room catches up on deaths we missed. Those don't count as happening now.
            if !reconnecting, Self.outCount(next) > Self.outCount(room) { deaths += 1 }
            room = next
        }
        socket.on("you:role") { [weak self] data, _ in
            self?.you = Self.decode(YouRole.self, data)
        }
        socket.on("phase:start") { [weak self] data, _ in
            guard let self, let next = Self.decode(PhaseStart.self, data) else { return }
            // The phone's clock can differ from the server's, so only the time left is used.
            let timeLeft = Double(next.endsAt - next.serverNow) / 1000
            phaseDeadline = Date().addingTimeInterval(timeLeft)
            // Phases never repeat back to back, so the same phase and round again means the host's screen
            // paused and came back with the time it had left. The ring keeps its place and nothing replays.
            if next.phase == phase?.phase, next.round == phase?.round {
                phaseStartedAt = startOfPhase(next.phase)
            } else {
                // The Werewolf's double kill is used up once a night with two victims ends.
                if next.phase == .morning {
                    if nightVictims == 2 { powerUsed = true }
                    nightVictims = 0
                }
                phaseStartedAt = Date()
                phaseLengths[next.phase] = timeLeft
                phaseFromRejoin = false
            }
            phase = next
            gameError = nil
        }
        // Only the Villager who searched for the village gets a you:result.
        socket.on("you:result") { [weak self] data, _ in
            self?.result = Self.decode(YouResult.self, data)
        }
        socket.on("day:options") { [weak self] data, _ in
            self?.dayOptions = Self.decode(DayOptions.self, data)
        }
        socket.on("day:progress") { [weak self] data, _ in
            self?.dayProgress = Self.decode(DayProgress.self, data)
        }
        socket.on("day:result") { [weak self] data, _ in
            self?.dayResult = Self.decode(DayResult.self, data)
        }
        // After every Day. A Witch whose fake met a Candle day keeps her power, so this can say false.
        socket.on("you:power") { [weak self] data, _ in
            guard let self, let power = Self.decode(YouPower.self, data) else { return }
            powerUsed = power.powerUsed
            powerSentRound = nil
        }
        socket.on(clientEvent: .reconnect) { [weak self] _, _ in
            self?.reconnecting = true
        }
        socket.on("you:rejoined") { [weak self] data, _ in
            guard let self, let state = Self.decode(YouRejoined.self, data) else { return }
            room = state.room
            you = state.you
            phaseFromRejoin = true
            phase = state.phase
            if let next = state.phase {
                phaseDeadline = Date().addingTimeInterval(Double(next.endsAt - next.serverNow) / 1000)
                phaseStartedAt = startOfPhase(next.phase)
            }
            result = state.results.last
            dayOptions = state.dayOptions
            dayResult = state.dayResult
            if let used = state.powerUsed { powerUsed = used }
            reconnecting = false
        }
        socket.on("game:over") { [weak self] data, _ in
            self?.gameOver = Self.decode(GameOver.self, data)
            // The server deletes the room once the game ends, so there's no seat left to come back to.
            Self.clearSeat()
        }
        socket.on("error") { [weak self] data, _ in
            guard let self else { return }
            let serverError = Self.decode(ServerError.self, data)
            // Failed retries arrive here as plain strings and are ignored. A refused rejoin ends the session.
            if reconnecting {
                guard serverError != nil else { return }
                // Refused at launch means that game already ended, so the Join screen stays quiet.
                if joined { roomError = "Lost connection to the room" }
                leave()
                return
            }
            // Once in the room, a refused pick or action is shown on the game screen.
            if joined {
                gameError = serverError?.message
                // A refused Day ballot didn't replace the one before it, so the screen goes back to that one.
                if serverError?.event == "day:submit" { ballot = ballotBeforeCast }
                // A refused power was never held, so the button comes back. Except "power used": then the server
                // already holds one (or it's spent), and you:power will say which when Day ends.
                if serverError?.event == "power:use", serverError?.code != .powerUsed { powerSentRound = nil }
                return
            }
            // Name problems go under the name field; anything else under the Join button.
            switch serverError?.code {
            case .nameTaken: nameError = "That name is taken in this room"
            case .invalidPayload: nameError = "Names are 1 to 16 characters"
            case nil: roomError = "Can't reach the server"
            default: roomError = serverError?.message
            }
            leave()
        }
        socket.on(clientEvent: .disconnect) { [weak self] data, _ in
            guard let self else { return }
            // The server closes a kicked phone's socket itself; any other drop is a lost connection.
            let kicked = data.first as? String == "Got Disconnect"
            roomError = kicked ? "You were removed from the room" : "Lost connection to the room"
            leave()
        }
        // Signed in, the server ties this seat to the account (FR-13). Guests send no payload.
        socket.connect(withPayload: accessToken.map { ["token": $0, "player": true] })
    }

    // socket.io sends and receives dictionaries, so payloads go through JSON to reach the generated types.
    private static func payload(_ value: some Encodable) -> [String: Any] {
        guard let data = try? JSONEncoder().encode(value),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return object
    }

    private static func decode<T: Decodable>(_ type: T.Type, _ data: [Any]) -> T? {
        // Connection errors arrive as plain strings, which JSONSerialization would crash on.
        guard let object = data.first, JSONSerialization.isValidJSONObject(object),
              let json = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode(type, from: json)
    }
}

// GET /api/rooms/:code answers { code, status }. REST responses have no generated type.
private struct RoomCheck: Decodable {
    let status: String
}
