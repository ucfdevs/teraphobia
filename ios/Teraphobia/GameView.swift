import SwiftUI

// Picks the game screen from the current phase. Until the game starts it shows the Waiting room.
struct GameView: View {
    let client: RoomClient

    var body: some View {
        Group {
            if let you = client.you, let phase = client.phase {
                let seats = client.room?.seats ?? []
                switch phase.phase {
                case .night:
                    NightView(you: you, seats: seats, round: phase.round, deadline: client.phaseDeadline,
                              powerUsed: client.powerUsed) { submit in
                        client.emit("night:submit", submit)
                        client.nightVictims = submit.victimIDS?.count ?? 0
                    }
                case .day:
                    DayView(you: you, seats: seats, round: phase.round, deadline: client.phaseDeadline,
                            powerUsed: client.powerUsed,
                            sendAction: { client.emit("day:submit", $0) },
                            usePower: { power in
                                client.emit("power:use", power)
                                client.powerUsed = true
                            })
                case .discussion:
                    ResultView(you: you, round: phase.round, deadline: client.phaseDeadline, result: client.result)
                default:
                    WatchScreenView(you: you, phase: phase.phase, deadline: client.phaseDeadline)
                }
            } else {
                WaitingRoomView(client: client)
            }
        }
        .alert("Not allowed", isPresented: Binding(get: { client.gameError != nil }, set: { _ in client.gameError = nil })) {
            Button("OK") {}
        } message: {
            Text(client.gameError ?? "")
        }
    }
}

// Morning, and any phase without its own phone screen yet: the shared screen has the news.
struct WatchScreenView: View {
    let you: YouRole
    let phase: Phase
    let deadline: Date

    var body: some View {
        PhaseLayout(title: phase.rawValue.capitalized, deadline: deadline, you: you) {
            Section {
                Text("Watch the shared screen.")
            }
        }
    }
}
