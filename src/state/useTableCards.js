// useTableCards — owns the PRIVATE card zones (library + hand) for the seats
// this client controls, and bridges every action to the shared public state.
//
//  - online: controlledPids = [your claimed seat]  (your hand is yours alone)
//  - local pass-&-play: controlledPids = all seats  (one device)
//
// Public moves go through `act(actions.updateSeat / tapCard / counterCard)` so
// the rest of the room sees them; private moves (draw, hand→library) only emit
// updated counts. Private zones persist to localStorage so a refresh restores
// your hand and library order.

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildDeck, drawN, shuffle, ZONES, isLand } from '../lib/cardEngine.js'
import { actions, rulesOn } from '../lib/gameTable.js'

const OPENING_HAND = 7
const privKey = (roomKey, pid) => `manaforge.cards.${roomKey}.${pid}`

const emptyZones = () => ({ battlefield: [], graveyard: [], exile: [], command: [] })

export function useTableCards({ state, act, controlledPids, roomKey = 'local' }) {
  // priv: { [pid]: { library: [inst], hand: [inst] } }
  const [priv, setPriv] = useState({})
  const stateRef = useRef(state)
  stateRef.current = state

  // hydrate persisted private zones for the seats we control.
  // NOTE: controlledPids is a fresh array each render, so depend on a stable
  // string key and only update state when something actually hydrated.
  const pidsKey = controlledPids.join(',')
  useEffect(() => {
    setPriv((cur) => {
      let changed = false
      const next = { ...cur }
      for (const pid of controlledPids) {
        if (next[pid]) continue
        try {
          const saved = JSON.parse(localStorage.getItem(privKey(roomKey, pid)) || 'null')
          if (saved) { next[pid] = saved; changed = true }
        } catch { /* ignore */ }
      }
      return changed ? next : cur
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pidsKey, roomKey])

  const persist = (pid, zonesPriv) => {
    try { localStorage.setItem(privKey(roomKey, pid), JSON.stringify(zonesPriv)) } catch { /* quota */ }
  }

  const pubZones = (pid) =>
    stateRef.current?.players.find((p) => p.id === pid)?.zones || emptyZones()
  const nameOf = (pid) => stateRef.current?.players.find((p) => p.id === pid)?.name || 'Player'

  // central commit: set private zones + broadcast public zones + counts
  const commit = useCallback((pid, { library, hand, zones, note, loaded, landsThisTurn }) => {
    const lib = library ?? priv[pid]?.library ?? []
    const hnd = hand ?? priv[pid]?.hand ?? []
    const nextPriv = { library: lib, hand: hnd }
    setPriv((cur) => ({ ...cur, [pid]: nextPriv }))
    persist(pid, nextPriv)
    act(actions.updateSeat(pid, zones ?? pubZones(pid), { library: lib.length, hand: hnd.length }, { loaded, note, landsThisTurn }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, priv, roomKey])

  // ---- deck lifecycle ----
  const loadDeck = useCallback((pid, deck) => {
    const { library, command } = buildDeck(deck)
    const { drawn, rest } = drawN(library, OPENING_HAND)
    commit(pid, {
      library: rest,
      hand: drawn,
      zones: { ...emptyZones(), command },
      loaded: true,
      note: `${nameOf(pid)} loaded "${deck.name}" and drew ${OPENING_HAND}.`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit])

  const draw = useCallback((pid, n = 1, note) => {
    const cur = priv[pid]; if (!cur) return
    const { drawn, rest } = drawN(cur.library, n)
    if (!drawn.length) return
    commit(pid, { library: rest, hand: [...cur.hand, ...drawn], note: note || `${nameOf(pid)} drew ${drawn.length}.` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  const mulligan = useCallback((pid) => {
    const cur = priv[pid]; if (!cur) return
    const lib = shuffle([...cur.library, ...cur.hand])
    const { drawn, rest } = drawN(lib, OPENING_HAND)
    commit(pid, { library: rest, hand: drawn, note: `${nameOf(pid)} mulliganed.` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  const shuffleLibrary = useCallback((pid) => {
    const cur = priv[pid]; if (!cur) return
    commit(pid, { library: shuffle(cur.library), note: `${nameOf(pid)} shuffled.` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  // ---- hand → public zone ----
  const playFromHand = useCallback((pid, iid, zone = ZONES.BATTLEFIELD) => {
    const cur = priv[pid]; if (!cur) return
    const card = cur.hand.find((c) => c.iid === iid); if (!card) return
    const hand = cur.hand.filter((c) => c.iid !== iid)
    const z = pubZones(pid)
    const placed = { ...card, tapped: false }
    // playing a land to the battlefield counts toward the one-land-per-turn limit
    let landsThisTurn
    if (zone === ZONES.BATTLEFIELD && isLand(card)) {
      const player = stateRef.current?.players.find((p) => p.id === pid)
      landsThisTurn = (player?.landsThisTurn || 0) + 1
    }
    commit(pid, {
      hand,
      zones: { ...z, [zone]: [...z[zone], placed] },
      landsThisTurn,
      note: zone === ZONES.BATTLEFIELD ? `${nameOf(pid)} played ${card.name}.` : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  // ---- hand → library (private) ----
  const handToLibrary = useCallback((pid, iid, where = 'top') => {
    const cur = priv[pid]; if (!cur) return
    const card = cur.hand.find((c) => c.iid === iid); if (!card) return
    const hand = cur.hand.filter((c) => c.iid !== iid)
    const library = where === 'top' ? [card, ...cur.library] : [...cur.library, card]
    commit(pid, { hand, library })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  // ---- public zone → private hand ----
  const zoneToHand = useCallback((pid, fromZone, iid) => {
    const cur = priv[pid] || { library: [], hand: [] }
    const z = pubZones(pid)
    const card = z[fromZone]?.find((c) => c.iid === iid); if (!card) return
    const zones = { ...z, [fromZone]: z[fromZone].filter((c) => c.iid !== iid) }
    commit(pid, { hand: [...cur.hand, { ...card, tapped: false }], zones })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  // ---- public zone → library (private) ----
  const zoneToLibrary = useCallback((pid, fromZone, iid, where = 'top') => {
    const cur = priv[pid] || { library: [], hand: [] }
    const z = pubZones(pid)
    const card = z[fromZone]?.find((c) => c.iid === iid); if (!card) return
    const clean = { ...card, tapped: false }
    const library = where === 'top' ? [clean, ...cur.library] : [...cur.library, clean]
    const zones = { ...z, [fromZone]: z[fromZone].filter((c) => c.iid !== iid) }
    commit(pid, { library, zones })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priv, commit])

  // ---- public → public ----
  const moveZoneCard = useCallback((pid, fromZone, toZone, iid) => {
    if (fromZone === toZone) return
    const z = pubZones(pid)
    const card = z[fromZone]?.find((c) => c.iid === iid); if (!card) return
    const placed = { ...card, tapped: toZone === ZONES.BATTLEFIELD ? card.tapped : false }
    const zones = {
      ...z,
      [fromZone]: z[fromZone].filter((c) => c.iid !== iid),
      [toZone]: [...z[toZone], placed],
    }
    commit(pid, { zones })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit])

  // ---- battlefield in-place ----
  const tap = useCallback((pid, iid) => {
    const z = pubZones(pid)
    const card = z.battlefield.find((c) => c.iid === iid); if (!card) return
    act(actions.tapCard(pid, iid, !card.tapped))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act])

  const counter = useCallback((pid, iid, delta) => act(actions.counterCard(pid, iid, delta)), [act])

  // ---- auto draw step ----
  // When the active player (a seat we control) reaches the Draw step, draw 1.
  // We seed the first observed turn so we never auto-draw on mount/resume, which
  // also makes the player "on the play" (who starts on Main 1) skip their draw.
  const drawnRef = useRef(null)
  const turnKey = state ? `${state.turn.activeId}#${state.turn.number}` : ''
  useEffect(() => {
    if (!state) return
    if (drawnRef.current === null) {
      drawnRef.current = { __seeded: turnKey } // skip the opening/resumed turn
      return
    }
    if (!rulesOn(state)) return
    if (state.turn.phase !== 'draw') return
    if (!controlledPids.includes(state.turn.activeId)) return
    const player = state.players.find((p) => p.id === state.turn.activeId)
    if (!player?.loaded) return
    if (drawnRef.current[turnKey]) return
    drawnRef.current[turnKey] = true
    draw(state.turn.activeId, 1, `${player.name} drew for turn.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, state?.turn?.phase, state?.rulesEnforced, pidsKey, draw])

  const getPrivate = (pid) => priv[pid] || { library: [], hand: [] }

  return {
    getPrivate,
    loadDeck, draw, mulligan, shuffleLibrary,
    playFromHand, handToLibrary,
    zoneToHand, zoneToLibrary, moveZoneCard,
    tap, counter,
  }
}
