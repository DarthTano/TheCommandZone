import { useEffect, useRef, useState } from 'react'
import { ZONES, ZONE_LABELS } from '../lib/cardEngine.js'

// One card on the table. `zone` is where it currently lives; `controllable`
// means this client owns the seat and may act on it. `onAction(type, arg)`
// bubbles intents to the play mat. Supports drag (HTML5) + a click menu.
export function Card({ inst, zone, controllable, onAction, bind, size = 'md' }) {
  const [menu, setMenu] = useState(false)

  const handleClick = () => {
    if (!controllable) return
    // single click on a battlefield card = tap/untap (most common action)
    if (zone === ZONES.BATTLEFIELD) onAction('tap')
    else setMenu((m) => !m)
  }

  const onDragStart = (e) => {
    if (!controllable) return
    e.dataTransfer.setData('text/plain', JSON.stringify({ iid: inst.iid, from: zone }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={`card card-${size}${inst.tapped ? ' tapped' : ''}${controllable ? ' mine' : ''}`}
      draggable={controllable}
      onDragStart={onDragStart}
      {...(bind ? bind({ name: inst.name, image_uris: inst.img ? { normal: inst.img } : null }) : {})}
    >
      {inst.img ? (
        <img src={inst.img} alt={inst.name} onClick={handleClick} draggable={false} />
      ) : (
        <div className="card-noimg" onClick={handleClick}>{inst.name}</div>
      )}

      {inst.counters > 0 && <span className="card-counter">{inst.counters}</span>}

      {controllable && (
        <button className="card-menu-btn" title="Actions" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m) }}>⋯</button>
      )}

      {menu && controllable && (
        <CardMenu inst={inst} zone={zone} onPick={(type, arg) => { setMenu(false); onAction(type, arg) }} onClose={() => setMenu(false)} />
      )}
    </div>
  )
}

function CardMenu({ inst, zone, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [onClose])

  // build the action list based on the current zone
  const items = []
  const moveTo = (z, label) => items.push({ label: label || `→ ${ZONE_LABELS[z]}`, fn: () => onPick('move', z) })

  if (zone === ZONES.HAND) {
    items.push({ label: '▶ Play to battlefield', fn: () => onPick('play') })
    moveTo(ZONES.GRAVEYARD); moveTo(ZONES.EXILE); moveTo(ZONES.COMMAND)
    items.push({ label: '→ Library (top)', fn: () => onPick('toLibrary', 'top') })
    items.push({ label: '→ Library (bottom)', fn: () => onPick('toLibrary', 'bottom') })
  } else if (zone === ZONES.BATTLEFIELD) {
    items.push({ label: inst.tapped ? '↺ Untap' : '⤵ Tap', fn: () => onPick('tap') })
    items.push({ label: '＋ counter', fn: () => onPick('counter', 1) })
    if (inst.counters > 0) items.push({ label: '－ counter', fn: () => onPick('counter', -1) })
    items.push({ label: '→ Hand', fn: () => onPick('toHand') })
    moveTo(ZONES.GRAVEYARD); moveTo(ZONES.EXILE); moveTo(ZONES.COMMAND)
    items.push({ label: '→ Library (top)', fn: () => onPick('toLibrary', 'top') })
  } else {
    // graveyard / exile / command
    moveTo(ZONES.BATTLEFIELD, '▶ To battlefield')
    items.push({ label: '→ Hand', fn: () => onPick('toHand') })
    if (zone !== ZONES.GRAVEYARD) moveTo(ZONES.GRAVEYARD)
    if (zone !== ZONES.EXILE) moveTo(ZONES.EXILE)
    if (zone !== ZONES.COMMAND) moveTo(ZONES.COMMAND)
    items.push({ label: '→ Library (top)', fn: () => onPick('toLibrary', 'top') })
  }

  return (
    <div className="card-menu" ref={ref}>
      <div className="card-menu-title">{inst.name}</div>
      {items.map((it, i) => (
        <button key={i} className="card-menu-item" onClick={it.fn}>{it.label}</button>
      ))}
    </div>
  )
}
