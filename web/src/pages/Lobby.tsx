import logo from '../assets/logo.svg';
import LobbyUser from '../components/LobbyUser';
import "./lobby.css"

function Lobby() {
    

    /**
     * Takes a string and converts it into the code to be displayed on the webpage
     * @param code A string with 6 numberical digits
     * @returns A sanitized string with a dash to seperate the two parts of the code
     */
    function SanitizeLobbyCode(code: string) : string {
        
        // Checks if code is not a number
        if (isNaN(parseInt(code))) {
            return "Invalid lobby code";
        }
        // Checks if code length is correct
        if (code.length != 6) {
            return "Code not 6 digits";
        }

        const codefirstH = code.slice(0, 3);
        const codeseconH = code.slice(3);

        return codefirstH + '-' + codeseconH;
    }

    function GetLobbyCode() {
        const code = '123456'
        // Uses API to get the lobby code 
        return SanitizeLobbyCode(code);
    }
    
    const lobbyCode = GetLobbyCode();

    //var userList: ReactNode[];
    return (
        <>

        <div id="lobbyheader">
            <img id='logo' src={logo}></img>
            <div id='codeheader'>
                <p id='jointext'>Join at Teraphobia.com/join</p>
                <div id='lobbycode'>
                    {lobbyCode}
                </div>
            </div>
        </div>
        <div className='userListHeader'>
            <div className='usernameHeader'>Username</div>
            <div className='seperator'></div>
        </div>
        <div id="userlist">
            <LobbyUser username='Example' profileSrc='sanitized'/>
        </div>
        <button className='start-game-button'>Start Game</button>
        </>
    )
}
export default Lobby;