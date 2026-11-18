import Foundation

// The server's account rules (server/src/lib/validation.ts), checked here so they show before submitting.
nonisolated enum AuthValidation {
    static let maxNameLength = 32

    // Same pattern as the server's EMAIL_PATTERN. #/ /# is a regex literal that works in the Swift 5 language mode.
    static func isValidEmail(_ email: String) -> Bool {
        email.wholeMatch(of: #/[^\s@]+@[^\s@]+\.[^\s@]+/#) != nil
    }

    // The message to show, or nil when the password is fine.
    static func passwordError(_ password: String) -> String? {
        if password.count < 8 { return "Password must be at least 8 characters" }
        // bcrypt ignores everything past 72 bytes, so the server refuses longer ones.
        if password.utf8.count > 72 { return "Password must be at most 72 bytes" }
        return nil
    }

    static func isValidName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed.count <= maxNameLength
    }

    // Sign in takes an email or a username, so only "not empty" can be checked here.
    static func canSignIn(login: String, password: String) -> Bool {
        !login.isEmpty && !password.isEmpty
    }

    static func canRegister(email: String, password: String, name: String) -> Bool {
        isValidEmail(email) && passwordError(password) == nil && isValidName(name)
    }
}
