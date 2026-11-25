import Testing
@testable import Teraphobia

@MainActor
struct BallotOptionsTests {
    @Test func searchIsOffTheDayAfterASearch() {
        let ballot = BallotOptions(options: DayOptions(commune: true, round: 3, search: false), round: 3)
        #expect(ballot.reason(for: .search) == "Searched yesterday")
        #expect(ballot.reason(for: .commune) == nil)
        #expect(ballot.reason(for: .candle) == nil)
    }

    @Test func communeIsOffWhenNoTraitsAreLeft() {
        let ballot = BallotOptions(options: DayOptions(commune: false, round: 3, search: true), round: 3)
        #expect(ballot.reason(for: .commune) == "No traits left to learn")
        #expect(ballot.reason(for: .search) == nil)
    }

    // day:options comes just before phase:start, so a phone can briefly hold yesterday's. Only today's counts.
    @Test func everythingIsOnWithoutTodaysOptions() {
        let yesterday = BallotOptions(options: DayOptions(commune: false, round: 2, search: false), round: 3)
        let missing = BallotOptions(options: nil, round: 3)
        for ballot in [yesterday, missing] {
            #expect(ballot.reason(for: .search) == nil)
            #expect(ballot.reason(for: .commune) == nil)
        }
    }
}
