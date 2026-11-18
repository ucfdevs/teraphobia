import SwiftUI

// Sign in and Register (FR-1). Signing in is optional; it lets a player keep stats and history.
struct SignInView: View {
    private enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case register = "Register"
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
            Form { signInForm }
                .navigationTitle(mode.rawValue)
                .navigationDestination(isPresented: $auth.loginFailed) {
                    LoginFailedView()
                }
        }
    }

    @ViewBuilder
    private var signInForm: some View {
        Picker("Mode", selection: $mode) {
            ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
        }
        .pickerStyle(.segmented)
        .listRowBackground(Color.clear)
        .onChange(of: mode) { auth.error = nil }

        Section {
            if mode == .register {
                TextField("Name", text: $fullName)
                    .textContentType(.name)
                    .focused($focusedField, equals: .fullName)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .displayName }

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

            SecureField("Password", text: $password)
                // .newPassword lets iOS suggest a strong password and save it to Passwords.
                .textContentType(mode == .register ? .newPassword : .password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit(submit)
        } footer: {
            // The password rule shows until it's met (FR-1).
            if mode == .register, let problem = AuthValidation.passwordError(password) {
                Text(problem)
            }
        }

        Button(mode.rawValue, action: submit)
            .disabled(!canSubmit || auth.isWorking)

        // One button for both modes: the server creates the account on the first Google sign in.
        Button("Sign in with Google") {
            Task { await auth.signInWithGoogle() }
        }
        .disabled(auth.isWorking)

        if let error = auth.error {
            Text(error)
                .foregroundStyle(.red)
        }

        if let onGuest {
            Button("Play as guest", action: onGuest)
                .foregroundStyle(.secondary)
        }
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

#Preview {
    NavigationStack {
        SignInView(auth: AuthClient())
    }
}
