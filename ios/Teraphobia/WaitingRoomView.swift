import SwiftUI

struct WaitingRoomView: View {
    let client: RoomClient

    var body: some View {
        List {
            Section {
                ForEach(client.room?.seats ?? [], id: \.seatID) { seat in
                    LabeledContent(seat.displayName, value: seat.seatID == client.seatID ? "You" : "")
                }
            } header: {
                Text("\(client.room?.seats.count ?? 0) of 8 players")
            } footer: {
                Text("Waiting for the host to start the game.")
            }
        }
        .navigationTitle(client.room?.code ?? "Waiting room")
        .navigationBarBackButtonHidden()
        .toolbar {
            Button("Leave") {
                client.leave()
            }
        }
    }
}

#Preview {
    NavigationStack {
        WaitingRoomView(client: RoomClient())
    }
}
