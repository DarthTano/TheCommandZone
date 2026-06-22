import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { DecksPage } from './pages/DecksPage.jsx'
import { DeckBuilderPage } from './pages/DeckBuilderPage.jsx'
import { PlayPage } from './pages/PlayPage.jsx'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="spark">⚔️</span> The Command <b>Zone</b>
        </div>
        <nav className="nav">
          <NavLink to="/decks" className={({ isActive }) => (isActive ? 'active' : '')}>Decks</NavLink>
          <NavLink to="/play" className={({ isActive }) => (isActive ? 'active' : '')}>Play</NavLink>
        </nav>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 13 }}>Commander companion · powered by Scryfall</span>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/decks" replace />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/:id" element={<DeckBuilderPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="*" element={<Navigate to="/decks" replace />} />
        </Routes>
      </main>
    </div>
  )
}
