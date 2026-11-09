import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Lobby from './pages/Lobby.tsx'
import JoinGame from './pages/JoinGame.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JoinGame />
  </StrictMode>,
)
