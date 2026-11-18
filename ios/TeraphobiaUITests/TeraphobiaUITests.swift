import XCTest

// Game screens open straight away with sample players (UITestScreens.swift in the app), so these
// run without a server. Each test ends with Xcode's accessibility audit, which is the VoiceOver check.
@MainActor
final class TeraphobiaUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ screen: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        if let screen {
            app.launchArguments = ["-screen", screen]
        }
        app.launch()
        return app
    }

    // Player rows read "name, costume", and a picked action adds to its label, so buttons match on the start.
    private func button(_ start: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", start)).firstMatch
    }

    private func text(_ part: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
    }

    func testJoinNeedsCodeAndName() throws {
        let app = launch()
        // Signed out, the app opens on Login. A Simulator that's still signed in goes straight to Join.
        let guest = app.buttons["Play as guest"]
        if guest.waitForExistence(timeout: 5) {
            guest.tap()
        }

        let join = app.buttons["Join"]
        XCTAssertTrue(join.waitForExistence(timeout: 5))
        XCTAssertFalse(join.isEnabled)
        try app.performAccessibilityAudit()

        let code = app.textFields["Room code"]
        code.tap()
        code.typeText("ab1cd")
        XCTAssertEqual(code.value as? String, "ABCD")

        let name = app.textFields["Display name"]
        name.tap()
        name.typeText("Gui")
        XCTAssertTrue(join.isEnabled)
    }

    func testNightPickIsSelected() throws {
        let app = launch("night")
        XCTAssertTrue(app.navigationBars["Night 1"].waitForExistence(timeout: 5))

        let cameron = button("Cameron", in: app)
        cameron.tap()
        XCTAssertTrue(cameron.isSelected)
        try app.performAccessibilityAudit()
    }

    func testDayCandleAsksWhoToProtect() throws {
        let app = launch("day")
        XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))
        XCTAssertFalse(button("Cameron", in: app).exists)

        let candle = button("Light a candle", in: app)
        candle.tap()
        XCTAssertTrue(candle.isSelected)
        XCTAssertTrue(button("Cameron", in: app).waitForExistence(timeout: 2))
        try app.performAccessibilityAudit()
    }

    func testDiscussionShowsClue() throws {
        let app = launch("discussion")
        XCTAssertTrue(text("The Monster has hat crown", in: app).waitForExistence(timeout: 5))
        try app.performAccessibilityAudit()
    }

    func testVoteLocksIn() throws {
        let app = launch("vote")
        XCTAssertTrue(app.navigationBars["Vote"].waitForExistence(timeout: 5))

        button("Cameron", in: app).tap()
        XCTAssertTrue(text("You voted for Cameron", in: app).waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["Skip"].exists)
        try app.performAccessibilityAudit()
    }

    func testMorningSaysWatchTheScreen() throws {
        let app = launch("morning")
        XCTAssertTrue(text("Watch the shared screen", in: app).waitForExistence(timeout: 5))
        try app.performAccessibilityAudit()
    }

    func testReconnectingScreen() throws {
        let app = launch("reconnecting")
        XCTAssertTrue(text("Reconnecting", in: app).waitForExistence(timeout: 5))
        try app.performAccessibilityAudit()
    }

    func testGameOverShowsTheMonster() throws {
        let app = launch("gameover")
        XCTAssertTrue(text("You win", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(text("Cameron was the Vampire", in: app).exists)
        XCTAssertTrue(app.buttons["Done"].exists)
        try app.performAccessibilityAudit()
    }
}
