import Testing
@testable import Teraphobia

struct AuthValidationTests {
    @Test(arguments: ["gui@ucf.edu", "a@b.co"])
    func emailIsValid(email: String) {
        #expect(AuthValidation.isValidEmail(email))
    }

    @Test(arguments: ["", "gui", "gui@ucf", "gui @ucf.edu", "@ucf.edu"])
    func emailIsInvalid(email: String) {
        #expect(!AuthValidation.isValidEmail(email))
    }

    @Test func shortPasswordIsRefused() {
        #expect(AuthValidation.passwordError("1234567") == "Password must be at least 8 characters")
    }

    @Test func longPasswordIsRefused() {
        #expect(AuthValidation.passwordError(String(repeating: "a", count: 73)) == "Password must be at most 72 bytes")
    }

    @Test func goodPasswordPasses() {
        #expect(AuthValidation.passwordError("12345678") == nil)
    }

    @Test(arguments: ["", "   ", String(repeating: "a", count: 33)])
    func registerNeedsAName(name: String) {
        #expect(!AuthValidation.canRegister(email: "gui@ucf.edu", password: "12345678", name: name))
    }
}
