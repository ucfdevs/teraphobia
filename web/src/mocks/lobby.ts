import type { GamePreset } from '../pages/HostLobbyPage';

export interface MockLobbyPlayer {
    id: string;
    username: string;
    profileSrc: string;
    isHost?: boolean;
}

export interface MockLobbyState {
    code: string;
    preset: GamePreset;
    maxPlayers: number;
    players: MockLobbyPlayer[];
}

export const EMPTY_MOCK_LOBBY: MockLobbyState = {
    code: '654321',
    preset: 'Normal',
    maxPlayers: 8,
    players: [],
};

export const READY_MOCK_LOBBY: MockLobbyState = {
    code: '654321',
    preset: 'Normal',
    maxPlayers: 8,
    players: [
        { id: 'player-1', username: 'Lili (Host)', profileSrc: '', isHost: true },
        { id: 'player-2', username: 'Cameren', profileSrc: '' },
        { id: 'player-3', username: 'Raven', profileSrc: '' },
        { id: 'player-4', username: 'Salem', profileSrc: '' },
    ],
};

export const FULL_MOCK_LOBBY: MockLobbyState = {
    code: '654321',
    preset: 'Normal',
    maxPlayers: 8,
    players: [
        { id: 'player-1', username: 'Lili (Host)', profileSrc: '', isHost: true },
        { id: 'player-2', username: 'Cameren', profileSrc: '' },
        { id: 'player-3', username: 'Raven', profileSrc: '' },
        { id: 'player-4', username: 'Salem', profileSrc: '' },
        { id: 'player-5', username: 'Bram', profileSrc: '' },
        { id: 'player-6', username: 'Mina', profileSrc: '' },
        { id: 'player-7', username: 'Harker', profileSrc: '' },
        { id: 'player-8', username: 'Lucia', profileSrc: '' },
    ],
};