import { useState } from 'react'
import { Modal } from './Modal.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

// Sign in / sign up modal: email+password + "Continue with Google".
export function AuthModal({ onClose }) {
  const auth = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e?.preventDefault()
    setError('')
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await auth.signUpPassword(email.trim(), password)
        if (needsConfirm) {
          toast.ok('Check your email to confirm your account, then sign in.')
          setMode('signin')
        } else {
          toast.ok('Account created — you’re signed in.')
          onClose()
        }
      } else {
        await auth.signInPassword(email.trim(), password)
        toast.ok('Signed in.')
        onClose()
      }
    } catch (err) {
      setError(friendly(err.message))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError('')
    setBusy(true)
    try {
      await auth.signInGoogle() // redirects away on success
    } catch (err) {
      setError(friendly(err.message))
      setBusy(false)
    }
  }

  return (
    <Modal title={mode === 'signup' ? 'Create an account' : 'Sign in'} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Save your decks to the cloud so they follow you across devices. Optional — the
        app works fine without an account.
      </p>

      <button className="ghost" style={{ width: '100%', marginBottom: 12 }} onClick={google} disabled={busy}>
        <span style={{ marginRight: 8 }}>🔵</span> Continue with Google
      </button>

      <div className="or-divider"><span>or</span></div>

      <form onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="at least 6 characters" />
        </div>

        {error && <div className="badge bad" style={{ marginBottom: 10 }}>{error}</div>}

        <button className="primary" type="submit" style={{ width: '100%' }} disabled={busy}>
          {busy ? <><span className="spin">⟳</span> …</> : (mode === 'signup' ? 'Create account' : 'Sign in')}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }} className="muted">
        {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setMode(mode === 'signup' ? 'signin' : 'signup') }}>
          {mode === 'signup' ? 'Sign in' : 'Create one'}
        </a>
      </div>
    </Modal>
  )
}

function friendly(msg = '') {
  if (/Invalid login/i.test(msg)) return 'Wrong email or password.'
  if (/already registered/i.test(msg)) return 'That email is already registered — try signing in.'
  if (/not configured|provider is not enabled/i.test(msg)) return 'Google sign-in isn’t set up yet on this project.'
  return msg || 'Something went wrong.'
}
