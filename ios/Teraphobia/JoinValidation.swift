import Foundation

nonisolated enum JoinValidation {
    static let codeLength = 4
    static let maxNameLength = 16

    // Keeps only A-Z, uppercased, and stops at 4 letters.
    static func cleanCode(_ text: String) -> String {
        let letters = text.uppercased().filter { $0.isASCII && $0.isLetter }
        return String(letters.prefix(codeLength))
    }

    static func isValidCode(_ code: String) -> Bool {
        code.count == codeLength && cleanCode(code) == code
    }

    // Spaces alone don't count as a name.
    static func isValidName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed.count <= maxNameLength
    }

    static func canJoin(code: String, name: String) -> Bool {
        isValidCode(code) && isValidName(name)
    }
}
