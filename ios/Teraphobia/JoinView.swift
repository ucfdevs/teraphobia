import SwiftUI

struct JoinView: View {
    private enum Field {
        case roomCode, displayName
    }

    @State private var roomCode = ""
    @State private var displayName = ""
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
                        }
                        .accessibilityLabel("Display name")
                        .accessibilityHint("1 to 16 characters")
                } footer: {
                    Text("Ask the host for the 4-letter code on the shared screen.")
                }

                Button("Join") {
                    // Wired to GET /rooms/:code in a later issue
                }
                .disabled(!JoinValidation.canJoin(code: roomCode, name: displayName))

                NavigationLink("Sign in") {
                    SignInView()
                }
            }
            .navigationTitle("Teraphobia")
        }
        .tint(.orange)
    }
}

#Preview {
    JoinView()
}
