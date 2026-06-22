import { WUBRG } from '../lib/scryfall.js'

// Show a row of color-identity pips (WUBRG order, C for colorless).
export function ManaPips({ identity, colorless = false }) {
  const colors = identity && identity.length ? identity : colorless ? ['C'] : []
  if (!colors.length) return <span className="faint">—</span>
  return (
    <span className="pips">
      {colors.map((c) => (
        <span key={c} className={`pip ${c}`} title={c}>{c}</span>
      ))}
    </span>
  )
}

// A proportional color bar for the whole deck. counts = {W,U,B,R,G,C}
export function IdentityBar({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const order = [...WUBRG, 'C']
  return (
    <div className="identity-bar" title="Color breakdown">
      {order.map((c) =>
        counts[c] ? (
          <div
            key={c}
            className={`seg ${c}`}
            style={{ width: `${(counts[c] / total) * 100}%` }}
            title={`${c}: ${counts[c]}`}
          />
        ) : null,
      )}
    </div>
  )
}
