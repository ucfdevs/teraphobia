import Foundation
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                AccountTitle(text: "Profile")

                if let profile {
                    header(profile)
                    details(profile)
                    stats(profile.stats)
                    if !games.isEmpty { history }
                } else if error == nil {
                    ProgressView()
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                }

                if let error {
                    AccountError(text: error)
                }

                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                .buttonStyle(.quiet)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .gameBackground(.plain)
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task { await load() }
        .refreshable { await load() }
    }

    // The avatar big, the name under it, and the four avatars to pick from.
    private func header(_ profile: Profile) -> some View {
        VStack(spacing: 16) {
            Image(systemName: profile.avatar.symbol)
                .font(.system(size: 52))
                .foregroundStyle(Theme.text)
                .frame(width: 112, height: 112)
                .background(Theme.blood.opacity(0.85), in: Circle())
                .overlay(Circle().strokeBorder(Theme.border, lineWidth: Theme.borderWidth))
                .shadow(color: Theme.blood.opacity(0.5), radius: 18)
                .contentTransition(.symbolEffect(.replace))
                // The avatar buttons below already say which icon it is.
                .accessibilityHidden(true)

            Text(profile.displayName)
                .font(.display(.title))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .accessibilityAddTraits(.isHeader)

            avatarPicker(profile)
        }
        .frame(maxWidth: .infinity)
    }

    // Picking an icon saves it right away, like a Settings row.
    private func avatarPicker(_ profile: Profile) -> some View {
        HStack(spacing: 10) {
            ForEach(Avatar.allCases) { avatar in
                let selected = avatar == profile.avatar
                Button {
                    guard !selected else { return }
                    Task { await save(["avatarId": avatar.rawValue]) }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: avatar.symbol)
                            .font(.title3)
                        Text(avatar.name)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(selected ? Theme.candle : Theme.text)
                    .frame(maxWidth: .infinity, minHeight: 64)
                    .surface(.control, selected: selected, interactive: true)
                    .overlay(alignment: .topTrailing) {
                        if selected {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(Theme.onCandle, Theme.candle)
                                .padding(4)
                                .transition(.scale.combined(with: .opacity))
                                // The Selected trait already says this.
                                .accessibilityHidden(true)
                        }
                    }
                    // With Reduce Motion the badge just appears, with no bounce.
                    .animation(reduceMotion ? nil : .spring(duration: 0.25, bounce: 0.4), value: selected)
                }
                .buttonStyle(CardPressStyle())
                .sensoryFeedback(.selection, trigger: selected)
                .accessibilityLabel("Avatar, \(avatar.name)")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func details(_ profile: Profile) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Username")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.mutedText)
                    .accessibilityHidden(true)
                TextField("Username", text: $name)
                    .textContentType(.nickname)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onChange(of: name) {
                        name = String(name.prefix(AuthValidation.maxNameLength))
                    }
                    .accountField(focused: nameFocused)
                    .accessibilityLabel("Username")
                    // Return and tapping away both end editing, so this saves once either way.
                    .onChange(of: nameFocused) {
                        if !nameFocused { saveName() }
                    }
            }

            VStack(spacing: 0) {
                InfoRow(label: "Email", value: profile.email)
                Divider().overlay(Theme.border)
                InfoRow(label: "Sign-in method", value: profile.signInMethod)
            }
            .padding(.horizontal, 14)
            .surface(.card)

            if !profile.emailVerified {
                Text("Check your email for the link to verify your account.")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedText)
            }

            // Google-only accounts have no password to change.
            if profile.signInMethods.contains("password") {
                NavigationLink("Change password") {
                    ChangePasswordView(auth: auth)
                }
                .buttonStyle(.quiet)
            }
        }
    }

    private func stats(_ stats: Profile.Stats) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading("Stats")
            if stats.gamesPlayed == 0 {
                StrangerSays(text: "No games yet. Join a room and see if you make it to morning.")
            } else {
                // Each row is one VoiceOver element, so a number is never read without its label.
                VStack(spacing: 0) {
                    StatRow(label: "Games played", value: stats.gamesPlayed)
                    Divider().overlay(Theme.border)
                    StatRow(label: "Villager wins", value: stats.villagerWins)
                    Divider().overlay(Theme.border)
                    StatRow(label: "Vampire wins", value: stats.monsterWins.vampire)
                    Divider().overlay(Theme.border)
                    StatRow(label: "Witch wins", value: stats.monsterWins.witch)
                    Divider().overlay(Theme.border)
                    StatRow(label: "Werewolf wins", value: stats.monsterWins.werewolf)
                }
                .padding(.horizontal, 14)
                .surface(.card)
            }
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading("History")
            GlassGroup {
                VStack(spacing: 12) {
                    ForEach(games) { game in
                        PastGameRow(game: game)
                    }
                }
            }
            if games.count < totalGames {
                Button("Show more") {
                    Task { await loadGames(page: games.count / Self.pageSize + 1) }
                }
                .buttonStyle(.quiet)
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

// A label and a value on one line, read as one element.
private struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        LabeledContent(label) {
            Text(value)
                .foregroundStyle(Theme.mutedText)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .foregroundStyle(Theme.text)
        .frame(minHeight: 48)
        .accessibilityElement(children: .combine)
    }
}

// A stat with its number in SF Mono, read as one element.
private struct StatRow: View {
    let label: String
    let value: Int

    var body: some View {
        LabeledContent(label) {
            Text(value, format: .number)
                .font(.numbers(.body))
                .foregroundStyle(Theme.text)
        }
        .foregroundStyle(Theme.text)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

// One past game (FR-16): how it went for this player, the Monster, who won, who played, and when.
private struct PastGameRow: View {
    let game: PastGame

    private var monster: String { game.monsterType.rawValue.capitalized }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(game.won ? "Won" : "Lost") as \(game.role == .monster ? monster : "Villager")")
                    .font(.display(.headline))
                    .foregroundStyle(Theme.text)
                Spacer()
                Text(game.endedAt, format: .dateTime.month().day().year())
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedText)
            }
            Text(game.winner == .monster ? "The \(monster) won" : "The village won")
                .foregroundStyle(Theme.text)
            Text(game.players.joined(separator: ", "))
                .foregroundStyle(Theme.mutedText)
        }
        .font(.subheadline)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        // A blood red edge for the games this player lost.
        .overlay(alignment: .leading) {
            if !game.won {
                Capsule()
                    .fill(Theme.blood)
                    .frame(width: 4)
                    .padding(.vertical, 14)
                    .padding(.leading, 4)
            }
        }
        .surface(.card)
        // VoiceOver reads the whole game as one row.
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack {
        ProfileView(auth: AuthClient())
    }
    .preferredColorScheme(.dark)
}
