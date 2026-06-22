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
    const setQty = (name, qty) => setCards((c) => {
      const k = nameKey(name)
      const next = { ...c }
      if (qty <= 0) delete next[k]
      else next[k] = { name: next[k]?.name || name, qty }
      return next
    })
    return {
      cards,
      ownedQty: (name) => cards[nameKey(name)]?.qty || 0,
      totalCards: Object.values(cards).reduce((s, e) => s + e.qty, 0),
      uniqueCards: Object.keys(cards).length,
      setQty,
      add: (name, qty = 1) => setCards((c) => {
        const k = nameKey(name)
        const cur = c[k]?.qty || 0
        return { ...c, [k]: { name: c[k]?.name || name, qty: cur + qty } }
      }),
      remove: (name) => setQty(name, 0),
      // bulk import: add entries (sum quantities)
      mergeList: (entries) => setCards((c) => {
        const next = { ...c }
        for (const e of entries) {
          const k = nameKey(e.name)
          next[k] = { name: next[k]?.name || e.name, qty: (next[k]?.qty || 0) + (e.qty || 1) }
        }
        return next
      }),
      clear: () => setCards({}),
    }
  }, [cards])

  return <CollCtx.Provider value={api}>{children}</CollCtx.Provider>
}
