import { useEffect, useRef, useState, useCallback } from 'react'
import { recognizeTitle, recognizeText, parseSetCollector } from '../lib/ocr.js'
import { fuzzyNamed, autocomplete, namedCard, imageUris, cardBySetNumber, getPrintings } from '../lib/scryfall.js'
import { useCollection } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

// Title band (fraction of the frame) — where the card name should sit. The guide
// overlay uses these same fractions so what you line up is what gets OCR'd.
const BAND = { top: 0.16, height: 0.13, left: 0.08, width: 0.84 }
// Bottom-left strip: the set code + collector number that pin the exact printing.
const BAND_BOTTOM = { top: 0.86, height: 0.12, left: 0.04, width: 0.62 }

export function CardScanner({ onClose }) {
  const coll = useCollection()
  const toast = useToast()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)

  const [camErr, setCamErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [match, setMatch] = useState(null) // resolved printing
  const [foil, setFoilState] = useState(false)
  const [prints, setPrints] = useState(null) // printings for the art picker
  const [showPrints, setShowPrints] = useState(false)
  const [alts, setAlts] = useState([]) // alternate names
  const [added, setAdded] = useState([]) // session log: { key, name }
  const [manual, setManual] = useState('')
  const [suggest, setSuggest] = useState([])

  // ---- camera lifecycle ----
  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setCamErr('no-camera'); return }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
      } catch (e) {
        setCamErr(e?.name === 'NotAllowedError' ? 'denied' : 'no-camera')
      }
    }
    start()
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // ---- OCR helpers ----
  function cropBand(source, frac) {
    const sw = source.videoWidth || source.naturalWidth || source.width
    const sh = source.videoHeight || source.naturalHeight || source.height
    const c = document.createElement('canvas')
    const w = Math.round(sw * frac.width), h = Math.round(sh * frac.height)
    c.width = w; c.height = h
    c.getContext('2d').drawImage(source, Math.round(sw * frac.left), Math.round(sh * frac.top), w, h, 0, 0, w, h)
    return c
  }

  function resetMatch() { setMatch(null); setAlts([]); setFoilState(false); setPrints(null); setShowPrints(false) }

  const runOcr = useCallback(async (titleCanvas, bottomCanvas) => {
    setBusy(true); setStatus('Reading card…'); resetMatch()
    try {
      const text = await recognizeTitle(titleCanvas)
      // first try the exact printing from set code + collector number
      let printing = null
      if (bottomCanvas) {
        try {
          const sc = parseSetCollector(await recognizeText(bottomCanvas))
          if (sc) printing = await cardBySetNumber(sc.set, sc.number)
        } catch { /* ignore — fall back to name */ }
      }
      if (printing && (!text || printing.name)) {
        setMatch(printing)
        setStatus(`Found ${printing.name} · ${(printing.set || '').toUpperCase()} #${printing.collector_number}`)
        return
      }
      if (!text) { setStatus('Couldn’t read the card — line it up and try again, or type it below.'); return }
      setStatus(`Read “${text}” — matching…`)
      const card = await fuzzyNamed(text)
      const names = await autocomplete(text)
      setAlts(names.filter((n) => n !== card?.name).slice(0, 5))
      if (card) { setMatch(card); setStatus('') }
      else setStatus(`Read “${text}” but no exact match — pick below or type it.`)
    } catch (e) {
      setStatus('Scan error — try again or type the name.')
    } finally { setBusy(false) }
  }, [])

  function capture() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    runOcr(cropBand(v, BAND), cropBand(v, BAND_BOTTOM))
  }

  function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const img = new Image()
    img.onload = () => runOcr(cropBand(img, { top: 0, height: 0.32, left: 0, width: 1 }), cropBand(img, BAND_BOTTOM))
    img.src = URL.createObjectURL(file)
  }

  async function loadPrints() {
    setShowPrints((s) => !s)
    if (prints === null && match) { try { setPrints(await getPrintings(match)) } catch { setPrints([]) } }
  }

  // ---- add / alternates / manual ----
  function add(card) {
    coll.addPrinting(card, { foil, qty: 1 })
    const key = foil ? `${card.id}_f` : card.id
    setAdded((a) => [{ key, name: card.name + (foil ? ' ✨' : '') }, ...a].slice(0, 30))
    toast.ok(`+ ${card.name}${foil ? ' (foil)' : ''}`)
    resetMatch(); setStatus(''); setManual(''); setSuggest([])
  }
  async function addByName(name) {
    const card = await namedCard(name)
    if (card) add(card)
  }
  function undo(i) {
    const entry = added[i]
    coll.setQty(entry.key, (coll.cards[entry.key]?.qty || 1) - 1)
    setAdded((a) => a.filter((_, idx) => idx !== i))
  }

  useEffect(() => {
    if (manual.trim().length < 2) { setSuggest([]); return }
    const t = setTimeout(() => autocomplete(manual).then((n) => setSuggest(n.slice(0, 6))), 250)
    return () => clearTimeout(t)
  }, [manual])

  return (
    <div className="scanner">
      <div className="scan-head">
        <strong>Scan cards</strong>
        <span className="faint" style={{ fontSize: 13 }}>{added.length} added</span>
        <span style={{ flex: 1 }} />
        <button className="ghost sm" onClick={onClose}>Done</button>
      </div>

      <div className="scan-stage">
        {camErr ? (
          <div className="scan-camerr">
            <div className="big">📷</div>
            <p>{camErr === 'denied' ? 'Camera permission was blocked. Allow it in your browser, or use a photo / type the name.' : 'No camera available here. Upload a photo or type the card name below.'}</p>
          </div>
        ) : (
          <div className="scan-video-wrap">
            <video ref={videoRef} playsInline muted className="scan-video" />
            <div className="scan-guide">
              <div className="scan-band" style={{ top: `${BAND.top * 100}%`, height: `${BAND.height * 100}%`, left: `${BAND.left * 100}%`, width: `${BAND.width * 100}%` }}>
                <span>line up the card name</span>
              </div>
            </div>
          </div>
        )}

        {status && <div className="scan-status">{busy && <span className="spin">⟳</span>} {status}</div>}

        {/* matched card + confirm (foil + art) */}
        {match && (
          <div className="scan-result">
            <img src={imageUris(match)?.small || imageUris(match)?.normal} alt={match.name} className={foil ? 'foil' : ''} />
            <div className="scan-result-body">
              <div style={{ fontWeight: 700 }}>{match.name}</div>
              <div className="faint" style={{ fontSize: 12 }}>{(match.set || '').toUpperCase()} #{match.collector_number}</div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, margin: '6px 0' }}>
                <input type="checkbox" checked={foil} onChange={(e) => setFoilState(e.target.checked)} style={{ width: 'auto' }} /> ✨ Foil
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="primary" onClick={() => add(match)}>＋ Add</button>
                <button className="ghost sm" onClick={loadPrints}>Art ▾</button>
                <button className="ghost sm" onClick={() => { resetMatch(); setStatus('') }}>Not it</button>
              </div>
              {showPrints && (
                <div className="scan-prints">
                  {prints === null ? <span className="faint"><span className="spin">⟳</span> printings…</span>
                    : prints.map((p) => (
                      <img key={p.id} src={imageUris(p)?.small} alt={p.set_name}
                        title={`${(p.set || '').toUpperCase()} #${p.collector_number}`}
                        className={p.id === match.id ? 'sel' : ''}
                        onClick={() => { setMatch(p); setShowPrints(false) }} />
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
        {alts.length > 0 && (
          <div className="scan-alts">
            <span className="faint" style={{ fontSize: 12 }}>{match ? 'Or:' : 'Did you mean:'}</span>
            {alts.map((n) => <button key={n} className="chip" onClick={() => addByName(n)}>{n} +</button>)}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="scan-controls">
        {!camErr && <button className="capture-btn" onClick={capture} disabled={busy} title="Capture">{busy ? <span className="spin">⟳</span> : '◎'}</button>}
        <button className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>🖼 Photo</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      </div>

      {/* type-ahead fallback */}
      <div className="scan-manual">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type a card name" />
        {suggest.length > 0 && (
          <div className="scan-suggest">
            {suggest.map((n) => <button key={n} onClick={() => addByName(n)}>{n}</button>)}
          </div>
        )}
      </div>

      {/* session list */}
      {added.length > 0 && (
        <div className="scan-added">
          {added.map((a, i) => (
            <span key={i} className="chip">{a.name} <button className="link-x" onClick={() => undo(i)}>✕</button></span>
          ))}
        </div>
      )}
    </div>
  )
}
