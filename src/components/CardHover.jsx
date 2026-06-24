import { useState, useCallback, useMemo } from 'react'
import { imageUris } from '../lib/scryfall.js'

// Touch screens emulate mouse events but never fire mouseleave, so a tap would
// pop the floating preview and leave it stuck. Only enable it for real hover
// (mouse) devices; on touch, taps just trigger the card's own action.
const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
  : true

// Hook that wires up a floating card-image preview that follows the cursor.
// Usage: const { preview, bind } = useCardHover(); <span {...bind(card)}>name</span>
export function useCardHover() {
  const [state, setState] = useState(null) // { src, x, y }

  const bind = useCallback((card) => {
    if (!CAN_HOVER) return {} // no sticky preview on touch
    return {
      onMouseEnter: (e) => {
        const img = imageUris(card)
        if (img?.normal) setState({ src: img.normal, x: e.clientX, y: e.clientY })
      },
      onMouseMove: (e) => setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s)),
      onMouseLeave: () => setState(null),
    }
  }, [])

  const preview = state ? <CardPreview {...state} /> : null
  return { preview, bind }
}

function CardPreview({ src, x, y }) {
  // keep the 240px-wide preview on screen
  const w = 240
  const h = 340
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
