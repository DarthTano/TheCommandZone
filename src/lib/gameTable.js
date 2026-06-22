// Shared game-table state: a PURE reducer + action helpers.
//
// The same reducer drives both the local pass-and-play table and the online
// (Supabase Realtime) table. Online play works by broadcasting fully-specified
// action objects and applying this identical pure reducer on every client, so
// all seats stay deterministically in sync. Any randomness (dice values) or id
// generation happens in the action *creators* below, never inside the reducer.

import { GAME_MODES } from './formats.js'

export const PLAYER_COLORS = ['#d3392c', '#3b88c3', '#51a868', '#e0913a', '#9b6cc6', '#d96aa8', '#46b6a8', '#c9b03a']

// Turn phases (soft turn structure). Entering "draw" auto-draws for the active
// seat; "Pass turn" untaps the new active player and resets their land drop.
export const PHASES = [
  { key: 'untap', label: 'Untap' },
  { key: 'upkeep', label: 'Upkeep' },
  { key: 'draw', label: 'Draw' },
  { key: 'main1', label: 'Main 1' },
  { key: 'combat', label: 'Combat' },
  { key: 'main2', label: 'Main 2' },
  { key: 'end', label: 'End' },
]
export const phaseLabel = (key) => PHASES.find((p) => p.key === key)?.label || 'Main 1'
// rules default ON unless explicitly disabled (also keeps older saves working)
export const rulesOn = (state) => state?.rulesEnforced !== false
export const LAND_LIMIT = 1

let logSeq = 0
const newLogId = () => `${Date.now().toString(36)}-${(logSeq++).toString(36)}`

export function makePlayer(id, name, mode, idx = 0) {
  return {
    id,
    name: name || `Player ${idx + 1}`,
    life: mode.startLife,
    poison: 0,
    cmdDmg: {}, // fromPlayerId -> commander damage taken
    landsThisTurn: 0, // for the one-land-per-turn guardrail
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    seatedBy: null, // online: presence key that controls this seat (null = open)
    deck: null, // { name, art, commander }
    // PUBLIC card zones (everyone sees these). Hand + library are PRIVATE and
    // live only on the controlling client; others see them as `counts`.
    zones: { battlefield: [], graveyard: [], exile: [], command: [] },
    counts: { library: 0, hand: 0 },
    loaded: false, // has this seat loaded a deck yet?
  }
}

export function initTable({ modeKey = 'commander', count = 4, bracket = 3, names = [] } = {}) {
  const mode = GAME_MODES[modeKey] || GAME_MODES.commander
  const players = Array.from({ length: count }, (_, i) =>
    makePlayer(`p${i + 1}`, names[i], mode, i),
  )
  return {
    modeKey,
    bracket,
    players,
    rulesEnforced: true, // soft turn rules: one land/turn + auto draw step
    // start on the opener's Main 1 so the player "on the play" skips their draw
    turn: { activeId: players[0]?.id || null, number: 1, phase: 'main1' },
    log: [logEntry('event', `Table started — ${mode.label}, ${count} players.`)],
    dice: null, // last roll { sides, value, by, id }
    startedAt: Date.now(),
  }
}

function logEntry(kind, text, by = null) {
  return { id: newLogId(), kind, text, by, t: Date.now() }
}
function pushLog(state, kind, text, by = null) {
  const log = [...state.log, logEntry(kind, text, by)]
  if (log.length > 80) log.splice(0, log.length - 80)
  return log
}
const nameOf = (state, id) => state.players.find((p) => p.id === id)?.name || '—'

export function modeOf(state) {
  return GAME_MODES[state.modeKey] || GAME_MODES.commander
}

export function isEliminated(state, p) {
  const mode = modeOf(state)
  if (p.life <= 0) return true
  if (p.poison >= mode.poison) return true
  if (mode.commanderDamage > 0 && Object.values(p.cmdDmg).some((d) => d >= mode.commanderDamage)) return true
  return false
}

