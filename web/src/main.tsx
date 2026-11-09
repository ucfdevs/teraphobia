import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Lobby from './pages/Lobby.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lobby />
  </StrictMode>,
)
