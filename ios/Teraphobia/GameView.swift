import SwiftUI
import UIKit

// Picks the game screen from the current phase. Until the game starts it shows the Waiting room.
struct GameView: View {
    let client: RoomClient

    // Your public status from room:state. Dead and banished players sit out the rest of the game.
    private var lifeStatus: LifeStatus {
        client.room?.seats.first { $0.seatID == client.seatID }?.lifeStatus ?? .alive
    }

    // The death sting waiting to play, so it can be called off when this screen goes away.
    @State private var deathSting: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase
    @State private var wasInBackground = false

    var body: some View {
        Group {
            if client.reconnecting {
                ReconnectingView()
            } else if let you = client.you, let gameOver = client.gameOver {
                GameOverView(gameOver: gameOver, you: you, seats: client.room?.seats ?? [], done: client.leave)
            } else if lifeStatus != .alive {
                OutView(lifeStatus: lifeStatus)
            } else if let you = client.you, let phase = client.phase {
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
                            ballot: client.ballotRound == phase.round ? client.ballot : nil,
                            options: BallotOptions(options: client.dayOptions, round: phase.round),
                            progress: client.dayProgress,
                            cast: client.cast,
                            usePower: { power in
                                client.emit("power:use", power)
                                client.powerUsed = true
                            })
                case .discussion:
                    ResultView(you: you, deadline: client.phaseDeadline,
                               outcome: DayOutcome(result: client.dayResult, search: client.result, round: phase.round,
                                                   seats: seats, seatID: client.seatID))
                case .vote:
                    VoteView(you: you, seats: seats, deadline: client.phaseDeadline,
                             lockedIn: client.votedRound == phase.round, votedTargetID: client.votedTargetID) { targetID in
                        client.vote(for: targetID)
                    }
                default:
                    WatchScreenView(you: you, phase: phase.phase, deadline: client.phaseDeadline)
                }
            } else {
                WaitingRoomView(client: client)
            }
        }
        .environment(\.gameBackdrop, client.phase.map { Backdrop(phase: $0.phase) } ?? .plain)
        .environment(\.phaseStartedAt, client.phaseStartedAt)
        .alert("Not allowed", isPresented: Binding(get: { client.gameError != nil }, set: { _ in client.gameError = nil })) {
            Button("OK") {}
        } message: {
            Text(client.gameError ?? "")
        }
        // Loaded now, so the first sound doesn't wait on its file.
        .task { SoundEngine.shared.prepare() }
        // VoiceOver doesn't read a new screen title by itself, so it says when a phase starts or the connection drops.
        // Keyed on the phase alone: a host pause resends the same phase with a new end time, and that isn't a new phase.
        .onChange(of: client.phase?.phase) {
            if let phase = client.phase?.phase {
                AccessibilityNotification.Announcement(phase.rawValue.capitalized).post()
                // Every phone plays these at once. A rejoin lands mid-phase, so it stays quiet.
                if !client.phaseFromRejoin {
                    switch phase {
                    case .night: SoundEngine.shared.play(.nightFalls)
                    case .morning: SoundEngine.shared.play(.dayBreaks)
                    default: break
                    }
                }
            }
        }
        // Someone died or was banished. Late, so it lands after the morning bell.
        .onChange(of: client.deaths) { old, new in
            guard new > old else { return }
            deathSting?.cancel()
            deathSting = Task {
                try? await Task.sleep(for: .seconds(1))
                // Left the game, or that death ended it and the win or lose sound plays instead.
                guard !Task.isCancelled, client.gameOver == nil else { return }
                SoundEngine.shared.play(.death)
            }
        }
        // An auto-locked phone drops its socket, so the screen stays on until the player leaves the game.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            deathSting?.cancel()
            UIApplication.shared.isIdleTimerDisabled = false
        }
        // Only after the background, not when Control Center or a call banner briefly covers the app.
        .onChange(of: scenePhase) {
            if scenePhase == .background { wasInBackground = true }
            if scenePhase == .active, wasInBackground {
                wasInBackground = false
                client.reconnectNow()
            }
        }
        .onChange(of: client.gameOver) {
            guard let gameOver = client.gameOver, let you = client.you else { return }
            let youWon = (gameOver.winner == .monster) == (you.role == .monster)
            SoundEngine.shared.play(youWon ? .youWin : .youLose)
        }
        .onChange(of: client.reconnecting) {
            if client.reconnecting {
                AccessibilityNotification.Announcement("Reconnecting").post()
            }
        }
    }
}

// Morning, and any phase without its own phone screen yet: the shared screen has the news.
struct WatchScreenView: View {
    let you: YouRole
    let phase: Phase
    let deadline: Date

    private var heading: String {
        phase == .morning ? "Who made it to morning?" : "All eyes on the big screen"
    }

    var body: some View {
        // Everyone's phone is on this screen at once, so it stays neutral for the Monster too.
        PhaseLayout(title: phase.rawValue.capitalized, deadline: deadline, you: you, heading: heading,
                    look: ScreenLook(you: you, moment: .watchingSharedScreen)) {
            StrangerSays(text: "Watch the shared screen. Whatever crept through the night, the news is up there.")
        }
    }
}
