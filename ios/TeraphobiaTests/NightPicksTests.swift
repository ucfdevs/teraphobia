import Testing
@testable import Teraphobia

@MainActor
struct NightPicksTests {
    private func you(_ role: Role, _ type: MonsterType? = nil) -> YouRole {
        YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: type, role: role, seatID: "me")
    }

    @Test func villagerHunchNamesTheTappedPlayer() {
        let picks = NightPicks(you: you(.villager), round: 1, powerUsed: false).tapping("cameron")
        #expect(picks.submit == NightSubmit(victimIDS: nil, suspectID: "cameron"))
    }

    @Test func monsterTapPicksOneVictimAndChangesWithTheNextTap() {
        let picks = NightPicks(you: you(.monster, .vampire), round: 2, powerUsed: false)
            .tapping("cameron").tapping("lili")
        #expect(picks.submit == NightSubmit(victimIDS: ["lili"], suspectID: nil))
    }

    @Test func werewolfWithPowerAfterNightOnePicksTwo() {
        let picks = NightPicks(you: you(.monster, .werewolf), round: 2, powerUsed: false)
            .tapping("cameron").tapping("lili")
        #expect(picks.maxPicks == 2)
        #expect(picks.submit == NightSubmit(victimIDS: ["cameron", "lili"], suspectID: nil))
    }

    @Test func werewolfThirdPickDropsTheOldest() {
        let picks = NightPicks(you: you(.monster, .werewolf), round: 2, powerUsed: false)
            .tapping("cameron").tapping("lili").tapping("teresa")
        #expect(picks.picked == ["lili", "teresa"])
    }

    // A pick can't be taken back on the server, so the last one stays.
    @Test func werewolfUntapsOneOfTwoButKeepsTheLast() {
        let start = NightPicks(you: you(.monster, .werewolf), round: 2, powerUsed: false)
        #expect(start.tapping("cameron").tapping("lili").tapping("cameron").picked == ["lili"])
        #expect(start.tapping("cameron").tapping("cameron").picked == ["cameron"])
    }

    @Test(arguments: [(1, false), (2, true)])
    func werewolfPicksOneOnNightOneOrAfterUsingPower(round: Int, powerUsed: Bool) {
        let picks = NightPicks(you: you(.monster, .werewolf), round: round, powerUsed: powerUsed)
        #expect(picks.maxPicks == 1)
    }
}
