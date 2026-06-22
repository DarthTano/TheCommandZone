import { useEffect, useRef, useState } from 'react'
import { actions, modeOf, isEliminated, PHASES, phaseLabel, rulesOn } from '../lib/gameTable.js'
import { COMMANDER_BRACKETS } from '../lib/formats.js'
import { imageUris } from '../lib/scryfall.js'
import { PlayMat } from './PlayMat.jsx'

// Mode-agnostic game table. `act(action)` either mutates local state or
// broadcasts over Realtime — GameTable doesn't care which.
export function GameTable({ state, act, online = false, members = [], identity, bracket, onEnd, cards, controlledPids = [] }) {
  if (!state) return <div className="empty"><span className="spin">⟳</span> Connecting to table…</div>
  const mode = modeOf(state)
  const useCmd = mode.commanderDamage > 0

  return (
    <div className="table-layout">
      <div className="table-main">
        <div className="players-grid">
          {state.players.map((p) => (
            <PlayerCard
              key={p.id}
              p={p}
              state={state}
              mode={mode}
              useCmd={useCmd}
              act={act}
              online={online}
              identity={identity}
              active={state.turn.activeId === p.id}
              canRemove={state.players.length > 1}
            />
          ))}
          <AddSeat act={act} online={online} />
        </div>

        {cards && (
          <PlayMat state={state} act={act} cards={cards} controlledPids={controlledPids} online={online} />
        )}
      </div>

      <aside className="table-side">
        <TurnPanel state={state} mode={mode} act={act} bracket={bracket} online={online} members={members} onEnd={onEnd} />
        <DicePanel act={act} identity={identity} />
        <LogPanel state={state} act={act} identity={identity} />
      </aside>
    </div>
  )
}

function PlayerCard({ p, state, mode, useCmd, act, online, identity, active, canRemove }) {
  const dead = isEliminated(state, p)
  const mine = online && p.seatedBy && identity && p.seatedBy === identity.key
  return (
    <div className={`player-card${active ? ' active' : ''}`} style={{ opacity: dead ? 0.5 : 1, borderColor: dead ? 'var(--danger)' : (active ? p.color : undefined) }}>
      <div className="pc-head">
        <span className="dot" style={{ background: p.color }} />
        <input
          value={p.name}
          onChange={(e) => act(actions.rename(p.id, e.target.value))}
          className="pc-name"
        />
        {online && (
          mine
            ? <span className="chip" title="Your seat">you</span>
            : !p.seatedBy && <button className="ghost sm" onClick={() => act(actions.claimSeat(p.id, identity.key, identity.name))}>sit</button>
        )}
        {canRemove && <button className="ghost icon sm danger" title="Remove seat" onClick={() => act(actions.removePlayer(p.id))}>✕</button>}
      </div>

      <div className="pc-life">
        <button onClick={() => act(actions.adjustLife(p.id, -1))}>−</button>
        <div className="life-num" style={{ color: dead ? 'var(--danger)' : p.color }}>{p.life}</div>
        <button onClick={() => act(actions.adjustLife(p.id, +1))}>+</button>
      </div>
      <div className="pc-row5">
        <button className="sm" onClick={() => act(actions.adjustLife(p.id, -5))}>−5</button>
        <button className="sm" onClick={() => act(actions.adjustLife(p.id, +5))}>+5</button>
        <span className="spacer" />
        <span className="chip" title="Poison / infect">☠ {p.poison}/{mode.poison}</span>
        <button className="ghost icon sm" onClick={() => act(actions.adjustPoison(p.id, -1))}>−</button>
        <button className="ghost icon sm" onClick={() => act(actions.adjustPoison(p.id, +1))}>+</button>
      </div>

      <DeckChip p={p} act={act} />

      {useCmd && state.players.length > 1 && (
        <div className="pc-cmd">
          <div className="col-head" style={{ margin: '6px 0 4px' }}>Commander damage</div>
          {state.players.filter((o) => o.id !== p.id).map((o) => {
            const d = p.cmdDmg[o.id] || 0
            return (
              <div className="cmd-row" key={o.id}>
                <span className="dot sm" style={{ background: o.color }} />
                <span className="cn">{o.name}</span>
                <button className="ghost icon sm" onClick={() => act(actions.adjustCmd(p.id, o.id, -1))}>−</button>
                <span className="q" style={{ color: d >= mode.commanderDamage ? 'var(--danger)' : undefined }}>{d}</span>
                <button className="ghost icon sm" onClick={() => act(actions.adjustCmd(p.id, o.id, +1))}>+</button>
              </div>
            )
          })}
        </div>
      )}
      {dead && <div className="badge bad" style={{ marginTop: 8 }}>Eliminated</div>}
    </div>
  )
}

