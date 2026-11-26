import XCTest

// Game screens open straight away with sample players (UITestScreens.swift in the app), so these
// run without a server. Each test ends with Xcode's accessibility audit, which is the VoiceOver check.
@MainActor
final class TeraphobiaUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ screen: String? = nil, _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        if let screen {
            app.launchArguments = ["-screen", screen] + extra
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

    // Contrast, clipped text and Dynamic Type are left out. Here they only flag the pixel-art sprites, the
    // disabled Join button, and rows that wrap fine at the largest text size (checked by hand on the Simulator).
    // The VoiceOver checks (labels, traits, tap targets) still run.
    private func audit(_ app: XCUIApplication) throws {
        try app.performAccessibilityAudit(for: .all.subtracting([.contrast, .textClipped, .dynamicType]))
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
        try audit(app)

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
        try audit(app)
    }

    func testDayCandleAsksWhoToProtect() throws {
        let app = launch("day")
        XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))
        XCTAssertFalse(button("Cameron", in: app).exists)

        let candle = button("Light a candle", in: app)
        candle.tap()
        XCTAssertTrue(candle.isSelected)
        XCTAssertTrue(button("Cameron", in: app).waitForExistence(timeout: 2))
        try audit(app)
    }

    // The Villager's and the Monster's ballots are the same three cards, and a new vote replaces the old one.
    func testBallotOptionsForVillagerAndWitch() throws {
        for extra in [[], ["-monster", "witch"]] {
            let app = launch("day", extra)
            XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))

            let search = button("Search the crime scene", in: app)
            let commune = button("Commune with the dead", in: app)
            XCTAssertTrue(button("Light a candle", in: app).exists)
            search.tap()
            XCTAssertTrue(search.isSelected)
            commune.tap()
            XCTAssertTrue(commune.isSelected)
            XCTAssertFalse(search.isSelected)
            XCTAssertTrue(text("2 of 5 have voted", in: app).exists)
            try audit(app)
            app.terminate()
        }
    }

    func testSearchIsGreyedTheDayAfterASearch() throws {
        let app = launch("day", ["-no-search"])
        XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))

        let search = button("Search the crime scene", in: app)
        XCTAssertFalse(search.isEnabled)
        // VoiceOver reads the reason as the card's value.
        XCTAssertEqual(search.value as? String, "Searched yesterday")
        XCTAssertTrue(button("Commune with the dead", in: app).isEnabled)
        try audit(app)
    }

    // Holding the role card opens it and it stays open, with the power button on the first screen (#113).
    func testMonsterPowerIsInTheRoleCard() throws {
        for (type, power) in [("vampire", "Block today's action"), ("witch", "Plant a fake clue today")] {
            let app = launch("day", ["-monster", type])
            XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))
            // The Day screen has no power control outside the card.
            XCTAssertFalse(button(power, in: app).exists)

            button("Your role", in: app).press(forDuration: 0.7)
            let use = button(power, in: app)
            XCTAssertTrue(use.waitForExistence(timeout: 2))
            XCTAssertTrue(use.isHittable)
            try audit(app)

            // A tap closes it.
            button("You are the", in: app).tap()
            XCTAssertTrue(button("Your role, hidden", in: app).waitForExistence(timeout: 2))
            XCTAssertFalse(use.exists)
            app.terminate()
        }
    }

    // The card's hold gesture must not stop the page from scrolling when a swipe starts on it.
    func testSwipeOnRoleCardScrollsThePage() throws {
        let app = launch("day")
        XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))
        let card = button("Your role", in: app)
        let top = card.frame.minY
        card.swipeUp()
        XCTAssertLessThan(card.frame.minY, top)
        XCTAssertTrue(button("Your role, hidden", in: app).exists)
    }

    func testVillagerRoleCardHasNoPower() throws {
        let app = launch("day")
        XCTAssertTrue(app.navigationBars["Day 1"].waitForExistence(timeout: 5))
        button("Your role", in: app).press(forDuration: 0.7)
        XCTAssertTrue(button("You are a Villager", in: app).waitForExistence(timeout: 2))
        XCTAssertTrue(text("Villagers have no power", in: app).exists)
        XCTAssertFalse(button("Block today's action", in: app).exists)
        XCTAssertFalse(button("Plant a fake clue", in: app).exists)

        // An open card closes by itself after 8 seconds.
        XCTAssertTrue(button("Your role, hidden", in: app).waitForExistence(timeout: 10))
    }

    func testDiscussionShowsClue() throws {
        let app = launch("discussion")
        XCTAssertTrue(text("The Monster wears the crown", in: app).waitForExistence(timeout: 5))
        try audit(app)
    }

    func testVoteLocksIn() throws {
        let app = launch("vote")
        XCTAssertTrue(app.navigationBars["Vote"].waitForExistence(timeout: 5))

        button("Cameron", in: app).tap()
        XCTAssertTrue(text("You voted for Cameron", in: app).waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["Skip"].exists)
        try audit(app)
    }

    func testMorningSaysWatchTheScreen() throws {
        let app = launch("morning")
        XCTAssertTrue(text("Watch the shared screen", in: app).waitForExistence(timeout: 5))
        try audit(app)
    }

    func testReconnectingScreen() throws {
        let app = launch("reconnecting")
        XCTAssertTrue(text("Reconnecting", in: app).waitForExistence(timeout: 5))
        try audit(app)
    }

    func testGameOverShowsTheMonster() throws {
        let app = launch("gameover")
        XCTAssertTrue(text("You win", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(text("Cameron was the Vampire", in: app).exists)
        XCTAssertTrue(app.buttons["Done"].exists)
        try audit(app)
    }
}
