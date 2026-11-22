import Foundation
import SwiftUI

// Sign in and Register (FR-1). Signing in is optional; it lets a player keep stats and history.
struct SignInView: View {
    private enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case register = "Register"

        // The Stranger's greeting for each mode.
        var greeting: String {
            switch self {
            case .signIn: "Back again? The village remembers every face."
            case .register: "Sign the village ledger and I'll keep count of every night you survive."
            }
        }
    }

    private enum Field {
        case fullName, displayName, email, password
    }

    // @Bindable so $auth.loginFailed can open the Login failed page.
    @Bindable var auth: AuthClient
    // Set only when this is the first screen, so a guest can skip signing in.
    var onGuest: (() -> Void)? = nil

    @State private var mode = Mode.signIn
    @State private var displayName = ""
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Forgot password opens the web page (#39). In the Simulator the web app runs on this Mac on Vite's port.
    #if targetEnvironment(simulator)
    private static let forgotPasswordURL = URL(string: "http://localhost:5173/forgot-password")!
    #else
    private static let forgotPasswordURL = URL(string: "https://teraphobia.com/forgot-password")!
    #endif

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespaces)
    }

    private var canSubmit: Bool {
        switch mode {
        case .signIn: AuthValidation.canSignIn(login: trimmedEmail, password: password)
        case .register: AuthValidation.canRegister(email: trimmedEmail, password: password, name: displayName)
            && !fullName.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    var body: some View {
        // Once signed in, this screen becomes the Profile (#40).
        if auth.user != nil {
            ProfileView(auth: auth)
        } else {
            ScrollView {
                signInForm
                    .padding(.horizontal, Theme.gutter)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .gameBackground(.plain)
            // The bar keeps the screen name for VoiceOver; the big Bricolage heading is in the content.
            .navigationTitle(mode.rawValue)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $auth.loginFailed) {
                LoginFailedView()
            }
            // Errors show up without moving focus, so VoiceOver reads them out.
            .onChange(of: auth.error) {
                if let error = auth.error {
                    AccessibilityNotification.Announcement(error).post()
                }
            }
        }
    }

    private var signInForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            AccountTitle(text: mode.rawValue)

            StrangerSays(text: mode.greeting)

            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .onChange(of: mode) { auth.error = nil }

            VStack(spacing: 12) {
                if mode == .register {
                    TextField("Name", text: $fullName)
                        .textContentType(.name)
                        .focused($focusedField, equals: .fullName)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .displayName }
                        .accountField(focused: focusedField == .fullName)

                    // The display name is the username: unique, and it works for signing in.
                    TextField("Username", text: $displayName)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .displayName)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .email }
                        .onChange(of: displayName) {
                            displayName = String(displayName.prefix(AuthValidation.maxNameLength))
                        }
                        .accountField(focused: focusedField == .displayName)
                }

                // Sign in takes either one in the same field; the server tells them apart by the @.
                TextField(mode == .register ? "Email" : "Email or username", text: $email)
                    .textContentType(mode == .register ? .emailAddress : .username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .accountField(focused: focusedField == .email)

                SecureField("Password", text: $password)
                    // .newPassword lets iOS suggest a strong password and save it to Passwords.
                    .textContentType(mode == .register ? .newPassword : .password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
                    .accountField(focused: focusedField == .password)
            }

            // The password rule shows until it's met (FR-1).
            if mode == .register, let problem = AuthValidation.passwordError(password) {
                Text(problem)
                    .font(.footnote)
                    .foregroundStyle(Theme.mutedText)
            }

            if let error = auth.error {
                AccountError(text: error)
            }

            Button(mode.rawValue, action: submit)
                .buttonStyle(.candle)
                .disabled(!canSubmit || auth.isWorking)
                .padding(.top, 4)

            if mode == .signIn {
                Link("Forgot password?", destination: Self.forgotPasswordURL)
                    .buttonStyle(.quiet)
            }

            // One button for both modes: the server creates the account on the first Google sign in.
            Button("Sign in with Google") {
                Task { await auth.signInWithGoogle() }
            }
            .buttonStyle(.quiet)
            .disabled(auth.isWorking)

            if let onGuest {
                Button("Play as guest", action: onGuest)
                    .buttonStyle(.quiet)
            }
        }
        // The Register fields slide in; with Reduce Motion they just appear.
        .animation(reduceMotion ? nil : .default, value: mode)
    }

    private func submit() {
        guard canSubmit, !auth.isWorking else { return }
        Task {
            switch mode {
            case .signIn:
                await auth.signIn(login: trimmedEmail, password: password)
            case .register:
                await auth.register(name: fullName.trimmingCharacters(in: .whitespaces),
                                    email: trimmedEmail, password: password,
                                    displayName: displayName.trimmingCharacters(in: .whitespaces))
            }
            // Cleared once signed in, so the password doesn't stay in memory.
            if auth.user != nil { password = "" }
        }
    }
}

// The big heading at the top of an account screen, in Bricolage. The navigation bar's large title can't
// take a custom font on every iOS version, so account screens use an inline bar title and this heading.
struct AccountTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.display(.largeTitle))
            .foregroundStyle(Theme.text)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

// An error on an account screen, in plain words. The red is in the icon and the card's tint; the text
// stays light, since red text on navy is hard to read.
struct AccountError: View {
    let text: String

    var body: some View {
        Label {
            Text(text)
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.text, Theme.blood)
        }
        .font(.callout)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surface(.card, tint: Theme.blood.opacity(0.35))
    }
}

extension View {
    // A text field on an account screen: a navy control at least 50pt tall, with an orange border while typing.
    func accountField(focused: Bool) -> some View {
        self
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .surface(.control, selected: focused)
            .animation(.easeOut(duration: 0.15), value: focused)
    }
}

#Preview {
    NavigationStack {
        SignInView(auth: AuthClient(), onGuest: {})
    }
    .preferredColorScheme(.dark)
}
