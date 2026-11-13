import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import logo from "../assets/logo.svg";
import LobbyUser from "../components/LobbyUser";
import type { GamePreset } from "./HostLobbyPage";

import '../App.css';
import './lobby.css';

interface User {
    id: string;
    profileSrc: string;
    username: string;
}

interface LobbyPageProps {
    maxPlayers?: number;
    preset?: GamePreset;
    onBack?: () => void;
}

export default function LobbyPage({ maxPlayers = 8, preset = 'Normal', onBack }: LobbyPageProps) {
    const [userList, setUsers] = useState<User[]>([]);
    const [userListSize, setUserListSize] = useState<number>(0);
    const [buttonStatus, setButtonStatus] = useState<'disabled' | 'enabled'>('disabled');

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
        const code = '654321';
        return SanitizeLobbyCode(code);
    }

    const RemoveUser = (idToRemove: string) => {
        setUsers((prev) => prev.filter((item) => item.id !== idToRemove));
        setUserListSize((prev) => prev - 1);
    };

    useEffect(() => {
        if (userListSize >= 4 && userListSize <= maxPlayers) {
            setButtonStatus('enabled');
        } else {
            setButtonStatus('disabled');
        }
    }, [userListSize, maxPlayers]);

    const lobbyCode = GetLobbyCode();
    const isStartDisabled = buttonStatus === 'disabled';
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
                        Players {userListSize}/{maxPlayers}
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