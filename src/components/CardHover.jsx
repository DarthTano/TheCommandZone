import { useState, useCallback, useEffect } from 'react'
import { imageUris } from '../lib/scryfall.js'

// Real hover (mouse) devices get a cursor-following preview. Touch devices never
// fire mouseleave, so instead they get an explicit, tap-to-dismiss full-screen
// zoom via the returned `zoom(card)` function.
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
  : true

// Usage: const { preview, bind, zoom } = useCardHover()
//   - bind(card)  → spread onto an element for the desktop hover preview
//   - zoom(card)  → call to open the dismissable full-screen enlarged card
export function useCardHover() {
  const [hover, setHover] = useState(null) // { src, x, y } cursor-follow (desktop)
  const [zoomed, setZoomed] = useState(null) // { src } full-screen (any device)

  const zoom = useCallback((card) => {
    const img = imageUris(card)
    if (img?.normal || img?.large) setZoomed({ src: img.large || img.normal })
  }, [])

  const bind = useCallback((card) => {
    // touch: a tap enlarges (dismissable); desktop: cursor-following preview
    if (!CAN_HOVER) return { onClick: () => zoom(card) }
    return {
      onMouseEnter: (e) => {
        const img = imageUris(card)
        if (img?.normal) setHover({ src: img.normal, x: e.clientX, y: e.clientY })
      },
      onMouseMove: (e) => setHover((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s)),
      onMouseLeave: () => setHover(null),
    }
  }, [zoom])

  const preview = (
    <>
      {hover && <CardPreview {...hover} />}
      {zoomed && <CardZoom src={zoomed.src} onClose={() => setZoomed(null)} />}
    </>
  )
  return { preview, bind, zoom, canHover: CAN_HOVER }
}

function CardPreview({ src, x, y }) {
  const w = 240, h = 340
  let left = x + 18
  let top = y - h / 2
  if (typeof window !== 'undefined') {
    if (left + w > window.innerWidth - 8) left = x - w - 18
    if (top < 8) top = 8
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8
  }
  return (
    <div className="card-preview" style={{ left, top }}>
      <img src={src} alt="" />
    </div>
  )
}

function CardZoom({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="card-zoom" onClick={onClose}>
      <button className="card-zoom-x" onClick={onClose} aria-label="Close">✕</button>
      <img src={src} alt="" onClick={onClose} />
    </div>
  )
}
