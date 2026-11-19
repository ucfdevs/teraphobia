import SwiftUI

// The lobby. Costumes are dealt when the game starts, so everyone shows up as the Stranger here.
struct WaitingRoomView: View {
    let client: RoomClient

    private let columns = [GridItem(.adaptive(minimum: 100, maximum: 160), spacing: 12)]

    private var seats: [PublicSeat] { client.room?.seats ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let code = client.room?.code {
                    RoomCodeCard(code: code)
                }

                StrangerSays(text: "Pull up a chair by the fire. Once the game starts, one of you won't be who they seem.")

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Who's at the door?")
                    Text("\(seats.count) of 8 players")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedText)

                    // No GlassGroup here: inside one, the "You" tag ends up drawn under the cards' glass.
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(seats, id: \.seatID) { seat in
                            LobbySeat(seat: seat, isYou: seat.seatID == client.seatID)
                        }
                    }
                }

                Text("Waiting for the host to start the game.")
                    .font(.callout)
                    .foregroundStyle(Theme.mutedText)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .gameBackground(.plain)
        .navigationTitle("Waiting room")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Leave") {
                    client.leave()
                }
                .frame(minHeight: 44)
            }
            ToolbarItem(placement: .topBarTrailing) {
                MuteButton()
            }
        }
    }
}

// The code friends type on Join, big enough to read across the room.
private struct RoomCodeCard: View {
    let code: String

    var body: some View {
        VStack(spacing: 4) {
            Text("Room code")
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
            Text(code)
                .font(.numbers(.largeTitle))
                .kerning(10)
                .foregroundStyle(Theme.text)
                .speechSpellsOutCharacters()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .surface(.card)
        .accessibilityElement(children: .combine)
    }
}

// One player in the lobby. Your own card says so, and players who dropped out fade until they're back.
private struct LobbySeat: View {
    let seat: PublicSeat
    let isYou: Bool

    var body: some View {
        CostumeCard(name: seat.displayName, costume: nil)
            .opacity(seat.connected ? 1 : 0.5)
            .overlay(alignment: .topLeading) {
                if isYou {
                    Text("You")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.blood, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .padding(8)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(seat.displayName)
            .accessibilityValue([isYou ? "You" : nil, seat.connected ? nil : "Away"].compactMap { $0 }.joined(separator: ", "))
    }
}

#Preview {
    NavigationStack {
        WaitingRoomView(client: RoomClient())
    }
}
