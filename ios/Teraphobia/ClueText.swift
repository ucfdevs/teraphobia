import Foundation

// What the Discussion screen says about this player's private Day result.
struct ClueText {
    let result: YouResult?
    let round: Int

    var text: String {
        guard let result, result.round == round else { return "You didn't pick an action today." }
        guard let trait = result.trait else {
            // Same words for a blocked or capped result as for a real empty one, so nothing gives the Monster away.
            switch result.action {
            case .search: return "You found nothing."
            case .commune: return "The dead are silent."
            case .candle: return result.candleBlocked == true ? "The Monster blocked your candle." : "Your candle burns for tonight."
            }
        }
        let name = trait.option.rawValue.replacingOccurrences(of: "-", with: " ")
        let held = trait.slot == .item
        if result.action == .commune {
            return "The dead whisper: the Monster doesn't \(held ? "carry" : "wear") the \(name)."
        }
        return "The Monster \(held ? "carries" : "wears") the \(name)."
    }
}
