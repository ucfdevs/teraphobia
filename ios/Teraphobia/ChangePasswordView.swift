import SwiftUI

// Change password (FR-3). Only for accounts with a password; it signs out every other device.
struct ChangePasswordView: View {
    private enum Field {
        case current, new
    }

    let auth: AuthClient

    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var error: String?
    @State private var isWorking = false
    @FocusState private var focusedField: Field?

    private var canSubmit: Bool {
        !currentPassword.isEmpty && AuthValidation.passwordError(newPassword) == nil && !isWorking
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                AccountTitle(text: "Change password")

                VStack(spacing: 12) {
                    SecureField("Current password", text: $currentPassword)
                        .textContentType(.password)
                        .focused($focusedField, equals: .current)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .new }
                        .accountField(focused: focusedField == .current)

                    SecureField("New password", text: $newPassword)
                        .textContentType(.newPassword)
                        .focused($focusedField, equals: .new)
                        .submitLabel(.done)
                        .onSubmit(submit)
                        .accountField(focused: focusedField == .new)
                }

                // Same rule as Register, shown until it's met.
                Text(AuthValidation.passwordError(newPassword) ?? "Other devices signed in to this account will be signed out.")
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedText)

                if let error {
                    AccountError(text: error)
                }

                Button("Change password", action: submit)
                    .buttonStyle(.candle)
                    .disabled(!canSubmit)
                    .padding(.top, 4)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .gameBackground(.plain)
        .navigationTitle("Change password")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        // Errors show up without moving focus, so VoiceOver reads them out.
        .onChange(of: error) {
            if let error {
                AccessibilityNotification.Announcement(error).post()
            }
        }
    }

    private func submit() {
        guard canSubmit else { return }
        isWorking = true
        Task {
            error = await auth.changePassword(current: currentPassword, new: newPassword)
            isWorking = false
            // Back to the Profile once it worked.
            if error == nil { dismiss() }
        }
    }
}

#Preview {
    NavigationStack {
        ChangePasswordView(auth: AuthClient())
    }
    .preferredColorScheme(.dark)
}
