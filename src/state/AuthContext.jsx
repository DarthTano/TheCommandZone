import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isCloud } from '../lib/supabase.js'

// Supabase Auth wrapper. Null-safe: when the app has no Supabase creds
// (`isCloud` false), there's simply no user and the actions explain why.
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const NO_CLOUD = 'Online accounts are not configured for this site.'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(isCloud)

  useEffect(() => {
    if (!isCloud) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data.session?.user || null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setLoading(false)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // username lives in the auth user's metadata (no extra table needed)
  const username = user?.user_metadata?.username || ''

  const api = {
    user,
    loading,
    isCloud,
    username,

    async signUpPassword(email, password, uname) {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: uname ? { username: uname.trim() } : {} },
      })
      if (error) throw error
      // when "Confirm email" is on, there's no session yet
      return { needsConfirm: !data.session, session: data.session }
    },

    async signInPassword(email, password) {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    async setUsername(uname) {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { data, error } = await supabase.auth.updateUser({ data: { username: uname.trim() } })
      if (error) throw error
      setUser(data.user) // reflect the new username immediately
    },

    async signInGoogle() {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/decks' },
      })
      if (error) throw error
    },

    async signOut() {
      if (!isCloud) return
      await supabase.auth.signOut()
    },
  }

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}
