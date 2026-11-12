import './lobbyuser.css';

interface UserData {
    id: string
    username: string
    profileSrc: string
    removeself: (idToRemove: string) => void
}

function LobbyUser({id, username, profileSrc, removeself}: UserData) {
    return (
        <div className="lobbyUser" id={id}>
            <img src={profileSrc}></img>
            <p className='playerName'>{username}</p>
            <div className='userOptions'>
                <button className='editUserOptionsButton'>
                    Edit User Settings
                </button>
                <button className='removeUserButton' onClick={() => {removeself(id)}}>
                    Kick User
                </button>
            </div>
        </div>
    )
}
export default LobbyUser