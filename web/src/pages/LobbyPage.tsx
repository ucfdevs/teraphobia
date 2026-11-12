import QRCode from 'react-qr-code';
import React from 'react';
import ReactDOM from "react-dom";

import logo from '../assets/logo.svg';
import LobbyUser from '../components/LobbyUser';

import "./lobby.css"

export default function LobbyPage() {
    

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

        return code;
    }

    function GetLobbyCode() {
        const code = '654321'

        // !!! --- Uses API to get the lobby code

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
                <div className='lobby-qr-code'>
                    <QRCode value={'https://teraphobia.com/join/' + lobbyCode}></QRCode>
                </div>
            </div>
        </div>
        <div className='userListHeader'>
            <div className='usernameHeader'>Username</div>
            <div className='seperator'></div>
        </div>
        <div className="user-list">
            <LobbyUser username='Example' profileSrc='sanitized'/>
            <LobbyUser username='Example' profileSrc='sanitized'/>
            <LobbyUser username='Example' profileSrc='sanitized'/>
            <LobbyUser username='Example' profileSrc='sanitized'/>
        </div>
        <button className='start-game-button'>Start Game</button>
        </>
    )
}