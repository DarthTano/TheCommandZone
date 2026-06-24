import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase, isCloud } from '../lib/supabase.js'
import { resolveCollection } from '../lib/scryfall.js'
import { useAuth } from './AuthContext.jsx'
import { useToast } from './ToastContext.jsx'

// Owned-card collection, tracked per PRINTING + foil. Map key = the Scryfall
// printing id (plus "_f" for foil); unresolved cards fall back to "name:<name>".
// Entry: { id, name, set, collector, foil, qty, bin }. Persists to localStorage
// (guest) / the user_decks.collection JSONB column (logged in).

const STORE_KEY = 'manaforge.collection.v1'
const CollCtx = createContext(null)
export const useCollection = () => useContext(CollCtx)

export const BINS = [
  { key: 'unsorted', label: 'Unsorted', icon: '📥' },
  { key: 'deck', label: 'In a deck', icon: '🃏' },
  { key: 'want', label: 'Want', icon: '⭐' },
  { key: 'bulk', label: 'Bulk', icon: '📦' },
  { key: 'trade', label: 'Trade', icon: '🔁' },
]
export const binLabel = (key) => BINS.find((b) => b.key === key)?.label || 'Unsorted'

const nameKey = (n) => (n || '').trim().toLowerCase()
const keyFor = (card, foil) => (foil ? `${card.id}_f` : card.id)
const entryFromCard = (card, foil, qty, bin) => ({
  id: card.id, name: card.name, set: card.set, collector: card.collector_number,
  foil: !!foil, qty, bin: bin || 'unsorted',
})

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return data && typeof data === 'object' ? data.cards || {} : {}
  } catch {
    return {}
  }
}

// Migrate old name-only entries ({name,qty,bin}, no `id`) to per-printing entries
// by resolving each name to its default printing. Idempotent; lossless (anything
// that can't resolve keeps a "name:" entry).
async function normalizeCollection(map) {
  const entries = Object.entries(map)
  const old = entries.filter(([, e]) => e && e.id === undefined)
  if (!old.length) return { map, changed: false }

  const names = [...new Set(old.map(([, e]) => e.name).filter(Boolean))]
  let found = new Map()
  try { ({ found } = await resolveCollection(names)) } catch { /* offline: keep as-is below */ }

  const next = {}
  for (const [k, e] of entries) if (e && e.id !== undefined) next[k] = e // already migrated
  for (const [, e] of old) {
    const card = found.get(nameKey(e.name))
    if (card) {
      const key = keyFor(card, false)
      const prev = next[key]
      next[key] = entryFromCard(card, false, (prev?.qty || 0) + (e.qty || 0), e.bin || prev?.bin)
    } else {
      const key = `name:${nameKey(e.name)}`
      const prev = next[key]
      next[key] = { id: null, name: e.name, set: null, collector: null, foil: false, qty: (prev?.qty || 0) + (e.qty || 0), bin: e.bin || 'unsorted' }
    }
  }
  return { map: next, changed: true }
}

