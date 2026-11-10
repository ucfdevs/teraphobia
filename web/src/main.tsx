import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LobbyPage from './pages/LobbyPage.tsx'
import HostLobbyPage from './pages/HostLobbyPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HostLobbyPage />
  </StrictMode>,
)
