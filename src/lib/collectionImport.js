// Collection import: turn a pasted list or a CSV export into owned-card entries
// ({ name, qty }), validated against Scryfall.

import { parseDecklist } from './decklist.js'
import { resolveCollection } from './scryfall.js'

// Pasted text list ("4 Sol Ring", "1x Atraxa (NEO) 12", section headers ignored).
export function parsePasteList(text) {
  const p = parseDecklist(text)
  const all = [...p.main, ...p.commander, ...p.maybe] // all lines are "owned"
  return { rows: all.map((e) => ({ name: e.name, qty: e.qty })), unparsed: p.unparsed }
}

// Minimal CSV → rows. Detects a "name" column and a count/quantity column from
// the header. Handles quoted fields containing commas/quotes. Aggregates by name.
export function parseCsv(text) {
  const lines = splitCsvRows(text)
  if (!lines.length) return { rows: [], unparsed: [] }
  const header = lines[0].map((h) => h.trim().toLowerCase())
  const nameIdx = header.findIndex((h) => h === 'name' || h.endsWith(' name') || h.includes('card'))
  const qtyIdx = header.findIndex((h) => /^(count|quantity|qty|owned|amount)$/.test(h) || h.includes('count') || h.includes('quantity'))
  if (nameIdx === -1) return { rows: [], unparsed: ['No "Name" column found in CSV header.'] }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
    const name = (cols[nameIdx] || '').trim()
    if (!name) continue
    const qty = qtyIdx >= 0 ? parseInt(cols[qtyIdx], 10) || 1 : 1
    rows.push({ name, qty })
  }
  return { rows, unparsed: [] }
}

// Split CSV text into rows of fields (RFC-4180-ish: handles "quoted, fields").
function splitCsvRows(text) {
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

// Resolve raw rows against Scryfall; aggregate duplicates by card.
// Returns { entries: [{card, qty}], unresolved: [name] } (default printing, non-foil).
export async function resolveRows(rows) {
  const wanted = [...new Set(rows.map((r) => r.name))]
  const { found, notFound } = await resolveCollection(wanted)
  const byCard = new Map() // card.id -> { card, qty }
  const unresolved = [...notFound]
  for (const r of rows) {
    const card = found.get(r.name.trim().toLowerCase())
    if (!card) { if (!unresolved.includes(r.name)) unresolved.push(r.name); continue }
    const cur = byCard.get(card.id)
    if (cur) cur.qty += r.qty || 1
    else byCard.set(card.id, { card, qty: r.qty || 1 })
  }
  return { entries: [...byCard.values()], unresolved: [...new Set(unresolved)] }
}
