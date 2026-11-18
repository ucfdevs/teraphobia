import SwiftUI

struct JoinView: View {
    private enum Field {
        case roomCode, displayName
    }

    @State private var roomCode = ""
    @State private var displayName = ""
    @State private var client = RoomClient()
    @State private var auth = AuthClient()
    @FocusState private var focusedField: Field?
    @State private var isGuest = false

    var body: some View {
        NavigationStack {
            // Signed out, the app opens on the Login page. Signing out from Profile comes back here too.
            if auth.user == nil && !isGuest {
                SignInView(auth: auth, onGuest: { isGuest = true })
            } else {
                Form {
                    Section {
                        TextField("Room code", text: $roomCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .keyboardType(.asciiCapable)
                            .focused($focusedField, equals: .roomCode)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .displayName }
                            .onChange(of: roomCode) {
                                roomCode = JoinValidation.cleanCode(roomCode)
                            }
                            .accessibilityLabel("Room code")
                            .accessibilityHint("4 letters")

                        TextField("Display name", text: $displayName)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .displayName)
                            .submitLabel(.done)
                            .onChange(of: displayName) {
                                displayName = String(displayName.prefix(JoinValidation.maxNameLength))
                                client.nameError = nil
                            }
                            .accessibilityLabel("Display name")
                            .accessibilityHint("1 to 16 characters")

                        if let nameError = client.nameError {
                            Text(nameError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    } footer: {
                        Text("Ask the host for the 4-letter code on the shared screen.")
                    }

                    Button("Join") {
                        Task {
                            // The access token lasts 15 minutes, so a fresh one is fetched right before joining.
                            await auth.refresh()
                            await client.join(code: roomCode, displayName: displayName.trimmingCharacters(in: .whitespaces), accessToken: auth.accessToken)
                        }
                    }
                    .disabled(!JoinValidation.canJoin(code: roomCode, name: displayName) || client.isJoining)

                    if let roomError = client.roomError {
                        Text(roomError)
                            .foregroundStyle(.red)
                    }

                    NavigationLink(auth.user.map { "Signed in as \($0.displayName)" } ?? "Sign in") {
                        SignInView(auth: auth)
                    }
                }
                .navigationTitle("Teraphobia")
                // Scanning the join QR lands here with the code filled in, so only the name is left to type.
                .onOpenURL { url in
                    if let code = JoinValidation.code(from: url) {
                        roomCode = code
                        focusedField = .displayName
                    }
                }
                .navigationDestination(isPresented: $client.joined) {
                    GameView(client: client)
                }
                // Errors show up without moving focus, so VoiceOver reads them out.
                .onChange(of: client.nameError) {
                    if let nameError = client.nameError {
                        AccessibilityNotification.Announcement(nameError).post()
                    }
                }
                .onChange(of: client.roomError) {
                    if let roomError = client.roomError {
                        AccessibilityNotification.Announcement(roomError).post()
                    }
                }
            }
        }
        .tint(.orange)
        // On the NavigationStack, not the Form, so it runs once at launch and not every time a screen pops back.
        .task { await auth.refresh() }
    }
}

#Preview {
    JoinView()
}
