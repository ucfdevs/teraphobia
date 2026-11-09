import './lobbyuser.css';

interface UserData {
    username: string
    profileSrc: string
}

function LobbyUser({username, profileSrc}: UserData) {
    return (
        <div className="lobbyUser">
            <img src={profileSrc}></img>
            <p className='playerName'>{username}</p>
            <div className='userOptions'>
                <button className='editUserOptionsButton'>

                </button>
                <button className='removeUserButton'>

                </button>
            </div>
        </div>
    )
}
export default LobbyUser