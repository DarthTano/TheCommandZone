import { useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { DecksPage } from './pages/DecksPage.jsx'
import { DeckBuilderPage } from './pages/DeckBuilderPage.jsx'
import { PlayPage } from './pages/PlayPage.jsx'
import { AuthModal } from './components/AuthModal.jsx'
import { useAuth } from './state/AuthContext.jsx'

export default function App() {
  const [showAuth, setShowAuth] = useState(false)
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
        <AuthControls onSignIn={() => setShowAuth(true)} />
      </header>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

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

function AuthControls({ onSignIn }) {
  const auth = useAuth()
  if (!auth?.isCloud) {
    return <span className="faint" style={{ fontSize: 13 }}>Commander companion · powered by Scryfall</span>
  }
  if (auth.loading) return <span className="faint" style={{ fontSize: 13 }}>…</span>
  if (auth.user) {
    const label = auth.user.email || auth.user.user_metadata?.name || 'Account'
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="faint" style={{ fontSize: 13 }} title={label}>👤 {label}</span>
        <button className="ghost sm" onClick={() => auth.signOut()}>Sign out</button>
      </span>
    )
  }
  return <button className="ghost sm" onClick={onSignIn}>Sign in</button>
}
