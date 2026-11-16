import Foundation
import Observation

// Optional accounts (FR-1): email and password against /api/auth. The session is kept in the Keychain.
@Observable
final class AuthClient {
    var isWorking = false
    var error: String?
    private var session = AuthClient.loadSession()

    var user: AuthUser? { session?.user }

    func register(email: String, password: String, displayName: String) async {
        await start("register", ["email": email, "password": password, "displayName": displayName])
    }

    func signIn(email: String, password: String) async {
        await start("login", ["email": email, "password": password])
    }

    // Runs on launch. The server swaps the saved refresh token for a new pair, so a revoked session signs out here.
    func refresh() async {
        guard let refreshToken = session?.refreshToken else { return }
        // Offline, the saved session stays and the next launch tries again.
        guard let response = try? await post("refresh", ["refreshToken": refreshToken]) else { return }
        if response.status == 401 {
            save(nil)
        } else if let next = try? JSONDecoder().decode(Session.self, from: response.data) {
            save(next)
        }
    }

    func signOut() async {
        guard let refreshToken = session?.refreshToken else { return }
        // The token leaves the phone first; revoking it on the server is best effort.
        save(nil)
        _ = try? await post("logout", ["refreshToken": refreshToken])
    }

    private func start(_ path: String, _ body: [String: String]) async {
        error = nil
        isWorking = true
        defer { isWorking = false }
        guard let response = try? await post(path, body) else {
            error = "Can't reach the server"
            return
        }
        if response.status < 300, let next = try? JSONDecoder().decode(Session.self, from: response.data) {
            save(next)
        } else {
            // The server's own message, like "Email is already registered" or "Invalid email or password".
            error = (try? JSONDecoder().decode(AuthError.self, from: response.data))?.error ?? "Something went wrong"
        }
    }

    private func post(_ path: String, _ body: [String: String]) async throws -> (status: Int, data: Data) {
        // Same server as the rooms: localhost in the Simulator, teraphobia.com on a phone.
        var request = URLRequest(url: RoomClient.serverURL.appending(path: "api/auth/\(path)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, data)
    }

    private func save(_ next: Session?) {
        session = next
        if let next, let data = try? JSONEncoder().encode(next) {
            Keychain.save(data)
        } else {
            Keychain.delete()
        }
    }

    private static func loadSession() -> Session? {
        guard let data = Keychain.load() else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }
}

// What register, login, and refresh answer with. REST responses have no generated type.
private struct Session: Codable {
    let accessToken: String
    let refreshToken: String
    let user: AuthUser
}

struct AuthUser: Codable {
    let id: String
    let email: String
    let displayName: String
    let emailVerified: Bool
}

// Failed auth routes answer { error }.
private struct AuthError: Decodable {
    let error: String
}