// ---- the pure reducer ----
export function tableReducer(state, action) {
  const a = action
  switch (a.type) {
    case 'SNAPSHOT':
      return a.state

    case 'ADJUST_LIFE': {
      const players = state.players.map((p) =>
        p.id === a.pid ? { ...p, life: p.life + a.delta } : p,
      )
      return { ...state, players }
    }

    case 'SET_LIFE': {
      const players = state.players.map((p) =>
        p.id === a.pid ? { ...p, life: a.value } : p,
      )
      return { ...state, players }
    }

    case 'ADJUST_POISON': {
      const players = state.players.map((p) =>
        p.id === a.pid ? { ...p, poison: Math.max(0, p.poison + a.delta) } : p,
      )
      return { ...state, players }
    }

    case 'ADJUST_CMD': {
      // commander damage also reduces life by the same delta
      const players = state.players.map((p) => {
        if (p.id !== a.pid) return p
        const cur = p.cmdDmg[a.fromId] || 0
        return {
          ...p,
          cmdDmg: { ...p.cmdDmg, [a.fromId]: Math.max(0, cur + a.delta) },
          life: p.life - a.delta,
        }
      })
      return { ...state, players }
    }

    case 'RENAME': {
      const players = state.players.map((p) => (p.id === a.pid ? { ...p, name: a.name } : p))
      return { ...state, players }
    }

    case 'SET_DECK': {
      const players = state.players.map((p) => (p.id === a.pid ? { ...p, deck: a.deck } : p))
      const log = a.deck ? pushLog(state, 'event', `${nameOf(state, a.pid)} brought "${a.deck.name}".`) : state.log
      return { ...state, players, log }
    }

    case 'CLAIM_SEAT': {
      // online: a presence key takes ownership of a seat (and optionally renames)
      const players = state.players.map((p) =>
        p.id === a.pid ? { ...p, seatedBy: a.key, name: a.name || p.name } : p,
      )
      return { ...state, players, log: pushLog(state, 'event', `${a.name || nameOf(state, a.pid)} sat down.`) }
    }

    case 'RELEASE_SEATS': {
      // free any seats held by a presence key that left
      const players = state.players.map((p) => (p.seatedBy === a.key ? { ...p, seatedBy: null } : p))
      return { ...state, players }
    }

    case 'ADD_PLAYER': {
      const mode = modeOf(state)
      const p = makePlayer(a.pid, a.name, mode, state.players.length)
      return { ...state, players: [...state.players, p], log: pushLog(state, 'event', `${p.name} joined the table.`) }
    }

    case 'REMOVE_PLAYER': {
      const players = state.players.filter((p) => p.id !== a.pid)
      let turn = state.turn
      if (turn.activeId === a.pid) turn = { ...turn, activeId: players[0]?.id || null }
      return { ...state, players, turn }
    }

    case 'NEXT_TURN': {
      const ids = state.players.map((p) => p.id)
      if (!ids.length) return state
      const idx = ids.indexOf(state.turn.activeId)
      const nextIdx = (idx + 1) % ids.length
      const wrapped = nextIdx === 0
      const number = state.turn.number + (wrapped ? 1 : 0)
      const activeId = ids[nextIdx]
      const enforce = rulesOn(state)
      const players = state.players.map((p) => {
        if (p.id !== activeId) return p
        const np = { ...p, landsThisTurn: 0 } // reset the land drop each turn
        if (enforce) {
          // untap step: untap all of the new active player's permanents
          np.zones = { ...p.zones, battlefield: p.zones.battlefield.map((c) => (c.tapped ? { ...c, tapped: false } : c)) }
        }
        return np
      })
      return {
        ...state,
        players,
        turn: { activeId, number, phase: 'untap' },
        log: pushLog(state, 'event', `Turn ${number} — ${nameOf(state, activeId)} (untap).`),
      }
    }

    case 'NEXT_PHASE': {
      const order = PHASES.map((p) => p.key)
      const i = order.indexOf(state.turn.phase)
      if (i === order.length - 1 || i === -1) return tableReducer(state, { type: 'NEXT_TURN' })
      return { ...state, turn: { ...state.turn, phase: order[i + 1] } }
    }

    case 'SET_RULES':
      return {
        ...state,
        rulesEnforced: a.value,
        log: pushLog(state, 'event', `Turn rules ${a.value ? 'enabled' : 'disabled'}.`),
      }

    case 'SET_ACTIVE':
      return { ...state, turn: { ...state.turn, activeId: a.pid } }

    case 'ROLL_DICE':
      // value computed by the action creator so all clients agree
      return {
        ...state,
        dice: { sides: a.sides, value: a.value, by: a.by, id: a.id },
        log: pushLog(state, 'event', `🎲 ${a.by || 'Someone'} rolled d${a.sides} → ${a.value}.`),
      }

    case 'CHAT':
      return { ...state, log: pushLog(state, 'chat', a.text, a.by) }

    case 'UPDATE_SEAT': {
      // The controlling client is the sole writer of its own public zones +
      // counts. We just assign what it sends. Optional log line for the action.
      const players = state.players.map((p) =>
        p.id === a.pid
          ? { ...p, zones: a.zones, counts: a.counts, loaded: a.loaded ?? p.loaded, landsThisTurn: a.landsThisTurn ?? p.landsThisTurn }
          : p,
      )
      const log = a.note ? pushLog(state, 'event', a.note) : state.log
      return { ...state, players, log }
    }

    case 'TAP_CARD': {
      const players = state.players.map((p) => {
        if (p.id !== a.pid) return p
        const battlefield = p.zones.battlefield.map((c) =>
          c.iid === a.iid ? { ...c, tapped: a.tapped } : c,
        )
        return { ...p, zones: { ...p.zones, battlefield } }
      })
      return { ...state, players }
    }

    case 'COUNTER_CARD': {
      const players = state.players.map((p) => {
        if (p.id !== a.pid) return p
        const battlefield = p.zones.battlefield.map((c) =>
          c.iid === a.iid ? { ...c, counters: Math.max(0, (c.counters || 0) + a.delta) } : c,
        )
        return { ...p, zones: { ...p.zones, battlefield } }
      })
      return { ...state, players }
    }

    case 'RESET_TABLE':
      return initTable({ modeKey: a.modeKey, count: a.count, bracket: a.bracket })

    default:
      return state
  }
}

