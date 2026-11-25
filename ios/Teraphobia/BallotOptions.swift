import Foundation

// What is on today's group ballot (#102). Candle always is; day:options can take Search or Commune off.
struct BallotOptions {
    let options: DayOptions?
    let round: Int

    // The one-line reason an option is greyed out today, or nil when it can be picked.
    func reason(for action: DayAction) -> String? {
        // day:options comes just before phase:start, so yesterday's can still be here for a moment.
        guard let options, options.round == round else { return nil }
        switch action {
        case .search: return options.search ? nil : "Searched yesterday"
        case .commune: return options.commune ? nil : "No traits left to learn"
        case .candle: return nil
        }
    }
}
