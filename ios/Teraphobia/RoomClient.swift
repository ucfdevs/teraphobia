import Foundation
import Observation
import SocketIO

// The phone's side of the lobby (FR-5, FR-6): checks the code over REST, then takes a seat over socket.io.
@Observable
final class RoomClient {
    // The Simulator reaches the server running on this Mac. Swap in the Droplet domain for TestFlight.
    static let serverURL = URL(string: "http://localhost:4000")!

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
    var result: YouResult?
    var powerUsed = false
    var nightVictims = 0
    var gameError: String?

    private var manager: SocketManager?

    func join(code: String, displayName: String) async {
        roomError = nil
        nameError = nil
        isJoining = true
        // A bad code is caught here, so no socket opens for it.
        if let problem = await checkRoom(code) {
            roomError = problem
            isJoining = false
            return
        }
        connect(code: code, displayName: displayName)
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
        result = nil
        powerUsed = false
        nightVictims = 0
        gameError = nil
    }

    func emit(_ event: String, _ value: some Encodable) {
        manager?.defaultSocket.emit(event, Self.payload(value))
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

    private func connect(code: String, displayName: String) {
        // Rejoining with a token is #36, so for now a dropped socket ends the session.
        let manager = SocketManager(socketURL: Self.serverURL, config: [.reconnects(false)])
        let socket = manager.defaultSocket
        self.manager = manager

        // The socket keeps these handlers and this object keeps the socket, so they hold self weakly.
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            self?.emit("room:join", RoomJoin(code: code, displayName: displayName, rejoinToken: nil))
        }
        socket.on("you:joined") { [weak self] data, _ in
            guard let self, let you = Self.decode(YouJoined.self, data) else { return }
            seatID = you.seatID
            isJoining = false
            joined = true
        }
        socket.on("room:state") { [weak self] data, _ in
            self?.room = Self.decode(RoomState.self, data)
        }
        socket.on("you:role") { [weak self] data, _ in
            self?.you = Self.decode(YouRole.self, data)
        }
        socket.on("phase:start") { [weak self] data, _ in
            guard let self, let next = Self.decode(PhaseStart.self, data) else { return }
            // The Werewolf's double kill is used up once a night with two victims ends.
            if next.phase == .morning {
                if nightVictims == 2 { powerUsed = true }
                nightVictims = 0
            }
            phase = next
            // The phone's clock can differ from the server's, so only the time left is used.
            phaseDeadline = Date().addingTimeInterval(Double(next.endsAt - next.serverNow) / 1000)
            gameError = nil
        }
        socket.on("you:result") { [weak self] data, _ in
            self?.result = Self.decode(YouResult.self, data)
        }
        socket.on("error") { [weak self] data, _ in
            guard let self else { return }
            // Once in the room, a refused pick or action is shown on the game screen.
            if joined {
                gameError = Self.decode(ServerError.self, data)?.message
                return
            }
            // Name problems go under the name field; anything else under the Join button.
            let serverError = Self.decode(ServerError.self, data)
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
        socket.connect()
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
