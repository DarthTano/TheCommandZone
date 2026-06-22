import { useEffect, useReducer, useRef, useState } from 'react'
import { GAME_MODE_LIST, GAME_MODES, COMMANDER_BRACKETS } from '../lib/formats.js'
import { initTable, tableReducer, actions } from '../lib/gameTable.js'
import { isCloud } from '../lib/supabase.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useRoom } from '../state/useRoom.js'
import { useTableCards } from '../state/useTableCards.js'
import { GameTable } from '../components/GameTable.jsx'

const LOCAL_STORE = 'manaforge.table.v1'
const NAME_KEY = 'manaforge.playername'

// stable per-tab identity for online play. Defaults the seat name to a saved
// name, else the account username, else "Player".
function useIdentity(defaultName) {
  const ref = useRef(null)
  if (!ref.current) {
    const key = (crypto.randomUUID?.() || Math.random().toString(36).slice(2))
    ref.current = { key, name: localStorage.getItem(NAME_KEY) || defaultName || 'Player' }
  }
  return ref.current
}

const makeCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no ambiguous chars
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('')
}

export function PlayPage() {
  // phase: 'setup' | { kind:'local', state? } | { kind:'online', code, isHost, name }
  const [phase, setPhase] = useState('setup')
  const auth = useAuth()
  const identity = useIdentity(auth?.username)
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_STORE) || 'null') } catch { return null }
  })

  if (phase === 'setup') {
    return (
      <SetupScreen
        identity={identity}
        username={auth?.username}
        saved={saved}
        onResume={() => setPhase({ kind: 'local', state: saved.state, bracket: saved.bracket })}
        onStartLocal={(cfg) => setPhase({ kind: 'local', state: initTable(cfg), bracket: cfg.bracket })}
        onCreateOnline={(cfg) => setPhase({ kind: 'online', code: makeCode(), isHost: true, initial: initTable(cfg), bracket: cfg.bracket })}
        onJoinOnline={(code) => setPhase({ kind: 'online', code, isHost: false, initial: null, bracket: 3 })}
      />
    )
  }

  const end = () => { setSaved(null); setPhase('setup') }

  if (phase.kind === 'local') {
    return <LocalTable initial={phase.state} bracket={phase.bracket} identity={identity} onEnd={end} setSaved={setSaved} />
  }
  return <OnlineTable code={phase.code} isHost={phase.isHost} initial={phase.initial} bracket={phase.bracket} identity={identity} onEnd={end} />
}

