// Format / game-mode registry + deck legality validation.
//
// Two related concepts live here:
//  - FORMATS: deck-construction rules (size, singleton, color identity, banlist).
//    Banlist data comes straight from each card's Scryfall `legalities` map.
//  - GAME_MODES: how a table is played (starting life, commander damage, teams).
//    These drive the Phase-2 shared tracker defaults.

import { WUBRG, primaryType } from './scryfall.js'

// Scryfall legalities key per format → used to read card.legalities[key]
export const FORMATS = {
  commander: {
    key: 'commander', label: 'Commander', legalityKey: 'commander',
    deckSize: 100, exact: true, singleton: true, commander: true,
    maxCopies: 1, basicLandsUnlimited: true,
    blurb: '100-card singleton, color identity locked to your commander.',
  },
  brawl: {
    key: 'brawl', label: 'Brawl', legalityKey: 'brawl',
    deckSize: 100, exact: true, singleton: true, commander: true,
    maxCopies: 1, basicLandsUnlimited: true,
    blurb: '100-card singleton Commander on the Standard card pool.',
  },
  standard: {
    key: 'standard', label: 'Standard', legalityKey: 'standard',
    deckSize: 60, min: true, singleton: false, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, max 4 copies, current Standard sets.',
  },
  pioneer: {
    key: 'pioneer', label: 'Pioneer', legalityKey: 'pioneer',
    deckSize: 60, min: true, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, max 4 copies, Return to Ravnica forward.',
  },
  modern: {
    key: 'modern', label: 'Modern', legalityKey: 'modern',
    deckSize: 60, min: true, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, max 4 copies, 8th Edition forward.',
  },
  pauper: {
    key: 'pauper', label: 'Pauper', legalityKey: 'pauper',
    deckSize: 60, min: true, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, commons only.',
  },
  legacy: {
    key: 'legacy', label: 'Legacy', legalityKey: 'legacy',
    deckSize: 60, min: true, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, nearly every set legal.',
  },
  vintage: {
    key: 'vintage', label: 'Vintage', legalityKey: 'vintage',
    deckSize: 60, min: true, maxCopies: 4, basicLandsUnlimited: true,
    blurb: '60+ cards, restricted list allows 1 copy of certain cards.',
  },
}

export const FORMAT_LIST = Object.values(FORMATS)
export const DEFAULT_FORMAT = 'commander'

// ---- game modes (table rules; mainly Phase 2) ----
export const GAME_MODES = {
  commander: {
    key: 'commander', label: 'Commander (EDH)', startLife: 40,
    commanderDamage: 21, poison: 10, players: '3–6 free-for-all', team: false,
    format: 'commander',
  },
  commander1v1: {
    key: 'commander1v1', label: 'Commander 1v1', startLife: 30,
    commanderDamage: 21, poison: 10, players: '2 (duel)', team: false,
    format: 'commander',
  },
  brawl: {
    key: 'brawl', label: 'Brawl', startLife: 25,
    commanderDamage: 21, poison: 10, players: '2', team: false, format: 'brawl',
  },
  twoHeadedGiant: {
    key: 'twoHeadedGiant', label: 'Two-Headed Giant', startLife: 30,
    commanderDamage: 21, poison: 15, players: '2v2 teams', team: true, sharedLife: true,
    format: 'commander',
  },
  archenemy: {
    key: 'archenemy', label: 'Archenemy', startLife: 40,
    commanderDamage: 21, poison: 10, players: '1 vs many', team: true,
    format: 'commander', note: 'Archenemy starts at 40; allies often 20 each.',
  },
  standard: {
    key: 'standard', label: 'Standard / 60-card', startLife: 20,
    commanderDamage: 0, poison: 10, players: '2', team: false, format: 'standard',
  },
  freeform: {
    key: 'freeform', label: 'Freeform', startLife: 20,
    commanderDamage: 0, poison: 10, players: 'any', team: false, format: null,
  },
}
export const GAME_MODE_LIST = Object.values(GAME_MODES)

// Commander bracket / power-level tags (WotC's 2024 bracket system).
export const COMMANDER_BRACKETS = [
  { value: 1, label: '1 · Exhibition' },
  { value: 2, label: '2 · Core' },
  { value: 3, label: '3 · Upgraded' },
  { value: 4, label: '4 · Optimized' },
  { value: 5, label: '5 · cEDH' },
]

const isBasicLand = (card) =>
  (card?.type_line || '').includes('Basic') && (card?.type_line || '').includes('Land')

