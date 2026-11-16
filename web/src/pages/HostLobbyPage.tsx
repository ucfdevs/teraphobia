import '../App.css'
import './hostlobbypage.css'
import { useState } from 'react'
import logo from '../assets/logo.svg'

export type GamePreset = 'Quick' | 'Normal' | 'Relaxed'

interface HostLobbyPageProps {
    onCreateLobby?: (settings: {
        preset: GamePreset
        maxPlayers: number
    }) => void
    onBack?: () => void
}

const PRESETS: { name: GamePreset; description: string }[] = [
    { name: 'Quick', description: 'About 1.5 minutes a round' },
    { name: 'Normal', description: 'About 2.5 minutes a round' },
    { name: 'Relaxed', description: 'About 4 minutes a round' },
]

export default function HostLobbyPage({ onCreateLobby, onBack }: HostLobbyPageProps) {
    const [preset, setPreset] = useState<GamePreset>('Normal')

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault()
        if (onCreateLobby) {
            onCreateLobby({ preset, maxPlayers: 8 })
        }
    }

    return (
        <div className="app-wrapper">
            <div className="fog-wrapper" aria-hidden="true">
                <div className="fog-layer-1"></div>
                <div className="fog-layer-2"></div>
            </div>

            <header className="brand-header">
                <img src={logo} alt="Teraphobia" className="brand-logo" />
                <p className="brand-subtitle">HALLOWEEN SOCIAL DEDUCTION GAME</p>
            </header>

            <main className="create-room-card">
                <h1 className="create-room-title">Create a room</h1>
                <form onSubmit={handleCreate} className="create-room-form">
                    <fieldset className="timer-preset-fieldset">
                        <legend className="timer-preset-legend">TIMER PRESET</legend>
                        <div className="preset-stack">
                            {PRESETS.map((item) => {
                                const isSelected = preset === item.name
                                return (
                                    <label
                                        key={item.name}
                                        className={`preset-radio-card ${isSelected ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="timer-preset"
                                            value={item.name}
                                            checked={isSelected}
                                            onChange={() => setPreset(item.name)}
                                            className="preset-radio-input"
                                        />
                                        <span className="preset-radio-circle" aria-hidden="true"></span>
                                        <span className="preset-radio-text">
                                            <span className="preset-radio-title">{item.name}</span>
                                            <span className="preset-radio-desc">{item.description}</span>
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </fieldset>

                    <div className="create-room-footer">
                        <button
                            type="button"
                            className="back-room-button"
                            onClick={onBack}
                        >
                            Back
                        </button>
                        <button type="submit" className="create-room-submit">
                            Create room
                        </button>
                    </div>
                </form>
            </main>
        </div>
    )
}