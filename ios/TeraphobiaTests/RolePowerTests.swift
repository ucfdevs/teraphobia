import Testing
@testable import Teraphobia

@MainActor
struct RolePowerTests {
    private func you(_ type: MonsterType?) -> YouRole {
        YouRole(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), monsterType: type,
                role: type == nil ? .villager : .monster, seatID: "me")
    }

    // Day 1 unless said otherwise. sentRound is the round the power was sent in.
    private func slot(_ type: MonsterType?, isDay: Bool = true, round: Int = 1, used: Bool = false, sentRound: Int? = nil) -> PowerSlot {
        RolePower(isDay: isDay, round: round, used: used, sentRound: sentRound).slot(for: you(type))
    }

    @Test func villagerHasNoButton() {
        #expect(slot(nil) == .note("Villagers have no power. Your vote is your weapon."))
    }

    @Test func vampireAndWitchGetTheirButtonDuringDay() {
        #expect(slot(.vampire) == .button("Block today's action"))
        #expect(slot(.witch) == .button("Plant a fake clue today"))
    }

    @Test func noButtonOutsideDay() {
        #expect(slot(.vampire, isDay: false) == .note("During Day, you can block the village's action once."))
        #expect(slot(.witch, isDay: false) == .note("During Day, you can fake the village's clue once."))
    }

    // Sent today: the server holds it until Day ends, so a second tap would be refused.
    @Test func sentPowerWaitsForTheEndOfDay() {
        #expect(slot(.vampire, sentRound: 1) == .note("Today's action will be blocked."))
        #expect(slot(.witch, sentRound: 1) == .note("If the village searches or communes today, its clue is fake."))
    }

    // A Witch whose fake met a Candle day keeps her power, so the next Day has the button again.
    @Test func powerSentOnAnEarlierDayDoesNotHoldTheButton() {
        #expect(slot(.witch, round: 2, sentRound: 1) == .button("Plant a fake clue today"))
    }

    @Test func usedPowerHasNoButton() {
        #expect(slot(.vampire, used: true) == .note("Your power is used."))
        #expect(slot(.witch, used: true) == .note("Your power is used."))
    }

    @Test func werewolfExplainsTheDoubleKill() {
        #expect(slot(.werewolf) == .note("Once a game, from Night 2, you can kill two players in one night."))
        #expect(slot(.werewolf, used: true) == .note("Your double kill is used."))
    }
}
