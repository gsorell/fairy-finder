import { useState } from 'react'
import GameSelect from './GameSelect.jsx'
import FairyFinder from './FairyFinder.jsx'
import WireRunner from './WireRunner.jsx'

export default function App() {
  const [game, setGame] = useState(null);

  if (game === 'fairy-finder') return <FairyFinder onBack={() => setGame(null)} />;
  if (game === 'wire-runner') return <WireRunner onBack={() => setGame(null)} />;
  return <GameSelect onSelect={setGame} />;
}