// ---- action creators (handle ids / randomness up front) ----
export const actions = {
  adjustLife: (pid, delta) => ({ type: 'ADJUST_LIFE', pid, delta }),
  setLife: (pid, value) => ({ type: 'SET_LIFE', pid, value }),
  adjustPoison: (pid, delta) => ({ type: 'ADJUST_POISON', pid, delta }),
  adjustCmd: (pid, fromId, delta) => ({ type: 'ADJUST_CMD', pid, fromId, delta }),
  rename: (pid, name) => ({ type: 'RENAME', pid, name }),
  setDeck: (pid, deck) => ({ type: 'SET_DECK', pid, deck }),
  claimSeat: (pid, key, name) => ({ type: 'CLAIM_SEAT', pid, key, name }),
  releaseSeats: (key) => ({ type: 'RELEASE_SEATS', key }),
  addPlayer: (name) => ({ type: 'ADD_PLAYER', pid: `p${Math.random().toString(36).slice(2, 8)}`, name }),
  removePlayer: (pid) => ({ type: 'REMOVE_PLAYER', pid }),
  nextTurn: () => ({ type: 'NEXT_TURN' }),
  setActive: (pid) => ({ type: 'SET_ACTIVE', pid }),
  rollDice: (sides, by) => ({
    type: 'ROLL_DICE', sides, by,
    value: 1 + Math.floor(Math.random() * sides),
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  }),
  chat: (text, by) => ({ type: 'CHAT', text, by }),
  updateSeat: (pid, zones, counts, { loaded, note, landsThisTurn } = {}) =>
    ({ type: 'UPDATE_SEAT', pid, zones, counts, loaded, note, landsThisTurn }),
  tapCard: (pid, iid, tapped) => ({ type: 'TAP_CARD', pid, iid, tapped }),
  counterCard: (pid, iid, delta) => ({ type: 'COUNTER_CARD', pid, iid, delta }),
  nextPhase: () => ({ type: 'NEXT_PHASE' }),
  setRules: (value) => ({ type: 'SET_RULES', value }),
  reset: (modeKey, count, bracket) => ({ type: 'RESET_TABLE', modeKey, count, bracket }),
  snapshot: (state) => ({ type: 'SNAPSHOT', state }),
}
