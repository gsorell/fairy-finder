import { useState } from 'react'
import GameSelect from './GameSelect.jsx'
import FairyFinder from './FairyFinder.jsx'
import WireRunner from './WireRunner.jsx'
import RingSwinger from './RingSwinger.jsx'
import MuayThai from './MuayThai.jsx'
import WhaleGame from './WhaleGame.jsx'
import CrystalQuest from './CrystalQuest.jsx'

export default function App() {
  const [game, setGame] = useState(null);

  if (game === 'fairy-finder') return <FairyFinder onBack={() => setGame(null)} />;
  if (game === 'wire-runner') return <WireRunner onBack={() => setGame(null)} />;
  if (game === 'ring-swinger') return <RingSwinger onBack={() => setGame(null)} />;
  if (game === 'muay-thai') return <MuayThai onBack={() => setGame(null)} />;
  if (game === 'whale-game') return <WhaleGame onBack={() => setGame(null)} />;
  if (game === 'crystal-quest') return <CrystalQuest onBack={() => setGame(null)} />;
  return <GameSelect onSelect={setGame} />;
}
