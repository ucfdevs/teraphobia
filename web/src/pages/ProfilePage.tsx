import React, { useEffect, useState } from 'react';

interface MonsterWins {
    vampire: number;
    witch: number;
    werewolf: number;
}

interface UserStats {
    gamesPlayed: number;
    villagerWins: number;
    monsterWins: MonsterWins;
}

interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    avatarId: string;
    emailVerified: boolean;
    signInMethods: string[];
    stats: UserStats;
}

interface GameHistoryItem {
    id: string;
    startedAt: string;
    endedAt: string;
    playerCount: number;
    players: string[];
    monsterType: 'vampire' | 'witch' | 'werewolf';
    winner: 'villagers' | 'monster';
    role: 'villager' | 'monster';
    outcome: 'won' | 'lost';
}

interface ProfilePageProps {
    accessToken: string;
    onBack: () => void;
    onProfileUpdated: (displayName: string) => void;
    onTokenRotated: (newAccessToken: string) => void;
  onUnauthorized?: () => void;
}

const PRESET_AVATARS = [
    { id: 'villager-lantern', label: 'Lantern Keeper', role: 'Villager', badge: '🕯️' },
    { id: 'villager-scholar', label: 'Town Scholar', role: 'Villager', badge: '📜' },
    { id: 'villager-watchman', label: 'Night Watchman', role: 'Villager', badge: '🦉' },
    { id: 'villager-herbalist', label: 'Herbalist', role: 'Villager', badge: '🌿' },
    { id: 'monster-vampire', label: 'Vampire', role: 'Monster', badge: '🧛' },
    { id: 'monster-witch', label: 'Witch', role: 'Monster', badge: '🧙' },
    { id: 'monster-werewolf', label: 'Werewolf', role: 'Monster', badge: '🐺' },
];

