// Decklist import/export.
//
// Handles the common export formats from MTGA, Moxfield, Archidekt, TappedOut, etc:
//   "1 Sol Ring"
//   "1x Sol Ring"
//   "1 Sol Ring (C21) 263"            <- MTGA / set+collector
//   "1 Sol Ring (C21) 263 *F*"        <- foil marker
//   "SB: 1 Sol Ring"                  <- sideboard / maybeboard prefix
//   "// Commander" or "Commander"      <- section headers
//   "1 Atraxa, Praetors' Voice"        in a Commander section -> commander
//
// resolveDecklist() turns parsed lines into a deck.cards map using Scryfall.

import { resolveCollection } from './scryfall.js'

const SECTION_RE =
  /^(\/\/\s*)?(commander|commanders|deck|mainboard|main|maybeboard|maybe|sideboard|companion|tokens?)\s*:?\s*$/i

// "1 Sol Ring (C21) 263 *F*"  ->  { qty, name, set, collector }
const LINE_RE =
  /^(?:(SB|MB):\s*)?(\d+)\s*[xX]?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?)?\s*(\*[A-Z]+\*)?\s*$/

export function parseDecklist(text) {
  const lines = (text || '').split(/\r?\n/)
  let section = 'main' // main | commander | maybe | sideboard | companion
  const main = []
  const commander = []
  const maybe = []
  const unparsed = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) continue // comments

    const sec = line.match(SECTION_RE)
    if (sec) {
      const w = sec[2].toLowerCase()
      if (w.startsWith('commander')) section = 'commander'
      else if (w.startsWith('maybe')) section = 'maybe'
      else if (w.startsWith('side')) section = 'maybe'
      else if (w.startsWith('companion')) section = 'commander'
      else section = 'main'
      continue
    }

    const m = line.match(LINE_RE)
    if (!m) {
      unparsed.push(line)
      continue
    }
    const prefix = m[1] // SB / MB
    const qty = parseInt(m[2], 10) || 1
    const name = cleanName(m[3])
    const entry = { qty, name, set: m[4] || null, collector: m[5] || null }

    if (prefix === 'SB' || prefix === 'MB' || section === 'maybe') maybe.push(entry)
    else if (section === 'commander') commander.push(entry)
    else main.push(entry)
  }

  return { main, commander, maybe, unparsed }
}

function cleanName(n) {
  // strip trailing foil markers / category tags some sites add
  return n.replace(/\s*\*[A-Z]+\*\s*$/i, '').replace(/\s*\[[^\]]*\]\s*$/g, '').trim()
}

// Resolve a parsed list against Scryfall and build a deck-ready structure.
// Returns { cards: {nameKey:{name,qty,card}}, commanders:[name], maybe:{...},
//           unresolved:[name], unparsed:[line], counts:{main,commander} }
export async function resolveDecklist(parsed) {
  const allNames = [
    ...parsed.main.map((e) => e.name),
    ...parsed.commander.map((e) => e.name),
    ...parsed.maybe.map((e) => e.name),
  ]
  const uniq = [...new Set(allNames)]
  const { found, notFound } = await resolveCollection(uniq)
  const key = (n) => n.trim().toLowerCase()

  const cards = {}
  const unresolved = []

  const add = (target, e) => {
    const card = found.get(key(e.name))
    if (!card) {
      if (!unresolved.includes(e.name)) unresolved.push(e.name)
      return
    }
    const k = key(card.name)
    if (target[k]) target[k].qty += e.qty
    else target[k] = { name: card.name, qty: e.qty, card }
  }

  for (const e of parsed.main) add(cards, e)
  const maybe = {}
  for (const e of parsed.maybe) add(maybe, e)

  const commanders = []
  for (const e of parsed.commander) {
    const card = found.get(key(e.name))
    if (!card) {
      if (!unresolved.includes(e.name)) unresolved.push(e.name)
      continue
    }
    if (!commanders.includes(card.name)) commanders.push(card.name)
  }

  return {
    cards,
    commanders,
    maybe,
    unresolved: [...new Set([...unresolved, ...notFound])],
    unparsed: parsed.unparsed,
    counts: {
      main: Object.values(cards).reduce((s, e) => s + e.qty, 0),
      commander: commanders.length,
    },
  }
}

// Export a deck back to plain text (Moxfield/MTGA-compatible).
export function exportDecklist(deck, getCard) {
  const lines = []
  if (deck.commanders?.length) {
    lines.push('Commander')
    for (const name of deck.commanders) lines.push(`1 ${name}`)
    lines.push('')
    lines.push('Deck')
  }
  const entries = Object.values(deck.cards || {}).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const e of entries) lines.push(`${e.qty} ${e.name}`)

  const maybe = Object.values(deck.maybe || {})
  if (maybe.length) {
    lines.push('')
    lines.push('Maybeboard')
    for (const e of maybe.sort((a, b) => a.name.localeCompare(b.name)))
      lines.push(`${e.qty} ${e.name}`)
  }
  return lines.join('\n')
}
