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

  const api = {
    user,
    loading,
    isCloud,

    async signUpPassword(email, password) {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      // when "Confirm email" is on, there's no session yet
      return { needsConfirm: !data.session, session: data.session }
    },

    async signInPassword(email, password) {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },

    async signInGoogle() {
      if (!isCloud) throw new Error(NO_CLOUD)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/decks',
          // New-style Supabase API keys require the apikey on the OAuth authorize
          // URL; supabase-js doesn't add it automatically, so pass it explicitly.
          queryParams: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        },
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
