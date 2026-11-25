import Foundation

// What the Discussion screen says about the village's Day action (#102). Everyone sees the same public
// result, except the Villager who searched, who also sees the clue only their phone was sent.
struct DayOutcome {
    let text: String
    // A trait to draw: the searcher's private clue, or the public Commune trait.
    let trait: Trait?

    init(result: DayResult?, search: YouResult?, round: Int, seats: [PublicSeat], seatID: String?) {
        guard let result, result.round == round else {
            (text, trait) = ("Nobody acted today.", nil)
            return
        }
        if result.blocked {
            (text, trait) = ("The Monster blocked today's action.", nil)
            return
        }
        switch result.action {
        case .search:
            if result.searcherID == seatID, let search, search.round == round {
                (text, trait) = (ClueText(result: search, round: round).text, search.trait)
            } else {
                let name = seats.first { $0.seatID == result.searcherID }?.displayName ?? "Someone"
                (text, trait) = ("\(name) searched the crime scene.", nil)
            }
        case .commune:
            (text, trait) = (result.trait.map { ClueText.sentence(for: $0, commune: true) } ?? "Nobody acted today.", result.trait)
        case .candle:
            (text, trait) = ("The village lit a candle.", nil)
        case .none:
            (text, trait) = ("Nobody acted today.", nil)
        }
    }
}
