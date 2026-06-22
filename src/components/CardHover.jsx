import { useState, useCallback } from 'react'
import { imageUris } from '../lib/scryfall.js'

// Hook that wires up a floating card-image preview that follows the cursor.
// Usage: const { preview, bind } = useCardHover(); <span {...bind(card)}>name</span>
export function useCardHover() {
  const [state, setState] = useState(null) // { src, x, y }

  const bind = useCallback((card) => ({
    onMouseEnter: (e) => {
      const img = imageUris(card)
      if (img?.normal) setState({ src: img.normal, x: e.clientX, y: e.clientY })
    },
    onMouseMove: (e) => setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s)),
    onMouseLeave: () => setState(null),
  }), [])

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
