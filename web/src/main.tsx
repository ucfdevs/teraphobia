import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HostLobbyPage, { type GamePreset } from './pages/HostLobbyPage.tsx'
import LobbyPage from './pages/LobbyPage.tsx'

function RoomFlowPreview() {
  const [screen, setScreen] = useState<'create' | 'lobby'>('create')
  const [roomSettings, setRoomSettings] = useState<{
    preset: GamePreset
    maxPlayers: number
  }>({
    preset: 'Normal',
    maxPlayers: 4,
  })

  if (screen === 'lobby') {
    return (
      <LobbyPage
        maxPlayers={roomSettings.maxPlayers}
        preset={roomSettings.preset}
        onBack={() => setScreen('create')}
      />
    )
  }

  return (
    <HostLobbyPage
      onCreateLobby={(settings) => {
        setRoomSettings({
          preset: settings.preset,
          maxPlayers: settings.maxPlayers,
        })
        setScreen('lobby')
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoomFlowPreview />
  </StrictMode>,
)