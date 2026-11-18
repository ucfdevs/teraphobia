import Foundation
import Observation
import GoogleSignIn
import UIKit

// Optional accounts (FR-1): email and password against /api/auth. The session is kept in the Keychain.
@Observable
final class AuthClient {
    var isWorking = false
    var error: String?
    // True after the server turns down a login, so the Login page can show LoginFailedView.
    var loginFailed = false
    private var session = AuthClient.loadSession()

    var user: AuthUser? { session?.user }

    func register(name: String, email: String, password: String, displayName: String) async {
        await start("register", ["name": name, "email": email, "password": password, "displayName": displayName])
    }

    // login is an email or a username. The server's field is still called email.
    func signIn(login: String, password: String) async {
        await start("login", ["email": login, "password": password])
    }

    // FR-2: Google's sheet gives an ID token, and the server trades it for our own session.
    func signInWithGoogle() async {
        // Google's sheet is UIKit, so it needs a view controller to show over.
        guard let root = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow?.rootViewController else { return }
        error = nil
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
            guard let idToken = result.user.idToken?.tokenString else {
                error = "Google sign in failed"
                return
            }
            await start("google", ["idToken": idToken])
        } catch let googleError as GIDSignInError where googleError.code == .canceled {
            // Closing Google's sheet isn't an error.
        } catch {
            self.error = "Google sign in failed"
        }
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
        // Also forgets the Google account, so the next Google sign in asks which account to use.
        GIDSignIn.sharedInstance.signOut()
        _ = try? await post("logout", ["refreshToken": refreshToken])
    }

    // Calls an /api route as the signed-in player. The access token lasts 15 minutes, so a 401 refreshes once and retries.
    func send(_ method: String, _ path: String, query: [URLQueryItem] = [], body: [String: String]? = nil) async throws -> (status: Int, data: Data) {
        var response = try await authorized(method, path, query, body)
        if response.status == 401 {
            await refresh()
            response = try await authorized(method, path, query, body)
        }
        return response
    }

    // Keeps "Signed in as" on the Join screen in step with the name on the Profile.
    func rename(to displayName: String) {
        guard var next = session, next.user.displayName != displayName else { return }
        next.user.displayName = displayName
        save(next)
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
        } else if path == "login", response.status == 401 {
            // Wrong login or password: the server answers the same for both, so the page can't tell them apart.
            loginFailed = true
        } else {
            // The server's own message, like "Username is already taken".
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

    private func authorized(_ method: String, _ path: String, _ query: [URLQueryItem], _ body: [String: String]?) async throws -> (status: Int, data: Data) {
        // Signed out (or signed out by a failed refresh): answer like the server would.
        guard let accessToken = session?.accessToken else { return (401, Data()) }
        var url = RoomClient.serverURL.appending(path: "api/\(path)")
        if !query.isEmpty { url.append(queryItems: query) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
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
    var user: AuthUser
}

struct AuthUser: Codable {
    let id: String
    let email: String
    var displayName: String
    let emailVerified: Bool
}

// Failed REST routes answer { error }.
struct AuthError: Decodable {
    let error: String
}
