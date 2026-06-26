import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollection, BINS } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { resolveByIds, getCachedCard, getCachedById, getPrintings, imageUris, primaryType, cardCmc, colorIdentity } from '../lib/scryfall.js'
import { parsePasteList, parseCsv, resolveRows } from '../lib/collectionImport.js'
import { CardDetailModal } from '../components/CardDetailModal.jsx'
import { CardScanner } from '../components/CardScanner.jsx'
import { Modal } from '../components/Modal.jsx'

export function CollectionPage() {
  const coll = useCollection()
  const toast = useToast()
  const [ready, setReady] = useState(0) // bump when printings resolve
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('name')
  const [bin, setBin] = useState('all')
  const [selected, setSelected] = useState(null)
  const [changeArt, setChangeArt] = useState(null) // entry whose printing we're swapping
  const [showPaste, setShowPaste] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const fileRef = useRef(null)

  const entries = coll.entries

  // counts per bin (for the filter chips)
  const binCounts = useMemo(() => {
    const m = { all: 0 }
    for (const e of entries) { const b = e.bin || 'unsorted'; m.all += e.qty; m[b] = (m[b] || 0) + e.qty }
    return m
  }, [entries])

  // resolve the specific printings (by id) for images/prices
  const idKey = entries.map((e) => e.id).filter(Boolean).join(',')
  useEffect(() => {
    const ids = entries.map((e) => e.id).filter(Boolean)
    if (!ids.length) return
    let ok = true
    resolveByIds(ids).then(() => { if (ok) setReady((n) => n + 1) })
    return () => { ok = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  // the specific printing card for an entry (by id; fallback to name cache)
  const cardOf = (e) => (e.id ? getCachedById(e.id) : null) || getCachedCard(e.name)
  const unitPrice = (e) => {
    const c = cardOf(e)
    return parseFloat(e.foil ? (c?.prices?.usd_foil || c?.prices?.usd) : c?.prices?.usd) || 0
  }
  const totalValue = entries.reduce((s, e) => s + unitPrice(e) * e.qty, 0)

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = entries.filter((e) =>
      (bin === 'all' || (e.bin || 'unsorted') === bin) && (!q || e.name.toLowerCase().includes(q)))
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      qty: (a, b) => b.qty - a.qty || a.name.localeCompare(b.name),
      value: (a, b) => (unitPrice(b) * b.qty) - (unitPrice(a) * a.qty),
      price: (a, b) => unitPrice(b) - unitPrice(a),
      color: (a, b) => (colorIdentity(cardOf(a)).join('') || 'Z').localeCompare(colorIdentity(cardOf(b)).join('') || 'Z') || a.name.localeCompare(b.name),
      type: (a, b) => (primaryType(cardOf(a)) || 'Z').localeCompare(primaryType(cardOf(b)) || 'Z') || a.name.localeCompare(b.name),
      cmc: (a, b) => cardCmc(cardOf(a)) - cardCmc(cardOf(b)) || a.name.localeCompare(b.name),
    }
    return [...list].sort(cmp[sort] || cmp.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, filter, bin, sort, ready])

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
        <button className="primary" onClick={() => setShowScan(true)}>📷 Scan cards</button>
        <button className="ghost" onClick={() => setShowPaste(true)}>⬆ Paste list</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>⬆ Upload CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          <div className="big">🗃️</div>
          <p>Your collection is empty. Paste a list, upload a CSV export, or add cards from the Compendium.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => setShowScan(true)}>📷 Scan cards</button>
            <button className="ghost" onClick={() => setShowPaste(true)}>⬆ Paste a list</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>⬆ Upload CSV</button>
          </div>
        </div>
      ) : (
        <>
          {/* bin filter chips */}
          <div className="bin-chips">
            <button className={`bin-chip${bin === 'all' ? ' on' : ''}`} onClick={() => setBin('all')}>All <b>{binCounts.all || 0}</b></button>
            {BINS.map((b) => (
              <button key={b.key} className={`bin-chip${bin === b.key ? ' on' : ''}`} onClick={() => setBin(b.key)}>
                {b.icon} {b.label} <b>{binCounts[b.key] || 0}</b>
              </button>
            ))}
          </div>

          <div className="coll-toolbar">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" style={{ flex: 1 }} />
            <label className="sort-by">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">Name</option>
                <option value="qty">Quantity</option>
                <option value="value">Total value</option>
                <option value="price">Unit price</option>
                <option value="color">Color</option>
                <option value="type">Type</option>
                <option value="cmc">Mana value</option>
              </select>
            </label>
          </div>

          <div className="card-grid">
            {shown.map((e) => {
              const card = cardOf(e)
              const im = card ? imageUris(card) : null
              return (
                <div key={e.key} className={`grid-card coll-card${e.foil ? ' is-foil' : ''}`}>
                  <div className="coll-img" onClick={() => card && setSelected(card)}>
                    {im?.normal ? <img src={im.normal} alt={e.name} loading="lazy" /> : <div className="card-noimg">{e.name}</div>}
                    {e.foil && <span className="foil-badge" title="Foil">✨</span>}
                  </div>
                  <div className="coll-meta">
                    <span className="faint">{(e.set || '').toUpperCase()}{e.collector ? ` #${e.collector}` : ''}</span>
                    <span className="spacer" style={{ flex: 1 }} />
                    <button className={`mini-btn${e.foil ? ' foil-on' : ''}`} title="Toggle foil" onClick={() => coll.setFoil(e.key, !e.foil)}>✨</button>
                    <button className="link-btn" onClick={() => setChangeArt(e)}>art</button>
                  </div>
                  <div className="coll-qty">
                    <button className="ghost icon sm" onClick={() => coll.setQty(e.key, e.qty - 1)}>−</button>
                    <span>{e.qty}</span>
                    <button className="ghost icon sm" onClick={() => coll.setQty(e.key, e.qty + 1)}>+</button>
                    <button className="ghost icon sm danger" title="Remove" onClick={() => coll.remove(e.key)}>✕</button>
                  </div>
                  <select className="bin-select" value={e.bin || 'unsorted'} onChange={(ev) => coll.setBin(e.key, ev.target.value)} title="Move to bin">
                    {BINS.map((b) => <option key={b.key} value={b.key}>{b.icon} {b.label}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
          {shown.length === 0 && <div className="faint" style={{ textAlign: 'center', padding: 24 }}>Nothing in this bin{filter ? ' matching your filter' : ''}.</div>}
        </>
      )}

      {showPaste && <PasteModal onClose={() => setShowPaste(false)} onImport={doImport} />}
      {showScan && <CardScanner onClose={() => setShowScan(false)} />}
      {changeArt && <ChangeArtModal entry={changeArt} onClose={() => setChangeArt(null)}
        onPick={(printing) => { coll.changePrinting(changeArt.key, printing); setChangeArt(null) }} />}
      {selected && <CardDetailModal card={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ChangeArtModal({ entry, onClose, onPick }) {
  const [prints, setPrints] = useState(null)
  useEffect(() => {
    const base = (entry.id ? getCachedById(entry.id) : getCachedCard(entry.name))
    if (!base) { setPrints([]); return }
    getPrintings(base).then(setPrints).catch(() => setPrints([]))
  }, [entry])
  return (
    <Modal title={`Choose art — ${entry.name}`} onClose={onClose} wide>
      {prints === null ? (
        <div className="faint"><span className="spin">⟳</span> loading printings…</div>
      ) : (
        <div className="browse-grid">
          {prints.map((p) => {
            const im = imageUris(p)
            return (
              <div key={p.id} className="browse-card" onClick={() => onPick(p)} style={{ cursor: 'pointer' }}>
                {im?.normal ? <img src={im.normal} alt={p.set_name} /> : <div className="card-noimg">{p.name}</div>}
                <div className="faint" style={{ fontSize: 11, textAlign: 'center' }}>{(p.set || '').toUpperCase()} #{p.collector_number}</div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
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
