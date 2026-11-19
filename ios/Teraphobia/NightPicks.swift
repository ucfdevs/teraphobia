// The Night choice on this phone: a Villager's hunch, or the Monster's victims.
// Every tap is sent right away and the server keeps the latest, since Night only ends on the timer.
struct NightPicks: Equatable {
    let you: YouRole
    let round: Int
    let powerUsed: Bool
    private(set) var picked: [String] = []

    init(you: YouRole, round: Int, powerUsed: Bool) {
        self.you = you
        self.round = round
        self.powerUsed = powerUsed
    }

    // The Werewolf can kill two players once per game, never on Night 1.
    var maxPicks: Int {
        you.monsterType == .werewolf && !powerUsed && round > 1 ? 2 : 1
    }

    func tapping(_ seatID: String) -> NightPicks {
        var next = self
        if maxPicks == 1 {
            next.picked = [seatID]
        } else if picked.contains(seatID) {
            // A pick can't be taken back on the server, so keep at least one.
            if picked.count > 1 { next.picked.removeAll { $0 == seatID } }
        } else {
            next.picked.append(seatID)
            if next.picked.count > maxPicks { next.picked.removeFirst() }
        }
        return next
    }

    var submit: NightSubmit {
        you.role == .monster
            ? NightSubmit(victimIDS: picked, suspectID: nil)
            : NightSubmit(victimIDS: nil, suspectID: picked.last)
    }
}
