import Testing
@testable import Teraphobia

struct JoinValidationTests {
    @Test func codeIsUppercased() {
        #expect(JoinValidation.cleanCode("abcd") == "ABCD")
    }

    @Test func codeKeepsOnlyFourLetters() {
        #expect(JoinValidation.cleanCode("ab1c-de") == "ABCD")
    }

    @Test(arguments: [
        ("ABC", "Gui"),
        ("ABCD", ""),
        ("ABCD", "   "),
        ("ABCD", String(repeating: "a", count: 17)),
    ])
    func joinIsDisabled(code: String, name: String) {
        #expect(!JoinValidation.canJoin(code: code, name: name))
    }

    @Test(arguments: [
        ("ABCD", "Gui"),
        ("ABCD", String(repeating: "a", count: 16)),
    ])
    func joinIsEnabled(code: String, name: String) {
        #expect(JoinValidation.canJoin(code: code, name: name))
    }
}
