// Where a game screen is, for deciding its look.
enum ScreenMoment {
    // Monster-only moments: only the Monster's phone is ever in these.
    case choosingVictim, roleCardFace
    // Everyone's phone is in these, and phones get seen.
    case dayActions, discussion, vote, watchingSharedScreen

    var isMonsterOnly: Bool {
        switch self {
        case .choosingVictim, .roleCardFace: true
        case .dayActions, .discussion, .vote, .watchingSharedScreen: false
        }
    }
}

// Neutral for everyone, or the Monster look for one Monster type. The Monster look only shows in
// Monster-only moments, so a glance at the Monster's phone during Day, Discussion or Vote gives nothing away.
enum ScreenLook: Equatable {
    case neutral
    case monster(MonsterType)

    init(you: YouRole, moment: ScreenMoment) {
        guard you.role == .monster, moment.isMonsterOnly, let type = you.monsterType else {
            self = .neutral
            return
        }
        self = .monster(type)
    }
}
