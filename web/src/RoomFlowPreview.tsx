import { useState } from 'react'
import HostLobbyPage, { type GamePreset } from './pages/HostLobbyPage'
import LobbyPage from './pages/LobbyPage'

export default function RoomFlowPreview() {
    const [screen, setScreen] = useState<'create' | 'lobby'>('create')
    const [roomSettings, setRoomSettings] = useState<{
        preset: GamePreset
        maxPlayers: number
    }>({
        preset: 'Normal',
        maxPlayers: 8,
    })

    if (screen === 'lobby') {
        return (
            <LobbyPage
                preset={roomSettings.preset}
                maxPlayers={roomSettings.maxPlayers}
                onBack={() => setScreen('create')}
            />
        )
    }

    return (
        <HostLobbyPage
            onCreateLobby={(settings) => {
                setRoomSettings(settings)
                setScreen('lobby')
            }}
        />
    )
}