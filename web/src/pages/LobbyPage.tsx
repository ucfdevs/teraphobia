import QRCode from "react-qr-code";
import { useState } from "react";
import logo from "../assets/logo.svg";
import LobbyUser from "../components/LobbyUser";
import type { GamePreset } from "./HostLobbyPage";
import { EMPTY_MOCK_LOBBY, type MockLobbyPlayer } from "../mocks/lobby";

import '../App.css';
import './lobby.css';

interface LobbyPageProps {
    maxPlayers?: number;
    preset?: GamePreset;
    initialPlayers?: MockLobbyPlayer[];
    onBack?: () => void;
}

export default function LobbyPage({
    maxPlayers = EMPTY_MOCK_LOBBY.maxPlayers,
    preset = EMPTY_MOCK_LOBBY.preset,
    initialPlayers = EMPTY_MOCK_LOBBY.players,
    onBack,
}: LobbyPageProps) {
    const [userList, setUsers] = useState<MockLobbyPlayer[]>(initialPlayers);
    const [userListSize, setUserListSize] = useState<number>(initialPlayers.length);

    function SanitizeLobbyCode(code: string): string {
        if (isNaN(parseInt(code))) {
            return "Invalid lobby code";
        }
        if (code.length != 6) {
            return "Code not 6 digits";
        }
        return code;
    }

    function GetLobbyCode(): string {
        return SanitizeLobbyCode(EMPTY_MOCK_LOBBY.code);
    }

    const RemoveUser = (idToRemove: string) => {
        setUsers((prev) => prev.filter((item) => item.id !== idToRemove));
        setUserListSize((prev) => prev - 1);
    };

    const lobbyCode = GetLobbyCode();
    const isRoomFull = userListSize >= maxPlayers;
    const isStartDisabled = userListSize < 4 || userListSize > maxPlayers;
    const buttonStatus = isStartDisabled ? 'disabled' : 'enabled';
    const playersNeeded = Math.max(0, 4 - userListSize);
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

            <main className="lobby-card">
                <p className="lobby-join-heading">Join on your phone with code</p>

                <div className="lobby-code-display" aria-label={`Lobby code ${lobbyCode}`}>
                    {lobbyCode}
                </div>

                <p className="lobby-instructions">
                    Open the Teraphobia app, enter the code and your name. Preset: {preset.toLowerCase()}.
                </p>

                <details className="lobby-qr-details">
                    <summary className="lobby-qr-summary">Show QR Code</summary>
                    <div className="lobby-qr-box">
                        <QRCode
                            size={128}
                            value={`https://teraphobia.com/join/${lobbyCode}`}
                            title={`Join lobby ${lobbyCode}`}
                        />
                    </div>
                </details>

                <section className="lobby-players-section" aria-live="polite">
                    <h2 className="lobby-players-count">
                        Players {userListSize}/{maxPlayers}{isRoomFull ? ' · Room full' : ''}
                    </h2>

                    {userList.length === 0 ? (
                        <p className="lobby-waiting-text">Waiting for players...</p>
                    ) : (
                        <ul className="lobby-user-list">
                            {userList.map((user) => (
                                <li key={user.id}>
                                    <LobbyUser
                                        id={user.id}
                                        username={user.username}
                                        profileSrc={user.profileSrc}
                                        removeself={RemoveUser}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <button
                    type="button"
                    className={`lobby-start-button ${buttonStatus}`}
                    disabled={isStartDisabled}
                >
                    {isStartDisabled ? `Start (needs ${playersNeeded} more)` : 'Start Game'}
                </button>

                {onBack && (
                    <div className="lobby-dev-actions">
                        <button type="button" className="lobby-secondary-btn" onClick={onBack}>
                            Back to Room Settings
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}