import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollection } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { resolveCollection, imageUris, getCachedCard } from '../lib/scryfall.js'
import { parsePasteList, parseCsv, resolveRows } from '../lib/collectionImport.js'
import { CardDetailModal } from '../components/CardDetailModal.jsx'
import { Modal } from '../components/Modal.jsx'

export function CollectionPage() {
  const coll = useCollection()
  const toast = useToast()
  const [resolved, setResolved] = useState({}) // nameKey -> card
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [showPaste, setShowPaste] = useState(false)
  const fileRef = useRef(null)

  const entries = useMemo(
    () => Object.entries(coll.cards).map(([k, e]) => ({ k, ...e })).sort((a, b) => a.name.localeCompare(b.name)),
    [coll.cards],
  )

  // resolve card data (images/prices) for owned cards, batched + cached
  useEffect(() => {
    const names = entries.map((e) => e.name)
    if (!names.length) { setResolved({}); return }
    let ok = true
    resolveCollection(names).then(({ found }) => {
      if (!ok) return
      const map = {}
      for (const [k, card] of found.entries()) map[k] = card
      setResolved(map)
    })
    return () => { ok = false }
  }, [entries.length]) // re-resolve when the set of cards changes

  const totalValue = entries.reduce((s, e) => {
    const card = resolved[e.k] || getCachedCard(e.name)
    const p = parseFloat(card?.prices?.usd) || 0
    return s + p * e.qty
  }, 0)

  const shown = filter.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : entries

  async function onCsv(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const { rows, unparsed } = parseCsv(text)
    if (!rows.length) { toast.err(unparsed[0] || 'Could not read that CSV.'); e.target.value = ''; return }
    await doImport(rows)
    e.target.value = ''
  }

  async function doImport(rows) {
    toast.toast('Resolving cards…')
    const { entries: resolvedEntries, unresolved } = await resolveRows(rows)
    coll.mergeList(resolvedEntries)
    const n = resolvedEntries.reduce((s, e) => s + e.qty, 0)
    toast.ok(`Imported ${n} cards${unresolved.length ? ` (${unresolved.length} not found)` : ''}.`)
    return unresolved
  }

  return (
    <div>
      <div className="page-head">
        <h1>Collection</h1>
        <span className="muted">{coll.uniqueCards} unique · {coll.totalCards} cards · ~${totalValue.toFixed(2)}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="ghost" onClick={() => setShowPaste(true)}>⬆ Paste list</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>⬆ Upload CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <div className="big">🗃️</div>
          <p>Your collection is empty. Paste a list, upload a CSV export, or add cards from the Compendium.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="primary" onClick={() => setShowPaste(true)}>⬆ Paste a list</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>⬆ Upload CSV</button>
          </div>
        </div>
      ) : (
        <>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter your collection…"
            style={{ width: '100%', marginBottom: 14 }} />
          <div className="card-grid">
            {shown.map((e) => {
              const card = resolved[e.k] || getCachedCard(e.name)
              const im = card ? imageUris(card) : null
              return (
                <div key={e.k} className="grid-card coll-card">
                  <div onClick={() => card && setSelected(card)}>
                    {im?.normal ? <img src={im.normal} alt={e.name} loading="lazy" /> : <div className="card-noimg">{e.name}</div>}
                  </div>
                  <div className="coll-qty">
                    <button className="ghost icon sm" onClick={() => coll.setQty(e.name, e.qty - 1)}>−</button>
                    <span>{e.qty}</span>
                    <button className="ghost icon sm" onClick={() => coll.add(e.name, 1)}>+</button>
                    <button className="ghost icon sm danger" title="Remove" onClick={() => coll.remove(e.name)}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showPaste && <PasteModal onClose={() => setShowPaste(false)} onImport={doImport} />}
      {selected && <CardDetailModal card={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function PasteModal({ onClose, onImport }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)
  async function go() {
    if (!text.trim()) return
    setBusy(true)
    const { rows } = parsePasteList(text)
    const unresolved = await onImport(rows)
    setReport({ unresolved: unresolved || [] })
    setBusy(false)
  }
  return (
    <Modal title="Paste your cards" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>One card per line, e.g. <code>4 Sol Ring</code> or <code>1x Atraxa, Praetors’ Voice</code>.</p>
      <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }} placeholder={'1 Sol Ring\n4 Lightning Bolt\n1 Atraxa, Praetors’ Voice'} />
      {report && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="badge ok">✓ Imported</div>
          {report.unresolved.length > 0 && <div className="chip-row" style={{ marginTop: 8 }}>{report.unresolved.map((n) => <span key={n} className="chip">{n}</span>)}</div>}
        </div>
      )}
      <div className="row">
        <button className="ghost" onClick={onClose}>{report ? 'Close' : 'Cancel'}</button>
        {!report && <button className="primary" onClick={go} disabled={busy}>{busy ? <><span className="spin">⟳</span> Importing…</> : 'Import'}</button>}
      </div>
    </Modal>
  )
}
