import Testing
@testable import Teraphobia

@MainActor
struct DayOutcomeTests {
    private let seats = PublicSeat.previews // seat0 Gui, seat1 Cameron, seat2 Lili, ...
    private let crown = Trait(option: .crown, slot: .hat)

    private func outcome(_ result: DayResult?, search: YouResult? = nil, you: String = "seat0") -> DayOutcome {
        DayOutcome(result: result, search: search, round: 2, seats: seats, seatID: you)
    }

    private func searched(by seat: String) -> DayResult {
        DayResult(action: .search, blocked: false, round: 2, searcherID: seat, trait: nil)
    }

    @Test func theSearcherSeesTheirClue() {
        let clue = YouResult(action: .search, candleBlocked: nil, round: 2, trait: crown)
        let mine = outcome(searched(by: "seat0"), search: clue)
        #expect(mine.text == "The Monster wears the crown.")
        #expect(mine.trait == crown)
    }

    @Test func everyoneElseSeesWhoSearched() {
        let theirs = outcome(searched(by: "seat2"))
        #expect(theirs.text == "Lili searched the crime scene.")
        #expect(theirs.trait == nil)
    }

    @Test func communeIsPublicForEveryone() {
        let skull = Trait(option: .skullMask, slot: .mask)
        let commune = outcome(DayResult(action: .commune, blocked: false, round: 2, searcherID: nil, trait: skull))
        #expect(commune.text == "The dead whisper: the Monster doesn't wear the skull mask.")
        #expect(commune.trait == skull)
    }

    @Test func candleNeverNamesItsTarget() {
        let candle = outcome(DayResult(action: .candle, blocked: false, round: 2, searcherID: nil, trait: nil))
        #expect(candle.text == "The village lit a candle.")
        #expect(candle.trait == nil)
    }

    @Test func aBlockedActionSaysSo() {
        let blocked = outcome(DayResult(action: .search, blocked: true, round: 2, searcherID: nil, trait: nil))
        #expect(blocked.text == "The Monster blocked today's action.")
        #expect(blocked.trait == nil)
    }

    @Test func noVotesOrNoResultMeansNobodyActed() {
        let none = outcome(DayResult(action: .none, blocked: false, round: 2, searcherID: nil, trait: nil))
        let yesterday = DayOutcome(result: searched(by: "seat2"), search: nil, round: 3, seats: seats, seatID: "seat0")
        #expect(none.text == "Nobody acted today.")
        #expect(outcome(nil).text == "Nobody acted today.")
        #expect(yesterday.text == "Nobody acted today.")
    }
}
