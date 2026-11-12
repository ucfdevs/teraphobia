import './hostlobbypage.css'
import { useState } from 'react'

export default function HostLobbyPage() {

    const [vampOdds, setVampOdds] = useState<number>(40);
    const [wolfOdds, setWolfOdds] = useState<number>(20);
    const [witchOdds, setWitchOdds] = useState<number>(40);

    return (
        <>
        <div>
            <h1>Host a Teraphobia Game</h1>
            <div className='options-enable-werewolf'>
                
            </div>
            <div className='options-killer-role'>
                <h2 className='killer-role-text'>Change Killer Role Odds</h2>
                <div className='killer-role-button-container'>
                    <div className='vampire-container'>
                        <label htmlFor='role-vampire'>Vampire Odds</label>
                        <input onChange={(e) => setVampOdds(Number(e.target.value))} value={vampOdds} id='role-vampire' className='killer-role-number' type='number' min={0} max={100}></input>
                        <input onChange={(e) => setVampOdds(Number(e.target.value))} value={vampOdds} className='killer-role-slider' type='range' min={0} max={100}></input>
                    </div>
                    <div className='witch-container'>
                        <label htmlFor='role-witch'>Witch Odds</label>
                        <input onChange={(e) => setWitchOdds(Number(e.target.value))} value={witchOdds} id='role-witch' className='killer-role-number' type='number' min={0} max={100}></input>
                        <input onChange={(e) => setWitchOdds(Number(e.target.value))} value={witchOdds} className='killer-role-slider' type='range' min={0} max={100}></input>
                    </div>
                    <div className='werewolf-container'>
                        <label htmlFor='role-wolf'>Werewolf Odds</label>
                        <input onChange={(e) => setWolfOdds(Number(e.target.value))} value={wolfOdds} id='role-wolf' className='killer-role-number' type='number' min={0} max={100}></input>
                        <input onChange={(e) => setWolfOdds(Number(e.target.value))} value={wolfOdds} className='killer-role-slider' type='range' min={0} max={100}></input>
                    </div>
                </div>
            </div>
            <div className='options-max-players'>
                <h2 className="max-players-text">Max Players</h2>
                <div className="max-players-button-container">
                    <button className="max-players-button" value={1}>1</button>
                    <button className="max-players-button" value={2}>2</button>
                    <button className="max-players-button" value={3}>3</button>
                    <button className="max-players-button" value={4}>4</button>
                    <button className="max-players-button" value={5}>5</button>
                    <button className="max-players-button" value={6}>6</button>
                </div>
            </div>
        </div>
        </>
    )
}