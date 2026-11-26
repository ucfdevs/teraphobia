import Testing
@testable import Teraphobia

@MainActor
struct ScreenLookTests {
    private func you(_ role: Role, _ type: MonsterType? = nil) -> YouRole {
        YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: type, role: role, seatID: "me")
    }

    @Test func monsterChoosingAVictimGetsItsTypesLook() {
        #expect(ScreenLook(you: you(.monster, .vampire), moment: .choosingVictim) == .monster(.vampire))
    }

    // Phones get seen during Day, Discussion and Vote, so the Monster's looks like everyone else's.
    @Test(arguments: [ScreenMoment.dayActions, .discussion, .vote, .watchingSharedScreen])
    func monsterLooksNeutralWhenPhonesGetSeen(moment: ScreenMoment) {
        #expect(ScreenLook(you: you(.monster, .witch), moment: moment) == .neutral)
    }

    @Test(arguments: [ScreenMoment.choosingVictim, .roleCardFace, .dayActions])
    func villagerIsAlwaysNeutral(moment: ScreenMoment) {
        #expect(ScreenLook(you: you(.villager), moment: moment) == .neutral)
    }

    @Test func roleCardFaceGetsTheLook() {
        #expect(ScreenLook(you: you(.monster, .werewolf), moment: .roleCardFace) == .monster(.werewolf))
    }
}
