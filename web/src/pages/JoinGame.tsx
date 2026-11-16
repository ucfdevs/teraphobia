import './joingame.css'

function JoinGame() {
    return (
        <>
        <p>Enter Your Lobby Code</p>
        <div className="lobby-code-container">
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
            <div className='dash'>-</div>
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
            <input type="tel" className="code-digit-input" maxLength={1} inputMode="numeric"></input>
        </div>
        <p>Lobby codes are displayed in the top right of the host's screen</p>
        </>
    )
}   
export default JoinGame;