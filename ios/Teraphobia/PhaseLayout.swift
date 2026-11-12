import SwiftUI

// Every in-game screen uses this layout, so a Villager's phone and the Monster's
// phone look the same from across the room.
struct PhaseLayout<Content: View>: View {
    let title: String
    let deadline: Date
    let you: YouRole
    @ViewBuilder let content: Content

    var body: some View {
        List {
            Section {
                RolePeek(you: you)
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            content
        }
        .navigationTitle(title)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Countdown(deadline: deadline)
            }
        }
    }
}

// Living players other than you. Used for Night picks, the Candle, and the Monster's power.
struct PlayerPicker: View {
    let header: String
    let seats: [PublicSeat]
    let you: YouRole
    let picked: [String]
    let onPick: (String) -> Void

    var body: some View {
        Section(header) {
            ForEach(seats.filter { $0.lifeStatus == .alive && $0.seatID != you.seatID }, id: \.seatID) { seat in
                Button {
                    onPick(seat.seatID)
                } label: {
                    HStack {
                        Text(seat.displayName)
                            .foregroundStyle(.primary)
                        Spacer()
                        if picked.contains(seat.seatID) {
                            Image(systemName: "checkmark")
                        }
                    }
                }
                .accessibilityAddTraits(picked.contains(seat.seatID) ? .isSelected : [])
            }
        }
    }
}

// Sample players for the Night and Day previews.
extension PublicSeat {
    static let previews = ["Gui", "Cameron", "Lili", "Bernardo", "Teresa"].enumerated().map { index, name in
        PublicSeat(connected: true, costume: Costume(hat: "hat1", item: "item1", mask: "mask1"),
                   displayName: name, lifeStatus: .alive, seatID: "seat\(index)")
    }
}
