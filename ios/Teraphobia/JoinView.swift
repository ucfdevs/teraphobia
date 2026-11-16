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

    var body: some View {
        NavigationStack {
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
                        await client.join(code: roomCode, displayName: displayName.trimmingCharacters(in: .whitespaces))
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
            .navigationDestination(isPresented: $client.joined) {
                GameView(client: client)
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