export function CollectionProvider({ children }) {
  const [cards, setCards] = useState(load)
  const auth = useAuth()
  const toast = useToast()
  const userId = auth?.user?.id || null

  const hydrating = useRef(false)
  const colMissing = useRef(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    hydrating.current = true
    let cancelled = false

    async function init() {
      let base = load()
      if (userId && isCloud) {
        try {
          const { data, error } = await supabase
            .from('user_decks').select('collection').eq('user_id', userId).maybeSingle()
          if (error) throw error
          colMissing.current = false
          const cloud = data?.collection && typeof data.collection === 'object' ? data.collection : {}
          const local = load()
          base = { ...cloud }
          let imported = 0
          for (const [k, e] of Object.entries(local)) {
            if (!base[k]) { base[k] = e; imported += e.qty || 0 } // local cards not already in cloud
          }
          const { map } = await normalizeCollection(base)
          if (cancelled) return
          setCards(map)
          await supabase.from('user_decks').upsert({ user_id: userId, collection: map, updated_at: new Date().toISOString() })
          if (imported) toast.ok(`Added ${imported} owned card${imported === 1 ? '' : 's'} to your account.`)
        } catch (e) {
          if (cancelled) return
          colMissing.current = /collection|column|relation|does not exist|schema cache|find the table/i.test(e?.message || '')
          if (colMissing.current) toast.err('Re-run supabase/schema.sql to sync your collection to your account.')
          const { map } = await normalizeCollection(base) // still migrate locally
          if (!cancelled) setCards(map)
        } finally {
          if (!cancelled) hydrating.current = false
        }
      } else {
        setCards(base)
        hydrating.current = false
        const { map, changed } = await normalizeCollection(base)
        if (changed && !cancelled) setCards(map)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // persist
  useEffect(() => {
    if (hydrating.current) return
    if (userId && isCloud && !colMissing.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        supabase.from('user_decks')
          .upsert({ user_id: userId, collection: cards, updated_at: new Date().toISOString() })
          .then(({ error }) => { if (error) { /* retry next change */ } })
      }, 600)
    } else {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ cards })) } catch { /* quota */ }
    }
  }, [cards, userId])

  const api = useMemo(() => {
    const entries = Object.entries(cards).map(([key, e]) => ({ key, ...e }))
    const byName = {}
    for (const e of entries) { const nk = nameKey(e.name); byName[nk] = (byName[nk] || 0) + e.qty }

    const setQty = (key, qty) => setCards((c) => {
      const n = { ...c }
      if (qty <= 0) delete n[key]
      else if (n[key]) n[key] = { ...n[key], qty }
      return n
    })

    return {
      cards,
      entries,
      ownedQty: (name) => byName[nameKey(name)] || 0, // summed across all printings/foils
      totalCards: entries.reduce((s, e) => s + e.qty, 0),
      uniqueCards: entries.length,
      setQty,
      remove: (key) => setQty(key, 0),
      setBin: (key, bin) => setCards((c) => (c[key] ? { ...c, [key]: { ...c[key], bin } } : c)),

      // add a specific printing (the primary way to add)
      addPrinting: (card, { foil = false, qty = 1, bin } = {}) => setCards((c) => {
        const key = keyFor(card, foil)
        const prev = c[key]
        return { ...c, [key]: entryFromCard(card, foil, (prev?.qty || 0) + qty, prev?.bin || bin) }
      }),

      // bulk import from rows of { card, foil, qty }
      mergeList: (rows) => setCards((c) => {
        const n = { ...c }
        for (const r of rows) {
          if (!r.card) continue
          const key = keyFor(r.card, !!r.foil)
          const prev = n[key]
          n[key] = entryFromCard(r.card, !!r.foil, (prev?.qty || 0) + (r.qty || 1), prev?.bin)
        }
        return n
      }),

      // toggle foil → re-key (merge if the target printing/foil already exists)
      setFoil: (key, foil) => setCards((c) => {
        const e = c[key]; if (!e || !e.id) return c
        const newKey = foil ? `${e.id}_f` : e.id
        if (newKey === key) return c
        const n = { ...c }; delete n[key]
        const prev = n[newKey]
        n[newKey] = { ...e, foil, qty: (prev?.qty || 0) + e.qty, bin: prev?.bin || e.bin }
        return n
      }),

      // change which printing (art) this line is
      changePrinting: (key, card) => setCards((c) => {
        const e = c[key]; if (!e) return c
        const newKey = keyFor(card, e.foil)
        const n = { ...c }; delete n[key]
        const prev = n[newKey]
        n[newKey] = entryFromCard(card, e.foil, (prev?.qty || 0) + e.qty, prev?.bin || e.bin)
        return n
      }),

      clear: () => setCards({}),
    }
  }, [cards])

  return <CollCtx.Provider value={api}>{children}</CollCtx.Provider>
}
