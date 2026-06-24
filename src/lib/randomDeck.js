// Generate a random, color-identity-legal Commander deck:
// a random legendary commander + 99 cards within its color identity,
// commander-legal, with a land base (popular nonbasics + basics to fill).

import { randomCard, searchCards, resolveCollection } from './scryfall.js'

const BASIC_FOR = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Returns { name, commanders:[name], cards: {nameKey:{name,qty,card}} } ready for
// DeckContext.importDeck(name, 'commander', result).
export async function generateRandomCommanderDeck() {
  const commander = await randomCard('is:commander')
  if (!commander) throw new Error('Could not fetch a commander from Scryfall.')

  const ci = commander.color_identity || []
  const idStr = ci.map((c) => c.toLowerCase()).join('') || 'c'

  // popular cards within identity (edhrec order biases toward playable cards)
  const nonland = await searchCards(`legal:commander -t:land id<=${idStr}`, { order: 'edhrec', dir: 'desc' })
  const lands = await searchCards(`legal:commander t:land -t:basic id<=${idStr}`, { order: 'edhrec', dir: 'desc' })

  const cards = {}
  const used = new Set([commander.name.toLowerCase()])
  const addCard = (c, qty = 1) => {
    const k = c.name.toLowerCase()
    if (used.has(k)) return false
    used.add(k)
    cards[k] = { name: c.name, qty, card: c }
    return true
  }

  // ~63 nonland spells (singleton)
  let nNon = 0
  for (const c of shuffle(nonland.cards)) { if (nNon >= 63) break; if (addCard(c)) nNon++ }

  // up to 16 nonbasic lands
  let nLand = 0
  for (const c of shuffle(lands.cards)) { if (nLand >= 16) break; if (addCard(c)) nLand++ }

  // fill the rest with basics, distributed across the commander's colors
  const basicsNeeded = Math.max(0, 99 - nNon - nLand)
  const basicNames = ci.length ? ci.map((c) => BASIC_FOR[c]) : ['Wastes']
  const dist = {}
  for (let i = 0; i < basicsNeeded; i++) {
    const bn = basicNames[i % basicNames.length]
    dist[bn] = (dist[bn] || 0) + 1
  }
  const { found } = await resolveCollection(Object.keys(dist))
  for (const [name, qty] of Object.entries(dist)) {
    cards[name.toLowerCase()] = { name, qty, card: found.get(name.toLowerCase()) || null }
  }

  return { name: `${commander.name} (random)`, commanders: [commander.name], cards }
}
