import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { getCachedCard } from '../lib/scryfall.js'
import { DEFAULT_FORMAT } from '../lib/formats.js'

const STORE_KEY = 'manaforge.decks.v1'
const DeckCtx = createContext(null)
export const useDecks = () => useContext(DeckCtx)

const uid = () => Math.random().toString(36).slice(2, 10)
const nameKey = (n) => (n || '').trim().toLowerCase()

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return Array.isArray(data.decks) ? data.decks : []
  } catch {
    return []
  }
}

function blankDeck(name, format = DEFAULT_FORMAT) {
  return {
    id: uid(),
    name: name || 'Untitled Deck',
    format,
    commanders: [],
    cards: {}, // nameKey -> { name, qty, card }
    maybe: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function DeckProvider({ children }) {
  const [decks, setDecks] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ decks }))
    } catch {
      /* quota */
    }
  }, [decks])

  const mutate = useCallback((id, fn) => {
    setDecks((list) =>
      list.map((d) => (d.id === id ? { ...fn({ ...d }), updatedAt: Date.now() } : d)),
    )
  }, [])

  const api = useMemo(() => ({
    decks,
    getDeck: (id) => decks.find((d) => d.id === id),

    createDeck: (name, format) => {
      const d = blankDeck(name, format)
      setDecks((l) => [d, ...l])
      return d.id
    },

    importDeck: (name, format, resolved) => {
      const d = blankDeck(name, format)
      d.cards = resolved.cards || {}
      d.commanders = resolved.commanders || []
      d.maybe = resolved.maybe || {}
      setDecks((l) => [d, ...l])
      return d.id
    },

    duplicateDeck: (id) => {
      const src = decks.find((d) => d.id === id)
      if (!src) return null
      const copy = { ...structuredClone(src), id: uid(), name: `${src.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }
      setDecks((l) => [copy, ...l])
      return copy.id
    },

    deleteDeck: (id) => setDecks((l) => l.filter((d) => d.id !== id)),

    renameDeck: (id, name) => mutate(id, (d) => ({ ...d, name })),
    setFormat: (id, format) => mutate(id, (d) => ({ ...d, format })),

    addCard: (id, card, qty = 1, board = 'cards') =>
      mutate(id, (d) => {
        const k = nameKey(card.name)
        const bucket = { ...d[board] }
        if (bucket[k]) bucket[k] = { ...bucket[k], qty: bucket[k].qty + qty, card }
        else bucket[k] = { name: card.name, qty, card }
        return { ...d, [board]: bucket }
      }),

    setQty: (id, name, qty, board = 'cards') =>
      mutate(id, (d) => {
        const k = nameKey(name)
        const bucket = { ...d[board] }
        if (qty <= 0) delete bucket[k]
        else if (bucket[k]) bucket[k] = { ...bucket[k], qty }
        return { ...d, [board]: bucket }
      }),

    removeCard: (id, name, board = 'cards') =>
      mutate(id, (d) => {
        const bucket = { ...d[board] }
        delete bucket[nameKey(name)]
        return { ...d, [board]: bucket }
      }),

    // move a card between mainboard and maybeboard
    moveBoard: (id, name, from, to) =>
      mutate(id, (d) => {
        const k = nameKey(name)
        const src = { ...d[from] }
        const entry = src[k]
        if (!entry) return d
        delete src[k]
        const dst = { ...d[to] }
        if (dst[k]) dst[k] = { ...dst[k], qty: dst[k].qty + entry.qty }
        else dst[k] = entry
        return { ...d, [from]: src, [to]: dst }
      }),

    toggleCommander: (id, card) =>
      mutate(id, (d) => {
        const has = d.commanders.includes(card.name)
        let commanders
        if (has) commanders = d.commanders.filter((n) => n !== card.name)
        else commanders = [...d.commanders, card.name].slice(-2) // max 2 (partner)
        // ensure the chosen commander isn't also sitting in the 99
        const cards = { ...d.cards }
        delete cards[nameKey(card.name)]
        return { ...d, commanders, cards }
      }),
  }), [decks, mutate])

  return <DeckCtx.Provider value={api}>{children}</DeckCtx.Provider>
}

// Resolve a card object for a name: prefer the copy stored on the deck entry,
// fall back to the Scryfall localStorage cache.
export function makeCardLookup(deck) {
  return (name) => {
    const k = nameKey(name)
    return deck?.cards?.[k]?.card || deck?.maybe?.[k]?.card || getCachedCard(name)
  }
}
