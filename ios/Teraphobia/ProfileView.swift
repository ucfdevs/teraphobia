import SwiftUI

// Profile and stats (FR-15, FR-16): the signed-in player's name, avatar, stats, and past games.
struct ProfileView: View {
    // The server's most games per page.
    private static let pageSize = 50

    let auth: AuthClient

    @State private var profile: Profile?
    @State private var games: [PastGame] = []
    @State private var totalGames = 0
    @State private var name = ""
    @State private var error: String?
    @FocusState private var nameFocused: Bool

    var body: some View {
        Form {
            if let profile {
                details(profile)
                stats(profile.stats)
                if !games.isEmpty { history }
            } else if error == nil {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }

            if let error {
                Text(error)
                    .foregroundStyle(.red)
            }

            Button("Sign out", role: .destructive) {
                Task { await auth.signOut() }
            }
        }
        .navigationTitle("Profile")
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func details(_ profile: Profile) -> some View {
        Section {
            // Picking an icon saves it right away, like a Settings row.
            Picker("Avatar", selection: Binding(get: { profile.avatar },
                                                set: { avatar in Task { await save(["avatarId": avatar.rawValue]) } })) {
                ForEach(Avatar.allCases) { avatar in
                    Label(avatar.name, systemImage: avatar.symbol)
                        .tag(avatar)
                }
            }
            .pickerStyle(.navigationLink)

            LabeledContent("Username") {
                TextField("Username", text: $name)
                    .multilineTextAlignment(.trailing)
                    .textContentType(.nickname)
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onChange(of: name) {
                        name = String(name.prefix(AuthValidation.maxNameLength))
                    }
            }
            // Return and tapping away both end editing, so this saves once either way.
            .onChange(of: nameFocused) {
                if !nameFocused { saveName() }
            }

            LabeledContent("Email", value: profile.email)
            LabeledContent("Sign-in method", value: profile.signInMethod)
        } header: {
            Image(systemName: profile.avatar.symbol)
                .font(.system(size: 56))
                .foregroundStyle(.tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical)
                // The Avatar row already says which icon it is.
                .accessibilityHidden(true)
        } footer: {
            if !profile.emailVerified {
                Text("Check your email for the link to verify your account.")
            }
        }
    }

    private func stats(_ stats: Profile.Stats) -> some View {
        Section("Stats") {
            if stats.gamesPlayed == 0 {
                Text("No games yet")
                    .foregroundStyle(.secondary)
            } else {
                // Each LabeledContent is one VoiceOver element, so a number is never read without its label.
                LabeledContent("Games played", value: stats.gamesPlayed, format: .number)
                LabeledContent("Villager wins", value: stats.villagerWins, format: .number)
                LabeledContent("Vampire wins", value: stats.monsterWins.vampire, format: .number)
                LabeledContent("Witch wins", value: stats.monsterWins.witch, format: .number)
                LabeledContent("Werewolf wins", value: stats.monsterWins.werewolf, format: .number)
            }
        }
    }

    private var history: some View {
        Section("History") {
            ForEach(games) { game in
                PastGameRow(game: game)
            }
            if games.count < totalGames {
                Button("Show more") {
                    Task { await loadGames(page: games.count / Self.pageSize + 1) }
                }
            }
        }
    }

    // One after the other on purpose: if the access token expired, the first call refreshes it,
    // and two refreshes at once would both spend the same one-use refresh token.
    private func load() async {
        error = nil
        guard let profile = decode(Profile.self, try? await auth.send("GET", "users/me")) else { return }
        show(profile)
        await loadGames(page: 1)
    }

    private func loadGames(page: Int) async {
        let query = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "limit", value: String(Self.pageSize))]
        guard let result = decode(GamesPage.self, try? await auth.send("GET", "users/me/games", query: query)) else { return }
        games = page == 1 ? result.games : games + result.games
        totalGames = result.total
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard let profile, trimmed != profile.displayName else { return }
        // An empty name still goes to the server, which answers with its own message.
        Task { await save(["displayName": trimmed]) }
    }

    // PATCH answers with the whole updated profile.
    private func save(_ change: [String: String]) async {
        error = nil
        if let updated = decode(Profile.self, try? await auth.send("PATCH", "users/me", body: change)) {
            show(updated)
        }
    }

    private func show(_ profile: Profile) {
        self.profile = profile
        name = profile.displayName
        // Also picks up a name changed on the web.
        auth.rename(to: profile.displayName)
    }

    // The decoded answer, or nil after showing why it failed.
    private func decode<T: Decodable>(_ type: T.Type, _ response: (status: Int, data: Data)?) -> T? {
        guard let response else {
            error = "Can't reach the server"
            return nil
        }
        if response.status < 300, let value = try? JSONDecoder.server.decode(T.self, from: response.data) {
            return value
        }
        error = (try? JSONDecoder().decode(AuthError.self, from: response.data))?.error ?? "Something went wrong"
        return nil
    }
}

// One past game (FR-16): how it went for this player, the Monster, who won, who played, and when.
private struct PastGameRow: View {
    let game: PastGame

    private var monster: String { game.monsterType.rawValue.capitalized }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(game.won ? "Won" : "Lost") as \(game.role == .monster ? monster : "Villager")")
                    .font(.headline)
                Spacer()
                Text(game.endedAt, format: .dateTime.month().day().year())
                    .foregroundStyle(.secondary)
            }
            Text(game.winner == .monster ? "The \(monster) won" : "The village won")
            Text(game.players.joined(separator: ", "))
                .foregroundStyle(.secondary)
        }
        .font(.subheadline)
        // VoiceOver reads the whole game as one row.
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack {
        ProfileView(auth: AuthClient())
    }
}
