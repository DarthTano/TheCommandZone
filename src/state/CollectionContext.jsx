import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase, isCloud } from '../lib/supabase.js'
import { useAuth } from './AuthContext.jsx'
import { useToast } from './ToastContext.jsx'

// Owned-card collection: a map { nameKey: { name, qty } }. Persists to
// localStorage when guest, and to the user_decks.collection column when logged
// in — same pattern as DeckContext (which owns the user_decks.decks column;
// they write different columns so their upserts don't clobber each other).

const STORE_KEY = 'manaforge.collection.v1'
const CollCtx = createContext(null)
export const useCollection = () => useContext(CollCtx)

// Bins a card can be filed under (single bin per card).
export const BINS = [
  { key: 'unsorted', label: 'Unsorted', icon: '📥' },
  { key: 'deck', label: 'In a deck', icon: '🃏' },
  { key: 'want', label: 'Want', icon: '⭐' },
  { key: 'bulk', label: 'Bulk', icon: '📦' },
  { key: 'trade', label: 'Trade', icon: '🔁' },
]
export const binLabel = (key) => BINS.find((b) => b.key === key)?.label || 'Unsorted'

const nameKey = (n) => (n || '').trim().toLowerCase()

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return data && typeof data === 'object' ? data.cards || {} : {}
  } catch {
    return {}
  }
}

export function CollectionProvider({ children }) {
  const [cards, setCards] = useState(load)
  const auth = useAuth()
  const toast = useToast()
  const userId = auth?.user?.id || null

  const hydrating = useRef(false)
  const colMissing = useRef(false)
  const saveTimer = useRef(null)

  // swap backing store on auth change (login merges cloud + local, max qty wins)
  useEffect(() => {
    hydrating.current = true
    let cancelled = false
    async function loadCloud() {
      try {
        const { data, error } = await supabase
          .from('user_decks').select('collection').eq('user_id', userId).maybeSingle()
        if (error) throw error
        if (cancelled) return
        colMissing.current = false
        const cloud = data?.collection && typeof data.collection === 'object' ? data.collection : {}
        const local = load()
        const merged = { ...cloud }
        let imported = 0
        for (const [k, e] of Object.entries(local)) {
          if (!merged[k]) { merged[k] = e; imported += e.qty } // only add cards not already in cloud
        }
        setCards(merged)
        if (imported || !data) {
          await supabase.from('user_decks').upsert({
            user_id: userId, collection: merged, updated_at: new Date().toISOString(),
          })
          if (imported) toast.ok(`Added ${imported} owned card${imported === 1 ? '' : 's'} to your account.`)
        }
      } catch (e) {
        if (cancelled) return
        colMissing.current = /collection|column|relation|does not exist|schema cache|find the table/i.test(e?.message || '')
        if (colMissing.current) toast.err('Re-run supabase/schema.sql to sync your collection to your account.')
      } finally {
        if (!cancelled) hydrating.current = false
      }
    }
    if (userId && isCloud) loadCloud()
    else { setCards(load()); hydrating.current = false }
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
    // preserve a card's existing bin through edits (default 'unsorted')
    const keep = (entry, name, patch) => ({ name: entry?.name || name, bin: entry?.bin || 'unsorted', ...entry, ...patch })
    const setQty = (name, qty) => setCards((c) => {
      const k = nameKey(name)
      const next = { ...c }
      if (qty <= 0) delete next[k]
      else next[k] = keep(next[k], name, { qty })
      return next
    })
    return {
      cards,
      ownedQty: (name) => cards[nameKey(name)]?.qty || 0,
      binOf: (name) => cards[nameKey(name)]?.bin || 'unsorted',
      totalCards: Object.values(cards).reduce((s, e) => s + e.qty, 0),
      uniqueCards: Object.keys(cards).length,
      setQty,
      setBin: (name, bin) => setCards((c) => {
        const k = nameKey(name)
        if (!c[k]) return c
        return { ...c, [k]: { ...c[k], bin } }
      }),
      add: (name, qty = 1) => setCards((c) => {
        const k = nameKey(name)
        const cur = c[k]?.qty || 0
        return { ...c, [k]: keep(c[k], name, { qty: cur + qty }) }
      }),
      remove: (name) => setQty(name, 0),
      // bulk import: add entries (sum quantities, keep existing bins)
      mergeList: (entries) => setCards((c) => {
        const next = { ...c }
        for (const e of entries) {
          const k = nameKey(e.name)
          next[k] = keep(next[k], e.name, { qty: (next[k]?.qty || 0) + (e.qty || 1) })
        }
        return next
      }),
      clear: () => setCards({}),
    }
  }, [cards])

  return <CollCtx.Provider value={api}>{children}</CollCtx.Provider>
}