// Deck shape: { format, commanders: [name...], cards: { [name]: { qty, card } }, ... }
// `cardsResolved` is a map of nameKey -> Scryfall card object (may be partial/empty).
export function validateDeck(deck, getCard) {
  const fmt = FORMATS[deck.format] || FORMATS.commander
  const violations = []
  const warnings = []

  const entries = Object.values(deck.cards || {})
  const commanders = (deck.commanders || [])
    .map((n) => getCard(n))
    .filter(Boolean)

  // --- count cards (commanders count toward the 100 in Commander) ---
  let total = 0
  for (const e of entries) total += e.qty || 0
  if (fmt.commander) total += deck.commanders?.length || 0

  // --- size ---
  if (fmt.exact && total !== fmt.deckSize) {
    violations.push(`Deck has ${total} cards; ${fmt.label} requires exactly ${fmt.deckSize}.`)
  } else if (fmt.min && total < fmt.deckSize) {
    violations.push(`Deck has ${total} cards; ${fmt.label} requires at least ${fmt.deckSize}.`)
  }

  // --- copies / singleton ---
  for (const e of entries) {
    const card = e.card || getCard(e.name)
    const basicOk = fmt.basicLandsUnlimited && card && isBasicLand(card)
    if (basicOk) continue
    const max = fmt.singleton ? 1 : fmt.maxCopies || 4
    if ((e.qty || 0) > max) {
      violations.push(`${e.name}: ${e.qty} copies (max ${max} in ${fmt.label}).`)
    }
  }

  // --- banlist via Scryfall legalities ---
  for (const e of entries) {
    const card = e.card || getCard(e.name)
    if (!card) {
      warnings.push(`${e.name}: not resolved yet — legality unknown.`)
      continue
    }
    const status = card.legalities?.[fmt.legalityKey]
    if (status === 'banned') violations.push(`${e.name} is banned in ${fmt.label}.`)
    else if (status === 'restricted' && (e.qty || 0) > 1)
      violations.push(`${e.name} is restricted in ${fmt.label} (max 1).`)
    else if (status === 'not_legal')
      violations.push(`${e.name} is not legal in ${fmt.label}.`)
  }

  // --- commander-specific rules ---
  if (fmt.commander) {
    if ((deck.commanders?.length || 0) === 0) {
      warnings.push('No commander chosen.')
    }
    // each commander must be a legendary creature (or "can be your commander")
    for (const c of commanders) {
      const line = c.type_line || ''
      const canCmd = (c.oracle_text || '').includes('can be your commander')
      const legendaryCreature = line.includes('Legendary') && line.includes('Creature')
      const planeswalkerCmd = line.includes('Legendary') && line.includes('Planeswalker') && canCmd
      if (!legendaryCreature && !planeswalkerCmd && !canCmd) {
        violations.push(`${c.name} can't be a commander (needs a legendary creature or "can be your commander").`)
      }
    }
    if ((deck.commanders?.length || 0) > 2) {
      violations.push('A maximum of two commanders (Partner) is allowed.')
    }
    // --- color identity lock ---
    const identity = commanderIdentity(commanders)
    const idSet = new Set(identity)
    for (const e of entries) {
      const card = e.card || getCard(e.name)
      if (!card) continue
      const ci = card.color_identity || []
      const offColor = ci.filter((c) => !idSet.has(c))
      if (offColor.length) {
        violations.push(`${e.name} (${ci.join('')}) breaks color identity ${identity.join('') || 'colorless'}.`)
      }
    }
  }

  return {
    legal: violations.length === 0,
    violations,
    warnings,
    total,
    needed: fmt.deckSize,
    format: fmt,
  }
}

export function commanderIdentity(commanderCards) {
  const set = new Set()
  for (const c of commanderCards || []) (c.color_identity || []).forEach((x) => set.add(x))
  return WUBRG.filter((c) => set.has(c))
}

// Aggregate deck identity from all cards (used for the color bar / display).
export function deckColorBreakdown(entries, getCard) {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  for (const e of entries) {
    const card = e.card || getCard(e.name)
    if (!card) continue
    const ci = card.color_identity || []
    if (ci.length === 0) counts.C += e.qty || 0
    else ci.forEach((c) => { if (counts[c] != null) counts[c] += e.qty || 0 })
  }
  return counts
}

// Mana-curve buckets 0..7+ counting only non-land spells.
export function manaCurve(entries, getCard) {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0] // index 7 == 7+
  for (const e of entries) {
    const card = e.card || getCard(e.name)
    if (!card) continue
    if (primaryType(card) === 'Land') continue
    const cmc = Math.floor(card.cmc || 0)
    buckets[Math.min(cmc, 7)] += e.qty || 0
  }
  return buckets
}
