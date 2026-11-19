import AVFoundation
import SwiftUI

// A moment in the game that makes a sound. Sound carries across the room, so a cue names a moment and
// never a role: every phone plays the same cue for the same moment, and the Monster's picks and powers
// creak with .pick like everyone else's taps.
enum Cue: String, CaseIterable {
    case nightFalls = "night-falls"
    case dayBreaks = "day-breaks"
    case heartbeat
    case pick
    case voteLock = "vote-lock"
    case death
    // Game over, from this phone's side. Roles are public by then, so this gives nothing away.
    case youWin = "you-win"
    case youLose = "you-lose"
}

// Plays the bundled sounds. The .ambient session follows the silent switch and mixes with the player's
// own music, and the mute toggle (stored under mutedKey) silences the app.
final class SoundEngine {
    static let shared = SoundEngine()
    static let mutedKey = "soundMuted"

    private var players: [Cue: AVAudioPlayer] = [:]
    private var sessionReady = false

    func play(_ cue: Cue) {
        guard !UserDefaults.standard.bool(forKey: Self.mutedKey) else { return }
        prepareSession()
        guard let player = player(for: cue) else { return }
        player.currentTime = 0
        player.play()
    }

    private func prepareSession() {
        guard !sessionReady else { return }
        sessionReady = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func player(for cue: Cue) -> AVAudioPlayer? {
        if let player = players[cue] { return player }
        guard let url = Bundle.main.url(forResource: cue.rawValue, withExtension: "m4a"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.prepareToPlay()
        players[cue] = player
        return player
    }
}

// Sound on or off, kept between launches. Sits on Join and in the game screens' toolbar.
struct MuteButton: View {
    @AppStorage(SoundEngine.mutedKey) private var muted = false

    var body: some View {
        Button {
            muted.toggle()
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .contentTransition(.symbolEffect(.replace))
                .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel("Sound")
        .accessibilityValue(muted ? "Off" : "On")
        .sensoryFeedback(.selection, trigger: muted)
    }
}
