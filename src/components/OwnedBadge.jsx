import { useCollection } from '../state/CollectionContext.jsx'

// Small chip showing how many of a card you own. Renders nothing if you own 0
// (unless `showZero`).
export function OwnedBadge({ name, showZero = false, className = '' }) {
  const coll = useCollection()
  const qty = coll?.ownedQty(name) || 0
  if (qty <= 0 && !showZero) return null
  return (
    <span className={`owned-badge${qty > 0 ? ' has' : ''} ${className}`} title={`${qty} in your collection`}>
      {qty > 0 ? `✓ ${qty}` : 'not owned'}
    </span>
  )
}
