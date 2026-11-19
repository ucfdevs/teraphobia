import Testing
@testable import Teraphobia

@MainActor
struct ClueTextTests {
    @Test func searchNamesATraitTheMonsterWears() {
        let result = YouResult(action: .search, candleBlocked: nil, round: 2, trait: Trait(option: .hornedHelmet, slot: .hat))
        #expect(ClueText(result: result, round: 2).text == "The Monster wears the horned helmet.")
    }

    @Test func searchNamesAnItemTheMonsterCarries() {
        let result = YouResult(action: .search, candleBlocked: nil, round: 2, trait: Trait(option: .raven, slot: .item))
        #expect(ClueText(result: result, round: 2).text == "The Monster carries the raven.")
    }

    @Test func communeNamesATraitTheMonsterLacks() {
        let mask = YouResult(action: .commune, candleBlocked: nil, round: 2, trait: Trait(option: .skullMask, slot: .mask))
        let item = YouResult(action: .commune, candleBlocked: nil, round: 2, trait: Trait(option: .umbrella, slot: .item))
        #expect(ClueText(result: mask, round: 2).text == "The dead whisper: the Monster doesn't wear the skull mask.")
        #expect(ClueText(result: item, round: 2).text == "The dead whisper: the Monster doesn't carry the umbrella.")
    }

    // Exact PRD wording: a blocked or capped result must read the same as a real empty one (FR-11).
    @Test(arguments: [
        (DayAction.search, nil as Bool?, "You found nothing."),
        (.commune, nil, "The dead are silent."),
        (.candle, false, "Your candle burns for tonight."),
        (.candle, true, "The Monster blocked your candle."),
    ])
    func resultsWithoutATrait(action: DayAction, blocked: Bool?, expected: String) {
        let result = YouResult(action: action, candleBlocked: blocked, round: 2, trait: nil)
        #expect(ClueText(result: result, round: 2).text == expected)
    }

    @Test func noResultOrLastRoundsResultMeansNoActionToday() {
        let old = YouResult(action: .search, candleBlocked: nil, round: 1, trait: Trait(option: .crown, slot: .hat))
        #expect(ClueText(result: nil, round: 2).text == "You didn't pick an action today.")
        #expect(ClueText(result: old, round: 2).text == "You didn't pick an action today.")
    }
}
