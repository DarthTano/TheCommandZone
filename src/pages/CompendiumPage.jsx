import { useEffect, useRef, useState } from 'react'
import { searchCards, imageUris } from '../lib/scryfall.js'
import { CardDetailModal } from '../components/CardDetailModal.jsx'
import { OwnedBadge } from '../components/OwnedBadge.jsx'

const COLORS = [['W', 'White'], ['U', 'Blue'], ['B', 'Black'], ['R', 'Red'], ['G', 'Green'], ['C', 'Colorless']]
const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land']
const RARITIES = [['common', 'C'], ['uncommon', 'U'], ['rare', 'R'], ['mythic', 'M']]

export function CompendiumPage() {
  const [text, setText] = useState('')
  const [colors, setColors] = useState([])
  const [type, setType] = useState('')
  const [rarity, setRarity] = useState('')
  const [format, setFormat] = useState('')
  const [cards, setCards] = useState([])
  const [info, setInfo] = useState('Search for cards, or pick some filters.')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState(null)
  const reqId = useRef(0)

  const query = buildQuery({ text, colors, type, rarity, format })

  useEffect(() => {
    setPage(1)
    if (!query) { setCards([]); setInfo('Search for cards, or pick some filters.'); return }
    const my = ++reqId.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const { cards: c, total, hasMore } = await searchCards(query, { page: 1 })
        if (my !== reqId.current) return
        setCards(c); setHasMore(hasMore)
        setInfo(total === 0 ? 'No cards match.' : `${total} card${total === 1 ? '' : 's'}`)
      } catch { if (my === reqId.current) { setCards([]); setInfo('Search error') } }
      finally { if (my === reqId.current) setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  async function loadMore() {
    const next = page + 1
    setLoading(true)
    try {
      const { cards: c, hasMore } = await searchCards(query, { page: next })
      setCards((prev) => [...prev, ...c]); setHasMore(hasMore); setPage(next)
    } finally { setLoading(false) }
  }

  const toggleColor = (c) => setColors((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c])

  return (
    <div>
      <div className="page-head"><h1>Compendium</h1><span className="muted">{info}</span></div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }}
          placeholder="Search Scryfall — name or syntax (t:dragon, o:flying, cmc>=5, pow>=4)…" />
        <div className="comp-filters">
          <div className="pips" style={{ gap: 5 }}>
            {COLORS.map(([c, label]) => (
              <button key={c} title={label} className={`pip ${c} filter-pip${colors.includes(c) ? ' on' : ''}`} onClick={() => toggleColor(c)}>{c}</button>
            ))}
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">Any rarity</option>
            {RARITIES.map(([r, l]) => <option key={r} value={r}>{l === 'C' ? 'Common' : l === 'U' ? 'Uncommon' : l === 'R' ? 'Rare' : 'Mythic'}</option>)}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">Any format</option>
            {['commander', 'standard', 'pioneer', 'modern', 'pauper', 'legacy', 'vintage'].map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)} legal</option>)}
          </select>
          {(colors.length || type || rarity || format) ? <button className="ghost sm" onClick={() => { setColors([]); setType(''); setRarity(''); setFormat('') }}>clear filters</button> : null}
        </div>
      </div>

      {cards.length === 0 && !loading ? (
        <div className="empty"><div className="big">📚</div><p>{info}</p></div>
      ) : (
        <>
          <div className="card-grid">
            {cards.map((card) => {
              const im = imageUris(card)
              return (
                <div key={card.id} className="grid-card" onClick={() => setSelected(card)}>
                  {im?.normal ? <img src={im.normal} alt={card.name} loading="lazy" /> : <div className="card-noimg">{card.name}</div>}
                  <OwnedBadge name={card.name} className="grid-owned" />
                </div>
              )
            })}
          </div>
          {(hasMore || loading) && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button onClick={loadMore} disabled={loading}>{loading ? <><span className="spin">⟳</span> loading…</> : 'Load more'}</button>
            </div>
          )}
        </>
      )}

      {selected && <CardDetailModal card={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// Compose a Scryfall query from the search box + filters.
function buildQuery({ text, colors, type, rarity, format }) {
  const parts = []
  if (text.trim()) parts.push(text.trim())
  if (colors.length) {
    if (colors.includes('C') && colors.length === 1) parts.push('c:colorless')
    else parts.push(`c>=${colors.filter((c) => c !== 'C').join('')}`)
  }
  if (type) parts.push(`t:${type.toLowerCase()}`)
  if (rarity) parts.push(`r:${rarity}`)
  if (format) parts.push(`legal:${format}`)
  return parts.join(' ').trim()
}
