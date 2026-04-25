import { useState } from 'react'
import TankGame from './components/TankGame.jsx'

function App() {
  const [connected, setConnected] = useState(false)
  const [nickname, setNickname] = useState('')
  const [serverIp, setServerIp] = useState('localhost')

  const handleConnect = () => {
    if (nickname.trim()) {
      setConnected(true)
    }
  }

  if (!connected) {
    return (
      <div className="game-container">
        <div className="connect-panel">
          <h1>Tank Battle 3D</h1>
          <p>Multiplayer tank arena. Play with friends on the same network!</p>
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
          <input
            type="text"
            placeholder="Server IP (default: localhost)"
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
          />
          <button onClick={handleConnect}>Join Battle</button>
        </div>
      </div>
    )
  }

  return <TankGame nickname={nickname} serverIp={serverIp} />
}

export default App
