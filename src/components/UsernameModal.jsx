import { useState } from 'react'
import { Modal } from './Modal.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { validateUsername } from './AuthModal.jsx'

// Shown after login when the account has no username yet (e.g. Google sign-in),
// and reusable for changing it later. Pre-fills from a Google name if present.
export function UsernameModal({ onClose, allowSkip = true }) {
  const auth = useAuth()
  const toast = useToast()
  const suggested =
    auth.user?.user_metadata?.full_name?.replace(/[^a-zA-Z0-9_]/g, '') ||
    auth.user?.user_metadata?.name?.replace(/[^a-zA-Z0-9_]/g, '') ||
    auth.user?.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '') || ''
  const [name, setName] = useState(auth.username || suggested.slice(0, 20))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e?.preventDefault()
    const v = validateUsername(name)
    if (v.error) { setError(v.error); return }
    setBusy(true)
    try {
      await auth.setUsername(v.value)
      toast.ok(`You're set as ${v.value}.`)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save username.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Pick a username" onClose={allowSkip ? onClose : undefined}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        This is how you’ll show up at the table and on your account.
      </p>
      <form onSubmit={save}>
        <div className="field">
          <label>Username</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
            placeholder="3–20 letters, numbers, underscores" />
        </div>
        {error && <div className="badge bad" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="row">
          {allowSkip && <button type="button" className="ghost" onClick={onClose}>Later</button>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? <><span className="spin">⟳</span> …</> : 'Save username'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
