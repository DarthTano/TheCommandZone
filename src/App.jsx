import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { DecksPage } from './pages/DecksPage.jsx'
import { DeckBuilderPage } from './pages/DeckBuilderPage.jsx'
import { PlayPage } from './pages/PlayPage.jsx'
import { CompendiumPage } from './pages/CompendiumPage.jsx'
import { CollectionPage } from './pages/CollectionPage.jsx'
import { AuthModal } from './components/AuthModal.jsx'
import { UsernameModal } from './components/UsernameModal.jsx'
import { useAuth } from './state/AuthContext.jsx'

export default function App() {
  const [showAuth, setShowAuth] = useState(false)
  const [showUsername, setShowUsername] = useState(false)
  const auth = useAuth()

  // prompt for a username once after login if the account doesn't have one yet
  // (covers Google sign-in, where there's no signup form). Skippable.
  const [promptedFor, setPromptedFor] = useState(null)
  useEffect(() => {
    if (auth?.isCloud && auth.user && !auth.username && promptedFor !== auth.user.id) {
      setShowUsername(true)
      setPromptedFor(auth.user.id)
    }
  }, [auth?.isCloud, auth?.user, auth?.username, promptedFor])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="spark">⚔️</span> The Command <b>Zone</b>
        </div>
        <nav className="nav">
          <NavLink to="/decks" className={({ isActive }) => (isActive ? 'active' : '')}>Decks</NavLink>
          <NavLink to="/compendium" className={({ isActive }) => (isActive ? 'active' : '')}>Compendium</NavLink>
          <NavLink to="/collection" className={({ isActive }) => (isActive ? 'active' : '')}>Collection</NavLink>
          <NavLink to="/play" className={({ isActive }) => (isActive ? 'active' : '')}>Play</NavLink>
        </nav>
        <div className="spacer" />
        <AuthControls onSignIn={() => setShowAuth(true)} onEditUsername={() => setShowUsername(true)} />
      </header>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showUsername && <UsernameModal onClose={() => setShowUsername(false)} />}

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/decks" replace />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/:id" element={<DeckBuilderPage />} />
          <Route path="/compendium" element={<CompendiumPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="*" element={<Navigate to="/decks" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AuthControls({ onSignIn, onEditUsername }) {
  const auth = useAuth()
  if (!auth?.isCloud) {
    return <span className="faint" style={{ fontSize: 13 }}>Commander companion · powered by Scryfall</span>
  }
  if (auth.loading) return <span className="faint" style={{ fontSize: 13 }}>…</span>
  if (auth.user) {
    const label = auth.username || auth.user.email || 'Account'
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="ghost sm" title="Change username" onClick={onEditUsername}>
          👤 {label}
        </button>
        <button className="ghost sm" onClick={() => auth.signOut()}>Sign out</button>
      </span>
    )
  }
  return <button className="ghost sm" onClick={onSignIn}>Sign in</button>
}