export default function ProfilePage({
    accessToken,
    onBack,
    onProfileUpdated,
    onTokenRotated,
  onUnauthorized,
}: ProfilePageProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [avatarId, setAvatarId] = useState('villager-lantern');

    const [games, setGames] = useState<GameHistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [totalGames, setTotalGames] = useState(0);
    const limit = 5;

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');
    const [profileErr, setProfileErr] = useState('');

    // Change password state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState('');
    const [passwordErr, setPasswordErr] = useState('');

    useEffect(() => {
    if (!accessToken) {
      onUnauthorized?.();
      return;
    }
        let cancelled = false;
        async function loadProfile() {
            setLoadingProfile(true);
            setProfileErr('');
            try {
                const res = await fetch('/api/users/me', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
      if (res.status === 401) {
        if (!cancelled) onUnauthorized?.();
        return;
      }
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to load profile.');
                }
                if (!cancelled) {
                    setProfile(data);
                    setDisplayName(data.displayName || '');
                    setAvatarId(data.avatarId || 'villager-lantern');
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    setProfileErr(err instanceof Error ? err.message : 'Could not load profile.');
                }
            } finally {
                if (!cancelled) {
                    setLoadingProfile(false);
                }
            }
        }
        loadProfile();
        return () => {
            cancelled = true;
        };
    }, [accessToken, onUnauthorized]);

    useEffect(() => {
        let cancelled = false;
        async function loadGames() {
            try {
                const res = await fetch(`/api/users/me/games?page=${page}&limit=${limit}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                const data = await res.json();
                if (res.ok && !cancelled) {
                    setGames(data.games || []);
                    setTotalGames(data.total || 0);
                }
            } catch {
                // Non-blocking: leave history empty if unavailable
            }
        }
        loadGames();
        return () => {
            cancelled = true;
        };
    }, [accessToken, page]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileMsg('');
        setProfileErr('');
        const trimmed = displayName.trim();
        if (!trimmed || trimmed.length > 24) {
            setProfileErr('Display name must be 1 to 24 characters.');
            return;
        }

        setSavingProfile(true);
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ displayName: trimmed, avatarId }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Could not update profile.');
            }
            setProfile(data);
            onProfileUpdated(data.displayName);
            setProfileMsg('Profile updated.');
        } catch (err: unknown) {
            setProfileErr(err instanceof Error ? err.message : 'Could not update profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMsg('');
        setPasswordErr('');

        if (newPassword.length < 8) {
            setPasswordErr('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setPasswordErr('New passwords do not match.');
            return;
        }

        setSavingPassword(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Could not change password.');
            }
            if (data.accessToken) {
                onTokenRotated(data.accessToken);
            }
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            setPasswordMsg('Password updated and other sessions signed out.');
        } catch (err: unknown) {
            setPasswordErr(err instanceof Error ? err.message : 'Could not change password.');
        } finally {
            setSavingPassword(false);
        }
    };

    const totalMonsterWins = profile
        ? profile.stats.monsterWins.vampire +
        profile.stats.monsterWins.witch +
        profile.stats.monsterWins.werewolf
        : 0;

    const totalPages = Math.max(1, Math.ceil(totalGames / limit));
    const hasPasswordSignIn = profile?.signInMethods?.includes('password');

    return (
        <div className="dashboard-card">
            <div className="dash-header">
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              aria-label="Avatar placeholder"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "9999px",
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1.1rem",
                color: "#f8fafc",
              }}
            >
              {(profile?.displayName?.[0] || "?").toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f8fafc" }}>
                {profile ? profile.displayName : "Profile & Stats"}
              </h2>
            </div>
          </div>
                    {profile && (
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            {profile.email} &bull;{' '}
                            {profile.emailVerified ? 'Verified Account' : 'Unverified Email'} &bull; Sign-in:{' '}
                            {(profile.signInMethods || ['password']).join(', ')}
                        </p>
                    )}
                </div>
                <button type="button" onClick={onBack} className="btn-secondary">
                    Back to Dashboard
                </button>
            </div>

            {loadingProfile && <p style={{ color: '#94a3b8' }}>Loading profile...</p>}
            {profileErr && !profile && <div className="alert-error">{profileErr}</div>}

            {profile && (
                <>
                    {/* Stats Overview */}
                    <section aria-labelledby="stats-heading" style={{ marginBottom: '2rem' }}>
                        <h3
                            id="stats-heading"
                            style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#f8fafc',
                                marginBottom: '0.75rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            Career Stats
                        </h3>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: '0.75rem',
                            }}
                        >
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Games Played</span>
                                <span style={statValueStyle}>{profile.stats.gamesPlayed}</span>
                            </div>
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Villager Wins</span>
                                <span style={statValueStyle}>{profile.stats.villagerWins}</span>
                            </div>
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Monster Wins</span>
                                <span style={statValueStyle}>{totalMonsterWins}</span>
                            </div>
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Vampire Wins</span>
                                <span style={statValueStyle}>{profile.stats.monsterWins.vampire}</span>
                            </div>
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Witch Wins</span>
                                <span style={statValueStyle}>{profile.stats.monsterWins.witch}</span>
                            </div>
                            <div className="stat-box" style={statBoxStyle}>
                                <span style={statLabelStyle}>Werewolf Wins</span>
                                <span style={statValueStyle}>{profile.stats.monsterWins.werewolf}</span>
                            </div>
                        </div>
                    </section>

                    {/* Edit Display Name & Preset Avatar */}
                    <section
                        aria-labelledby="edit-profile-heading"
                        style={{
                            marginBottom: '2rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid #1e293b',
                        }}
                    >
                        <h3
                            id="edit-profile-heading"
                            style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#f8fafc',
                                marginBottom: '1rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            Edit Profile
                        </h3>

                        {profileErr && <div className="alert-error">{profileErr}</div>}
                        {profileMsg && <div className="alert-success">{profileMsg}</div>}

                        <form onSubmit={handleSaveProfile}>
                            <div className="form-group">
                                <label className="form-label" htmlFor="profile-display-name">
                                    Display Name
                                </label>
                                <input
                                    id="profile-display-name"
                                    className="form-input"
                                    type="text"
                                    maxLength={24}
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <span className="form-label" id="avatar-picker-label">
                                    Choose Avatar
                                </span>
                                <div
                                    role="radiogroup"
                                    aria-labelledby="avatar-picker-label"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                                        gap: '0.6rem',
                                    }}
                                >
                                    {PRESET_AVATARS.map((item) => {
                                        const selected = avatarId === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => setAvatarId(item.id)}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    padding: '0.75rem 0.5rem',
                                                    borderRadius: '10px',
                                                    border: selected ? '2px solid #f97316' : '1px solid #2a3554',
                                                    backgroundColor: selected ? '#1c2540' : '#090d1a',
                                                    color: '#f8fafc',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
                                                    {item.badge}
                                                </span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.label}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.role}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={savingProfile}
                                style={{ maxWidth: '220px' }}
                            >
                                {savingProfile ? 'Saving...' : 'Save Profile'}
                            </button>
                        </form>
                    </section>

                    {/* Game History */}
                    <section
                        aria-labelledby="history-heading"
                        style={{
                            marginBottom: '2rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid #1e293b',
                        }}
                    >
                        <h3
                            id="history-heading"
                            style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: '#f8fafc',
                                marginBottom: '0.75rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}
                        >
                            Game History ({totalGames})
                        </h3>

                        {games.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                                No finished games yet. Host or join a game to start building your history!
                            </p>
                        ) : (
                            <>
                                <div className="roles-table-container">
                                    <table className="roles-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Players</th>
                                                <th>Your Role</th>
                                                <th>Monster</th>
                                                <th>Result</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {games.map((g) => (
                                                <tr key={g.id}>
                                                    <td>{new Date(g.endedAt || g.startedAt).toLocaleDateString()}</td>
                                                    <td>
                                                        {g.playerCount} ({g.players.join(', ')})
                                                    </td>
                                                    <td style={{ textTransform: 'capitalize' }}>{g.role}</td>
                                                    <td style={{ textTransform: 'capitalize' }}>{g.monsterType}</td>
                                                    <td
                                                        style={{
                                                            fontWeight: 700,
                                                            color: g.outcome === 'won' ? '#86efac' : '#fca5a5',
                                                            textTransform: 'uppercase',
                                                        }}
                                                    >
                                                        {g.outcome}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {totalPages > 1 && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginTop: '0.75rem',
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        >
                                            Previous
                                        </button>
                                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                            Page {page} of {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                    {/* Change Password */}
                    {hasPasswordSignIn && (
                        <section
                            aria-labelledby="change-password-heading"
                            style={{
                                paddingTop: '1.5rem',
                                borderTop: '1px solid #1e293b',
                            }}
                        >
                            <h3
                                id="change-password-heading"
                                style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: '#f8fafc',
                                    marginBottom: '1rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}
                            >
                                Change Password
                            </h3>

                            {passwordErr && <div className="alert-error">{passwordErr}</div>}
                            {passwordMsg && <div className="alert-success">{passwordMsg}</div>}

                            <form onSubmit={handleChangePassword} style={{ maxWidth: '420px' }}>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="current-password">
                                        Current Password
                                    </label>
                                    <input
                                        id="current-password"
                                        className="form-input"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="new-password">
                                        New Password (min 8 characters)
                                    </label>
                                    <input
                                        id="new-password"
                                        className="form-input"
                                        type="password"
                                        minLength={8}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="confirm-new-password">
                                        Confirm New Password
                                    </label>
                                    <input
                                        id="confirm-new-password"
                                        className="form-input"
                                        type="password"
                                        minLength={8}
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <button type="submit" className="btn-secondary" disabled={savingPassword}>
                                    {savingPassword ? 'Updating...' : 'Update Password'}
                                </button>
                            </form>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

const statBoxStyle: React.CSSProperties = {
    backgroundColor: '#090d1a',
    border: '1px solid #2a3554',
    borderRadius: '10px',
    padding: '0.85rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
};

const statLabelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const statValueStyle: React.CSSProperties = {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#f8fafc',
};