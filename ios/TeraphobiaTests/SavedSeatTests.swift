import Testing
@testable import Teraphobia

// The saved seat lives in the real Keychain, so these run one at a time.
@MainActor
@Suite(.serialized)
struct SavedSeatTests {
    private let seat = RoomClient.SavedSeat(code: "ABCD", displayName: "Gui", rejoinToken: "token")

    @Test func savedSeatComesBack() {
        RoomClient.saveSeat(seat)
        #expect(RoomClient.savedSeat() == seat)
        RoomClient.clearSeat()
    }

    @Test func clearRemovesTheSeat() {
        RoomClient.saveSeat(seat)
        RoomClient.clearSeat()
        #expect(RoomClient.savedSeat() == nil)
    }

    @Test func leaveClearsTheSeat() {
        RoomClient.saveSeat(seat)
        RoomClient().leave()
        #expect(RoomClient.savedSeat() == nil)
    }

    @Test func seatDoesNotTouchTheSession() {
        let session = Keychain.load()
        RoomClient.saveSeat(seat)
        RoomClient.clearSeat()
        #expect(Keychain.load() == session)
    }
}
