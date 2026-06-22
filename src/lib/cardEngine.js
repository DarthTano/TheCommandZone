// Card engine — turns a saved deck into playable card instances and provides
// the zone vocabulary used across the play mat.
//
// A "card instance" is one physical card on the table. Many instances can share
// the same name (e.g. 35 Forests), so each gets a unique `iid`. Public zones
// (battlefield/graveyard/exile/command) live in the shared game state; the
// library and hand are private to the controlling client.

import { makeCardLookup } from '../state/DeckContext.jsx'
import { imageUris, primaryType } from './scryfall.js'

export const ZONES = {
  LIBRARY: 'library',
  HAND: 'hand',
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  EXILE: 'exile',
  COMMAND: 'command',
}

// public zones live in shared state (everyone sees them)
export const PUBLIC_ZONES = [ZONES.BATTLEFIELD, ZONES.GRAVEYARD, ZONES.EXILE, ZONES.COMMAND]
export const ZONE_LABELS = {
  library: 'Library', hand: 'Hand', battlefield: 'Battlefield',
  graveyard: 'Graveyard', exile: 'Exile', command: 'Command Zone',
}

let iidSeq = 0
export const newIid = () => `c${Date.now().toString(36)}${(iidSeq++).toString(36)}`

// Build a single card instance from a Scryfall card object.
export function instanceFromCard(card) {
  const img = imageUris(card)
  return {
    iid: newIid(),
    name: card.name,
    img: img?.normal || img?.large || null,
    type: primaryType(card),
    typeLine: card.type_line || card.card_faces?.[0]?.type_line || '',
    tapped: false,
    counters: 0,
    faceDown: false,
  }
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Expand a deck's mainboard into a shuffled library of instances, plus the
// commander(s) as command-zone instances. Returns { library, command }.
export function buildDeck(deck) {
  const getCard = makeCardLookup(deck)
  const library = []
  for (const entry of Object.values(deck.cards || {})) {
    const card = entry.card || getCard(entry.name)
    if (!card) continue
    for (let i = 0; i < (entry.qty || 0); i++) library.push(instanceFromCard(card))
  }
  const command = []
  for (const name of deck.commanders || []) {
    const card = getCard(name)
    if (card) command.push(instanceFromCard(card))
  }
  return { library: shuffle(library), command }
}

export const drawN = (library, n) => ({
  drawn: library.slice(0, n),
  rest: library.slice(n),
})

// Is this instance a land? (used for quick "play a land" affordances)
export const isLand = (inst) => (inst?.typeLine || '').includes('Land')
