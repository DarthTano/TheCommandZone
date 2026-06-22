import { useState } from 'react'
import { Modal } from './Modal.jsx'
import { parseDecklist, resolveDecklist } from '../lib/decklist.js'
import { FORMAT_LIST, DEFAULT_FORMAT } from '../lib/formats.js'
import { useDecks } from '../state/DeckContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

const SAMPLE = `Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Cultivate
1 Swords to Plowshares
35 Forest`

export function ImportModal({ onClose, onImported }) {
  const { importDeck } = useDecks()
  const toast = useToast()
  const [name, setName] = useState('')
  const [format, setFormat] = useState(DEFAULT_FORMAT)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)

  async function doImport() {
    if (!text.trim()) {
      toast.err('Paste a decklist first.')
      return
    }
    setBusy(true)
    setReport(null)
    try {
      const parsed = parseDecklist(text)
      const resolved = await resolveDecklist(parsed)
      const deckName = name.trim() || resolved.commanders[0] || 'Imported Deck'
      const id = importDeck(deckName, format, resolved)
      setReport({
        resolved: resolved.counts.main + resolved.counts.commander,
        unresolved: resolved.unresolved,
        unparsed: resolved.unparsed,
        id,
      })
      const issues = resolved.unresolved.length + resolved.unparsed.length
      if (issues === 0) {
        toast.ok(`Imported ${deckName}.`)
        onImported?.(id)
      } else {
        toast.toast(`Imported with ${issues} line(s) needing attention.`)
      }
    } catch (e) {
      toast.err(`Import failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import decklist" onClose={onClose} wide>
      <div className="field">
        <label>Deck name (optional)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to your commander" />
      </div>
      <div className="field">
        <label>Format</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMAT_LIST.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>
          Paste decklist{' '}
          <button className="ghost sm" type="button" onClick={() => setText(SAMPLE)} style={{ marginLeft: 8 }}>
            use sample
          </button>
        </label>
        <textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Supports MTGA / Moxfield / Archidekt exports, e.g.\n1 Sol Ring\n1x Lightning Bolt (2X2) 117\n\nCommander\n1 Atraxa, Praetors’ Voice'}
          style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
        />
      </div>

      {report && (
        <div className="panel" style={{ marginTop: 4 }}>
          <div className="badge ok" style={{ marginBottom: 8 }}>✓ {report.resolved} cards resolved</div>
          {report.unresolved.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Not found on Scryfall:</div>
              <div className="chip-row">{report.unresolved.map((n) => <span key={n} className="chip">{n}</span>)}</div>
            </>
          )}
          {report.unparsed.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 13, margin: '10px 0 4px' }}>Couldn’t parse these lines:</div>
              <div className="chip-row">{report.unparsed.map((n, i) => <span key={i} className="chip">{n}</span>)}</div>
            </>
          )}
        </div>
      )}

      <div className="row">
        <button className="ghost" onClick={onClose}>{report ? 'Close' : 'Cancel'}</button>
        {report?.id ? (
          <button className="primary" onClick={() => onImported?.(report.id)}>Open deck →</button>
        ) : (
          <button className="primary" onClick={doImport} disabled={busy}>
            {busy ? <><span className="spin">⟳</span> Resolving…</> : 'Import'}
          </button>
        )}
      </div>
    </Modal>
  )
}
