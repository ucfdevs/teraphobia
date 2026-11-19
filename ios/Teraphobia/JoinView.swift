import Foundation
import SwiftUI
import UIKit

struct JoinView: View {
    @State private var roomCode = ""
    @State private var displayName = ""
    @State private var client = RoomClient()
    @State private var auth = AuthClient()
    @FocusState private var nameFocused: Bool
    @State private var codeEditing = false
    @State private var isGuest = false

    var body: some View {
        NavigationStack {
            // Signed out, the app opens on the Login page. Signing out from Profile comes back here too.
            if auth.user == nil && !isGuest {
                SignInView(auth: auth, onGuest: { isGuest = true })
            } else {
                ScrollView {
                    joinForm
                        .padding(.horizontal, Theme.gutter)
                        .padding(.top, 8)
                        .padding(.bottom, 32)
                }
                .scrollDismissesKeyboard(.interactively)
                .gameBackground(.plain)
                .navigationTitle("Teraphobia")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(.hidden, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        MuteButton()
                    }
                }
                // Scanning the join QR lands here with the code filled in, so only the name is left to type.
                .onOpenURL { url in
                    if let code = JoinValidation.code(from: url) {
                        roomCode = code
                        nameFocused = true
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
        // On the NavigationStack, not the Join content, so it runs once at launch and not every time a screen pops back.
        .task { await auth.refresh() }
    }

    private var joinForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            AccountTitle(text: "Teraphobia")

            StrangerSays(text: "A new face in the village... Tell me the code on the big screen and what we should call you.")

            VStack(alignment: .leading, spacing: 8) {
                fieldTitle("Room code")
                RoomCodeField(code: $roomCode, isEditing: $codeEditing) { nameFocused = true }
                    .accountField(focused: codeEditing)
                Text("Ask the host for the 4-letter code on the shared screen.")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedText)
            }

            VStack(alignment: .leading, spacing: 8) {
                fieldTitle("Display name")
                TextField("Your name", text: $displayName)
                    .autocorrectionDisabled()
                    .focused($nameFocused)
                    .submitLabel(.done)
                    .onChange(of: displayName) {
                        displayName = String(displayName.prefix(JoinValidation.maxNameLength))
                        client.nameError = nil
                    }
                    .accountField(focused: nameFocused)
                    .accessibilityLabel("Display name")
                    .accessibilityHint("1 to 16 characters")

                if let nameError = client.nameError {
                    AccountError(text: nameError)
                }
            }

            if let roomError = client.roomError {
                AccountError(text: roomError)
            }

            Button("Join") {
                Task {
                    // The access token lasts 15 minutes, so a fresh one is fetched right before joining.
                    await auth.refresh()
                    await client.join(code: roomCode, displayName: displayName.trimmingCharacters(in: .whitespaces), accessToken: auth.accessToken)
                }
            }
            .buttonStyle(.candle)
            .disabled(!JoinValidation.canJoin(code: roomCode, name: displayName) || client.isJoining)
            .padding(.top, 4)

            NavigationLink(auth.user.map { "Signed in as \($0.displayName)" } ?? "Sign in") {
                SignInView(auth: auth)
            }
            .buttonStyle(.quiet)
        }
    }

    // The visible name over a field. The field carries the same words as its own label, so VoiceOver skips this.
    private func fieldTitle(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.mutedText)
            .accessibilityHidden(true)
    }
}

// The room code field. UIKit, because SwiftUI's TextField doesn't reliably redraw a value its binding changed
// while the field is being typed in: cleaning the code in onChange left "ABCd" on screen during fast typing,
// and cleaning it in a Binding setter left "ab1cd". Here each keystroke is filtered before it lands, so the field only ever
// holds up to 4 capital letters.
private struct RoomCodeField: UIViewRepresentable {
    @Binding var code: String
    @Binding var isEditing: Bool
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextField {
        let field = UITextField()
        field.delegate = context.coordinator
        // SF Mono, bold, at the title 2 size, growing with Dynamic Type.
        let base = UIFont.monospacedSystemFont(ofSize: 22, weight: .bold)
        let font = UIFontMetrics(forTextStyle: .title2).scaledFont(for: base)
        field.adjustsFontForContentSizeCategory = true
        field.defaultTextAttributes = [.font: font, .foregroundColor: UIColor(Theme.text), .kern: 6]
        // Not "ABCD" as the placeholder: an empty field reports its placeholder as its value.
        field.attributedPlaceholder = NSAttributedString(string: "4 letters",
                                                         attributes: [.font: UIFont.preferredFont(forTextStyle: .body),
                                                                      .foregroundColor: UIColor(Theme.mutedText)])
        field.tintColor = UIColor(Theme.candle)
        field.autocapitalizationType = .allCharacters
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.smartInsertDeleteType = .no
        field.keyboardType = .asciiCapable
        field.returnKeyType = .next
        field.accessibilityLabel = "Room code"
        field.accessibilityHint = "4 letters"
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return field
    }

    func updateUIView(_ field: UITextField, context: Context) {
        context.coordinator.parent = self
        // A code from the join QR arrives through the binding.
        if field.text != code { field.text = code }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: RoomCodeField

        init(_ parent: RoomCodeField) { self.parent = parent }

        func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
            let current = textField.text ?? ""
            guard let range = Range(range, in: current) else { return false }
            let cleaned = JoinValidation.cleanCode(current.replacingCharacters(in: range, with: string))
            textField.text = cleaned
            parent.code = cleaned
            return false
        }

        func textFieldDidBeginEditing(_ textField: UITextField) { parent.isEditing = true }
        func textFieldDidEndEditing(_ textField: UITextField) { parent.isEditing = false }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            parent.onSubmit()
            return false
        }
    }
}

#Preview {
    JoinView()
}