// ---------------- setup ----------------
function SetupScreen({ identity, username, saved, onResume, onStartLocal, onCreateOnline, onJoinOnline }) {
  const [modeKey, setModeKey] = useState('commander')
  const [count, setCount] = useState(4)
  const [bracket, setBracket] = useState(3)
  const [name, setName] = useState(identity.name)
  const [joinCode, setJoinCode] = useState('')
  const mode = GAME_MODES[modeKey]

  // if the account username loads after mount and the user hasn't set a custom
  // table name, adopt the username as the default seat name
  useEffect(() => {
    if (username && !localStorage.getItem(NAME_KEY) && (name === 'Player' || !name)) {
      setName(username)
      identity.name = username
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  function persistName(n) {
    setName(n); identity.name = n; localStorage.setItem(NAME_KEY, n)
  }
  const cfg = () => ({ modeKey, count, bracket })

  return (
    <div>
      <div className="page-head"><h1>Play</h1></div>

      {saved?.state && (
        <div className="panel" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>🔄 You have a game in progress ({saved.state.players?.length} players).</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="primary" onClick={onResume}>Resume</button>
        </div>
      )}

      <div className="setup-grid">
        {/* table rules */}
        <div className="panel">
          <div className="col-head">Table rules</div>
          <div className="field">
            <label>Game mode</label>
            <select value={modeKey} onChange={(e) => setModeKey(e.target.value)}>
              {GAME_MODE_LIST.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <span className="faint" style={{ fontSize: 12 }}>
              Start {mode.startLife} life{mode.commanderDamage ? ` · cmdr dmg ${mode.commanderDamage}` : ''} · poison {mode.poison} · {mode.players}
            </span>
          </div>
          <div className="field">
            <label>Players (seats)</label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} seats</option>)}
            </select>
          </div>
          {mode.format === 'commander' && (
            <div className="field">
              <label>Commander bracket</label>
              <select value={bracket} onChange={(e) => setBracket(Number(e.target.value))}>
                {COMMANDER_BRACKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* play options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="panel">
            <div className="col-head">Local · pass &amp; play</div>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>One device, passed around the table.</p>
            <button className="primary" style={{ width: '100%' }} onClick={() => onStartLocal(cfg())}>Start local table →</button>
          </div>

          <div className="panel">
            <div className="col-head">Online · play with friends</div>
            {!isCloud ? (
              <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                ⚠ Online play needs a quick one-time setup (free Supabase project + 2 keys). See
                {' '}<b>MULTIPLAYER_SETUP.md</b>. Until then, use a local table.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Create a room and share the 4-letter code, or join one.</p>
            )}
            <div className="field">
              <label>Your name</label>
              <input value={name} onChange={(e) => persistName(e.target.value)} disabled={!isCloud} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button className="primary" style={{ flex: 1 }} disabled={!isCloud} onClick={() => onCreateOnline(cfg())}>Create room</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="CODE" value={joinCode} maxLength={4}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 3, fontWeight: 700 }} disabled={!isCloud} />
              <button disabled={!isCloud || joinCode.length < 4} onClick={() => onJoinOnline(joinCode)}>Join</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- local table ----------------
function LocalTable({ initial, bracket, identity, onEnd, setSaved }) {
  const [state, dispatch] = useReducer(tableReducer, initial)
  useEffect(() => {
    const payload = { state, bracket }
    localStorage.setItem(LOCAL_STORE, JSON.stringify(payload))
    setSaved(payload)
  }, [state, bracket, setSaved])

  // one device controls every seat; the play mat shows the active player's hand
  const controlledPids = state.players.map((p) => p.id)
  const cards = useTableCards({ state, act: dispatch, controlledPids, roomKey: 'local' })

  function end() {
    localStorage.removeItem(LOCAL_STORE)
    onEnd()
  }

  return (
    <div>
      <div className="page-head">
        <h1>Local table</h1>
        <span className="badge">{state.players.length} seats</span>
        <span className="faint" style={{ fontSize: 13 }}>· cards shown for the active player ({state.players.find((p) => p.id === state.turn.activeId)?.name})</span>
      </div>
      <GameTable state={state} act={dispatch} identity={identity} bracket={bracket} onEnd={end}
        cards={cards} controlledPids={controlledPids} />
    </div>
  )
}

// ---------------- online table ----------------
function OnlineTable({ code, isHost, initial, bracket, identity, onEnd }) {
  const { state, act, members, status } = useRoom({ code, identity, isHost, initialState: initial })
  const [copied, setCopied] = useState(false)

  // you control only the seat you've claimed
  const mySeat = state?.players.find((p) => p.seatedBy === identity.key)
  const controlledPids = mySeat ? [mySeat.id] : []
  const cards = useTableCards({ state, act, controlledPids, roomKey: code })

  return (
    <div>
      <div className="page-head">
        <h1>Room</h1>
        <button className="code-pill" title="Copy code"
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
          {code} {copied ? '✓' : '⧉'}
        </button>
        <span className={`badge ${status === 'connected' ? 'ok' : ''}`}>
          {status === 'connected' ? `🟢 ${members.length} connected` : status === 'connecting' ? 'connecting…' : status}
        </span>
        <span className="faint" style={{ fontSize: 13 }}>{isHost ? 'You are the host' : 'Guest'}</span>
      </div>
      <GameTable state={state} act={act} online members={members} identity={identity} bracket={bracket} onEnd={onEnd}
        cards={cards} controlledPids={controlledPids} />
    </div>
  )
}