// Display-only deck chip — shows the commander art once a deck is loaded on the
// play mat below. (Loading happens in PlayMat's "Load deck" prompt.)
function DeckChip({ p }) {
  if (!p.deck) return null
  return (
    <div className="deck-chip" title={p.deck.commander || p.deck.name}>
      {p.deck.art && <img src={p.deck.art} alt="" />}
      <span className="cn">{p.deck.name}</span>
    </div>
  )
}

function AddSeat({ act }) {
  return (
    <button className="add-seat" onClick={() => act(actions.addPlayer(''))}>
      <span style={{ fontSize: 28 }}>＋</span>
      <span>Add seat</span>
    </button>
  )
}

function TurnPanel({ state, mode, act, bracket, online, members, onEnd }) {
  const active = state.players.find((p) => p.id === state.turn.activeId)
  const enforce = rulesOn(state)
  return (
    <div className="panel">
      <div className="side-head">
        <span className="col-head" style={{ margin: 0 }}>Turn {state.turn.number}</span>
        <span className="spacer" />
        {online && <span className="chip" title="Connected players">🟢 {members.length}</span>}
        <button className="ghost sm danger" onClick={onEnd}>End</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 8px' }}>
        {active && <span className="dot" style={{ background: active.color }} />}
        <span style={{ fontWeight: 600 }}>{active?.name || '—'}</span>
        <span className="chip" style={{ marginLeft: 'auto' }}>{phaseLabel(state.turn.phase)}</span>
      </div>

      {/* phase stepper */}
      <div className="phase-strip">
        {PHASES.map((ph) => (
          <span key={ph.key} className={`phase-dot${state.turn.phase === ph.key ? ' on' : ''}`} title={ph.label}>{ph.label[0]}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={{ flex: 1 }} onClick={() => act(actions.nextPhase())}>Next step ▸</button>
        <button className="primary" style={{ flex: 1 }} onClick={() => act(actions.nextTurn())}>Pass turn →</button>
      </div>

      <label className="rules-toggle">
        <input type="checkbox" checked={enforce} onChange={(e) => act(actions.setRules(e.target.checked))} />
        Enforce turn rules
        <span className="faint" title="One land per turn (with override) + auto draw step + untap">ⓘ</span>
      </label>

      <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
        {mode.label}{mode.format === 'commander' ? ` · ${COMMANDER_BRACKETS.find((b) => b.value === bracket)?.label || ''}` : ''}
      </div>
    </div>
  )
}

function DicePanel({ act, identity }) {
  const by = identity?.name || 'You'
  return (
    <div className="panel">
      <div className="col-head">Dice & coin</div>
      <div className="dice-row">
        {[6, 20].map((s) => (
          <button key={s} onClick={() => act(actions.rollDice(s, by))}>d{s}</button>
        ))}
        <button onClick={() => act(actions.rollDice(2, by))}>coin</button>
        <button onClick={() => act(actions.rollDice(100, by))}>d100</button>
      </div>
    </div>
  )
}

function LogPanel({ state, act, identity }) {
  const [msg, setMsg] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [state.log])

  function send() {
    const t = msg.trim()
    if (!t) return
    act(actions.chat(t, identity?.name || 'You'))
    setMsg('')
  }

  return (
    <div className="panel log-panel">
      <div className="col-head">Game log & chat</div>
      <div className="log-scroll" ref={scrollRef}>
        {state.log.map((e) => (
          <div key={e.id} className={`log-line ${e.kind}`}>
            {e.kind === 'chat'
              ? <><b>{e.by}:</b> {e.text}</>
              : <span className="faint">{e.text}</span>}
          </div>
        ))}
      </div>
      <div className="log-input">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="sm" onClick={send}>Send</button>
      </div>
    </div>
  )
}
