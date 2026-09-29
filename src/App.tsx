import { Routes, Route, Navigate } from 'react-router-dom'
import { GameProvider } from './contexts/GameContext'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Team from './pages/Team'
import Hub from './pages/Hub'
import Universe from './pages/Universe'
import Challenge from './pages/Challenge'
import Portal from './pages/Portal'
import Hidden from './pages/Hidden'
import FinalBoss from './pages/FinalBoss'
import Nav from './components/Nav'
import BattleworldOS from './components/BattleworldOS'
import DoomCursor from './components/DoomCursor'

export default function App() {
  return (
    <GameProvider>
      <DoomCursor />
      <Nav />
      <BattleworldOS />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/team" element={<Team />} />
        <Route path="/hub" element={<Hub />} />
        <Route path="/universe/:universeId" element={<Universe />} />
        <Route path="/challenge/:challengeId" element={<Challenge />} />
        <Route path="/portal/:portalId" element={<Portal />} />
        <Route path="/hidden" element={<Hidden />} />
        <Route path="/final-boss" element={<FinalBoss />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </GameProvider>
  )
}
