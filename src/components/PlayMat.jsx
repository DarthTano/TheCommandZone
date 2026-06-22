import { useState } from 'react'
import { Card } from './Card.jsx'
import { Modal } from './Modal.jsx'
import { useCardHover } from './CardHover.jsx'
import { ZONES, ZONE_LABELS, isLand } from '../lib/cardEngine.js'
import { rulesOn, LAND_LIMIT } from '../lib/gameTable.js'
import { useDecks, makeCardLookup } from '../state/DeckContext.jsx'
import { imageUris } from '../lib/scryfall.js'
import { commanderIdentity } from '../lib/formats.js'
import { actions } from '../lib/gameTable.js'

// The play surface. Opponents render read-only across the top; the seat you
// control renders interactive at the bottom with your hand + zone controls.
export function PlayMat({ state, act, cards, controlledPids, online }) {
  const { preview, bind } = useCardHover()
  const [browse, setBrowse] = useState(null) // { pid, zone }
  const [landPrompt, setLandPrompt] = useState(null) // { pid, iid, name }

  const activeId = state.turn.activeId
  const mePid = online
    ? controlledPids[0]
    : (controlledPids.includes(activeId) ? activeId : controlledPids[0])

  const players = state.players
  const me = players.find((p) => p.id === mePid)
  const opponents = players.filter((p) => p.id !== mePid)
  const enforce = rulesOn(state)

  // Play a card from hand to the battlefield, enforcing one land per turn.
  // Non-land plays and overrides go straight through.
  function playHandCard(pid, iid, toZone, force = false) {
    if (enforce && toZone === ZONES.BATTLEFIELD && !force) {
      const inst = cards.getPrivate(pid).hand.find((c) => c.iid === iid)
      const player = state.players.find((p) => p.id === pid)
      if (inst && isLand(inst) && (player?.landsThisTurn || 0) >= LAND_LIMIT) {
        setLandPrompt({ pid, iid, name: inst.name })
        return
      }
    }
    cards.playFromHand(pid, iid, toZone)
  }

  // translate a card menu / drop intent into a useTableCards call
  function handleAction(pid, zone, iid, type, arg) {
    switch (type) {
      case 'tap': return cards.tap(pid, iid)
      case 'counter': return cards.counter(pid, iid, arg)
      case 'play': return playHandCard(pid, iid, ZONES.BATTLEFIELD)
      case 'move':
        return zone === ZONES.HAND
          ? playHandCard(pid, iid, arg)
          : cards.moveZoneCard(pid, zone, arg, iid)
      case 'toHand': return cards.zoneToHand(pid, zone, iid)
      case 'toLibrary':
        return zone === ZONES.HAND
          ? cards.handToLibrary(pid, iid, arg)
          : cards.zoneToLibrary(pid, zone, iid, arg)
      default: return undefined
    }
  }

  function handleDrop(pid, toZone, e) {
    e.preventDefault()
    let data
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (!data?.iid) return
    const { iid, from } = data
    if (from === toZone) return
    if (from === ZONES.HAND) {
      if (toZone === ZONES.LIBRARY) cards.handToLibrary(pid, iid, 'top')
      else playHandCard(pid, iid, toZone)
    } else if (toZone === ZONES.HAND) {
      cards.zoneToHand(pid, from, iid)
    } else if (toZone === ZONES.LIBRARY) {
      cards.zoneToLibrary(pid, from, iid, 'top')
    } else {
      cards.moveZoneCard(pid, from, toZone, iid)
    }
  }

  return (
    <div className="playmat">
      {preview}
      <div className="opp-boards">
        {opponents.map((p) => (
          <OpponentBoard key={p.id} p={p} bind={bind} onBrowse={(zone) => setBrowse({ pid: p.id, zone })} />
        ))}
      </div>

      {me ? (
        <MyBoard
          me={me}
          mePid={mePid}
          cards={cards}
          act={act}
          bind={bind}
          onAction={handleAction}
          onDrop={handleDrop}
          onBrowse={(zone) => setBrowse({ pid: mePid, zone })}
        />
      ) : (
        <div className="empty" style={{ marginTop: 12 }}>Claim a seat (“sit”) to play your cards.</div>
      )}

      {browse && (
        <BrowseModal
          state={state}
          cards={cards}
          browse={browse}
          controllable={controlledPids.includes(browse.pid)}
          onAction={handleAction}
          onClose={() => setBrowse(null)}
        />
      )}

      {landPrompt && (
        <Modal title="Extra land this turn?" onClose={() => setLandPrompt(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            You’ve already played a land this turn. Some cards (Exploration, Azusa, fetchlands…) let you play more.
          </p>
          <p>Play <b>{landPrompt.name}</b> anyway?</p>
          <div className="row">
            <button className="ghost" onClick={() => setLandPrompt(null)}>Cancel</button>
            <button className="primary" onClick={() => { cards.playFromHand(landPrompt.pid, landPrompt.iid, ZONES.BATTLEFIELD); setLandPrompt(null) }}>
              Play extra land
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------- opponent (read-only) ----------------
function OpponentBoard({ p, bind, onBrowse }) {
  if (!p.loaded) {
    return <div className="board opp"><div className="board-head"><span className="dot" style={{ background: p.color }} />{p.name}<span className="faint" style={{ marginLeft: 6 }}>· no deck loaded</span></div></div>
  }
  return (
    <div className="board opp">
      <div className="board-head">
        <span className="dot" style={{ background: p.color }} /> {p.name}
        <span className="spacer" style={{ flex: 1 }} />
        <ZoneCounts p={p} onBrowse={onBrowse} compact />
      </div>
      <div className="battlefield read">
        {p.zones.battlefield.length === 0
          ? <span className="faint" style={{ fontSize: 12 }}>empty battlefield</span>
          : p.zones.battlefield.map((c) => (
              <Card key={c.iid} inst={c} zone={ZONES.BATTLEFIELD} controllable={false} bind={bind} size="sm" />
            ))}
      </div>
    </div>
  )
}

// ---------------- me (interactive) ----------------
function MyBoard({ me, mePid, cards, act, bind, onAction, onDrop, onBrowse }) {
  const priv = cards.getPrivate(mePid)
  const dropProps = (zone) => ({
    onDragOver: (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') },
    onDragLeave: (e) => e.currentTarget.classList.remove('drag-over'),
    onDrop: (e) => { e.currentTarget.classList.remove('drag-over'); onDrop(mePid, zone, e) },
  })

  if (!me.loaded) {
    return <LoadDeckPrompt mePid={mePid} cards={cards} act={act} />
  }

  return (
    <div className="board me">
      <div className="board-head">
        <span className="dot" style={{ background: me.color }} /> {me.name} <span className="chip" style={{ marginLeft: 6 }}>you</span>
        <span className="chip" title="Lands played this turn">🌳 {me.landsThisTurn || 0}/{LAND_LIMIT}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="sm" onClick={() => cards.draw(mePid, 1)}>＋ Draw</button>
        <button className="ghost sm" onClick={() => cards.shuffleLibrary(mePid)}>⤮ Shuffle</button>
        <button className="ghost sm" onClick={() => cards.mulligan(mePid)}>↻ Mulligan</button>
      </div>

      {/* battlefield (main drop target) */}
      <div className="battlefield" {...dropProps(ZONES.BATTLEFIELD)}>
        {me.zones.battlefield.length === 0
          ? <span className="faint drop-hint">Battlefield — play or drag cards here</span>
          : me.zones.battlefield.map((c) => (
              <Card key={c.iid} inst={c} zone={ZONES.BATTLEFIELD} controllable bind={bind}
                onAction={(t, a) => onAction(mePid, ZONES.BATTLEFIELD, c.iid, t, a)} />
            ))}
      </div>

      {/* zone piles */}
      <div className="zone-piles">
        <Pile label={`Library (${priv.library.length})`} zone={ZONES.LIBRARY} dropProps={dropProps(ZONES.LIBRARY)}
          onClick={() => onBrowse(ZONES.LIBRARY)} top={null} count={priv.library.length} faceDown />
        <Pile label={`Graveyard (${me.zones.graveyard.length})`} zone={ZONES.GRAVEYARD} dropProps={dropProps(ZONES.GRAVEYARD)}
          onClick={() => onBrowse(ZONES.GRAVEYARD)} top={me.zones.graveyard.at(-1)} count={me.zones.graveyard.length} />
        <Pile label={`Exile (${me.zones.exile.length})`} zone={ZONES.EXILE} dropProps={dropProps(ZONES.EXILE)}
          onClick={() => onBrowse(ZONES.EXILE)} top={me.zones.exile.at(-1)} count={me.zones.exile.length} />
        <Pile label={`Command (${me.zones.command.length})`} zone={ZONES.COMMAND} dropProps={dropProps(ZONES.COMMAND)}
          onClick={() => onBrowse(ZONES.COMMAND)} top={me.zones.command.at(-1)} count={me.zones.command.length} />
      </div>

      {/* hand */}
      <div className="hand-area" {...dropProps(ZONES.HAND)}>
        <div className="hand-label">Hand ({priv.hand.length})</div>
        <div className="hand-fan">
          {priv.hand.length === 0
            ? <span className="faint" style={{ fontSize: 13 }}>No cards in hand — draw from your library.</span>
            : priv.hand.map((c) => (
                <Card key={c.iid} inst={c} zone={ZONES.HAND} controllable bind={bind}
                  onAction={(t, a) => onAction(mePid, ZONES.HAND, c.iid, t, a)} />
              ))}
        </div>
      </div>
    </div>
  )
}

function Pile({ label, dropProps, onClick, top, count, faceDown }) {
  return (
    <div className="pile" {...dropProps} onClick={onClick} title={label}>
      <div className={`pile-card${faceDown ? ' facedown' : ''}`}>
        {!faceDown && top?.img
          ? <img src={top.img} alt="" draggable={false} />
          : <span className="pile-count">{count}</span>}
      </div>
      <div className="pile-label">{label}</div>
    </div>
  )
}

function ZoneCounts({ p, onBrowse, compact }) {
  const Z = [
    ['Lib', p.counts.library, ZONES.LIBRARY, false],
    ['Hand', p.counts.hand, ZONES.HAND, false],
    ['GY', p.zones.graveyard.length, ZONES.GRAVEYARD, true],
    ['Ex', p.zones.exile.length, ZONES.EXILE, true],
    ['Cmd', p.zones.command.length, ZONES.COMMAND, true],
  ]
  return (
    <span className="zone-counts">
      {Z.map(([lbl, n, zone, browseable]) => (
        <span key={lbl} className={`zc${browseable && n ? ' link' : ''}`}
          onClick={browseable && n ? () => onBrowse(zone) : undefined}>{lbl} {n}</span>
      ))}
    </span>
  )
}

function LoadDeckPrompt({ mePid, cards, act }) {
  const { decks } = useDecks()
  const [sel, setSel] = useState('')
  function load() {
    const deck = decks.find((d) => d.id === sel)
    if (!deck) return
    cards.loadDeck(mePid, deck)
    act(actions.setDeck(mePid, deckSummary(deck)))
  }
  return (
    <div className="board me load-prompt">
      <div className="col-head">Load your deck to play</div>
      {decks.length === 0 ? (
        <p className="muted">You have no saved decks yet. Build or import one on the <b>Decks</b> tab first.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Choose a deck…</option>
            {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="primary" disabled={!sel} onClick={load}>Load &amp; draw 7</button>
        </div>
      )}
    </div>
  )
}

function BrowseModal({ state, cards, browse, controllable, onAction, onClose }) {
  const { pid, zone } = browse
  const player = state.players.find((p) => p.id === pid)
  const list = zone === ZONES.LIBRARY
    ? cards.getPrivate(pid).library
    : (player?.zones?.[zone] || [])

  return (
    <Modal title={`${player?.name} · ${ZONE_LABELS[zone]} (${list.length})`} onClose={onClose} wide>
      {zone === ZONES.LIBRARY && controllable && (
        <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>Your library — only you can see this. Pick a card to move it out.</p>
      )}
      {list.length === 0 ? (
        <p className="muted">Empty.</p>
      ) : (
        <div className="browse-grid">
          {list.map((c) => (
            <div key={c.iid} className="browse-card">
              {c.img ? <img src={c.img} alt={c.name} /> : <div className="card-noimg">{c.name}</div>}
              {controllable && (
                <div className="browse-actions">
                  {zone !== ZONES.BATTLEFIELD && <button className="sm" onClick={() => { onAction(pid, zone, c.iid, 'move', ZONES.BATTLEFIELD); onClose() }}>Battlefield</button>}
                  <button className="ghost sm" onClick={() => { onAction(pid, zone, c.iid, 'toHand'); onClose() }}>Hand</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// commander art summary for the life pod (mirrors GameTable.deckSummary)
function deckSummary(deck) {
  const getCard = makeCardLookup(deck)
  const cmd = (deck.commanders || [])[0]
  const card = cmd ? getCard(cmd) : null
  return {
    name: deck.name,
    commander: cmd || null,
    art: card ? imageUris(card)?.art_crop || null : null,
    identity: card ? commanderIdentity([card]) : [],
  }
}
