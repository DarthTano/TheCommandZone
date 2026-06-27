import { useEffect, useRef, useState, useCallback } from 'react'
import { recognizeTitle, recognizeText, parseSetCollector } from '../lib/ocr.js'
import { fuzzyNamed, autocomplete, namedCard, imageUris, cardBySetNumber, getPrintings } from '../lib/scryfall.js'
import { useCollection } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

// Crop fractions of the frame (assumes the card fills the guide outline).
const BAND = { top: 0.16, height: 0.13, left: 0.08, width: 0.84 }        // title
const BAND_BOTTOM = { top: 0.86, height: 0.12, left: 0.04, width: 0.62 } // set code + collector №

// auto-capture tuning (mean abs luma diff over a 32×44 sample, 0–255)
const TICK_MS = 220, MOTION = 14, STEADY = 7, STEADY_TICKS = 3

export function CardScanner({ onClose }) {
  const coll = useCollection()
  const toast = useToast()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)

  const [camErr, setCamErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [mode, setMode] = useState('careful') // 'careful' | 'rapid'
  const [auto, setAuto] = useState(true)
  const [match, setMatch] = useState(null) // resolved printing
  const [foil, setFoilState] = useState(false)
  const [prints, setPrints] = useState(null)
  const [showPrints, setShowPrints] = useState(false)
  const [alts, setAlts] = useState([])
  const [added, setAdded] = useState([]) // { key, name }
  const [manual, setManual] = useState('')
  const [suggest, setSuggest] = useState([])

  // refs the auto-capture loop reads without re-subscribing
  const busyRef = useRef(false); busyRef.current = busy
  const autoRef = useRef(true); autoRef.current = auto
  const modeRef = useRef('careful'); modeRef.current = mode
  const matchRef = useRef(null); matchRef.current = match
  const armedRef = useRef(true), steadyRef = useRef(0), prevRef = useRef(null), sampleRef = useRef(null)

  // ---- camera ----
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

  // run OCR + match. rapid=true auto-adds a confident match and keeps scanning.
  const runOcr = useCallback(async (titleCanvas, bottomCanvas, rapid) => {
    setBusy(true); setStatus('Reading card…'); resetMatch()
    try {
      const text = await recognizeTitle(titleCanvas)
      let printing = null
      if (bottomCanvas) {
        try {
          const sc = parseSetCollector(await recognizeText(bottomCanvas))
          if (sc) printing = await cardBySetNumber(sc.set, sc.number)
        } catch { /* fall back to name */ }
      }
      let card = printing && printing.name ? printing : null
      if (!card && text) card = await fuzzyNamed(text)

      if (card && rapid) { addCard(card, false); setStatus(`✓ Added ${card.name}`); return }
      if (card) { setMatch(card); setStatus('') ; if (!printing && text) loadAlts(text); return }
      if (!text) { setStatus('Couldn’t read the card — hold it steadier, or type it below.'); return }
      setStatus(`Read “${text}” but no match — pick below or type it.`)
      loadAlts(text)
    } catch (e) {
      setStatus('Scan error — try again or type the name.')
    } finally { setBusy(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAlts(text) {
    try { const names = await autocomplete(text); setAlts(names.slice(0, 5)) } catch { /* ignore */ }
  }

  const capture = useCallback(() => {
    const v = videoRef.current
    if (!v?.videoWidth || busyRef.current) return
    runOcr(cropBand(v, BAND), cropBand(v, BAND_BOTTOM), modeRef.current === 'rapid')
  }, [runOcr])

  function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const img = new Image()
    img.onload = () => runOcr(cropBand(img, { top: 0, height: 0.32, left: 0, width: 1 }), cropBand(img, BAND_BOTTOM), false)
    img.src = URL.createObjectURL(file)
  }

  // ---- auto-capture: fire when a held card is steady; re-arm after motion ----
  useEffect(() => {
    if (camErr) return
    const id = setInterval(() => {
      const v = videoRef.current
      if (!autoRef.current || busyRef.current || !v?.videoWidth) return
      if (modeRef.current === 'careful' && matchRef.current) return // waiting on confirm
      const d = frameDiff(v, sampleRef, prevRef)
      if (d > MOTION) { armedRef.current = true; steadyRef.current = 0 }
      else if (d < STEADY && armedRef.current) {
        if (++steadyRef.current >= STEADY_TICKS) { steadyRef.current = 0; armedRef.current = false; capture() }
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [camErr, capture])

  // ---- add / alternates / manual ----
  function addCard(card, foilFlag) {
    coll.addPrinting(card, { foil: foilFlag, qty: 1 })
    const key = foilFlag ? `${card.id}_f` : card.id
    setAdded((a) => [{ key, name: card.name + (foilFlag ? ' ✨' : '') }, ...a].slice(0, 40))
    toast.ok(`+ ${card.name}${foilFlag ? ' (foil)' : ''}`)
    resetMatch(); setManual(''); setSuggest([])
  }
  async function addByName(name) { const card = await namedCard(name); if (card) { addCard(card, false); setStatus('') } }
  function undo(i) {
    const entry = added[i]
    coll.setQty(entry.key, (coll.cards[entry.key]?.qty || 1) - 1)
    setAdded((a) => a.filter((_, idx) => idx !== i))
  }

  async function loadPrints() {
    setShowPrints((s) => !s)
    if (prints === null && match) { try { setPrints(await getPrintings(match)) } catch { setPrints([]) } }
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
        <div className="scan-mode">
          <button className={mode === 'careful' ? 'on' : ''} onClick={() => setMode('careful')}>Careful</button>
          <button className={mode === 'rapid' ? 'on' : ''} onClick={() => setMode('rapid')}>Rapid</button>
        </div>
        <button className="ghost sm" onClick={onClose}>Done</button>
      </div>

      <div className="scan-stage">
        {camErr ? (
          <div className="scan-camerr">
            <div className="big">📷</div>
            <p>{camErr === 'denied' ? 'Camera permission was blocked. Allow it in your browser, or use a photo / type the name.' : 'No camera available here. Upload a photo or type the card name below.'}</p>
          </div>
        ) : (
          <div className="scan-video-wrap" onClick={capture} title="Tap to capture">
            <video ref={videoRef} playsInline muted className="scan-video" />
            <div className="scan-guide">
              <div className="scan-card-frame" />
              <div className="scan-band" style={bandStyle(BAND)}><span>name</span></div>
              <div className="scan-band bottom" style={bandStyle(BAND_BOTTOM)}><span>set / №</span></div>
            </div>
            {auto && !busy && !match && <div className="scan-hint">{mode === 'rapid' ? 'Rapid — hold each card steady' : 'Hold a card steady, or tap'}</div>}
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
                <button className="primary" onClick={() => addCard(match, foil)}>＋ Add</button>
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
        {!camErr && (
          <>
            <label className="scan-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto</label>
            <button className="capture-btn" onClick={capture} disabled={busy} title="Capture">{busy ? <span className="spin">⟳</span> : '◎'}</button>
          </>
        )}
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

const bandStyle = (b) => ({ top: `${b.top * 100}%`, height: `${b.height * 100}%`, left: `${b.left * 100}%`, width: `${b.width * 100}%` })

// mean absolute luma difference between consecutive frames over a 32×44 sample
function frameDiff(video, sampleRef, prevRef) {
  let c = sampleRef.current
  if (!c) { c = sampleRef.current = document.createElement('canvas'); c.width = 32; c.height = 44 }
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, 32, 44)
  const { data } = ctx.getImageData(0, 0, 32, 44)
  const cur = new Uint8Array(32 * 44)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) cur[j] = (data[i] + data[i + 1] + data[i + 2]) / 3
  const prev = prevRef.current
  prevRef.current = cur
  if (!prev) return 999
  let sum = 0
  for (let k = 0; k < cur.length; k++) sum += Math.abs(cur[k] - prev[k])
  return sum / cur.length
}
