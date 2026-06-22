import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDecks, makeCardLookup } from '../state/DeckContext.jsx'
import { useCollection } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { useCardHover } from '../components/CardHover.jsx'
import { ManaPips, IdentityBar } from '../components/ManaPips.jsx'
import { OwnedBadge } from '../components/OwnedBadge.jsx'
import { Modal } from '../components/Modal.jsx'
import {
  searchCards, imageUris, primaryType, TYPE_GROUPS, colorIdentity,
} from '../lib/scryfall.js'
import {
  FORMATS, FORMAT_LIST, validateDeck, manaCurve, deckColorBreakdown, commanderIdentity,
} from '../lib/formats.js'
import { exportDecklist } from '../lib/decklist.js'

export function DeckBuilderPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const decksApi = useDecks()
  const toast = useToast()
  const deck = decksApi.getDeck(id)
  const { preview, bind } = useCardHover()
  const [showExport, setShowExport] = useState(false)

  if (!deck) {
    return (
      <div className="empty">
        <p>Deck not found.</p>
        <button className="primary" onClick={() => nav('/decks')}>← Back to decks</button>
      </div>
    )
  }

  const getCard = makeCardLookup(deck)
  const fmt = FORMATS[deck.format] || FORMATS.commander
  const entries = Object.values(deck.cards || {})
  const result = useMemo(() => validateDeck(deck, getCard), [deck])
  const commanderCards = (deck.commanders || []).map(getCard).filter(Boolean)

  return (
    <div>
      {preview}
      <div className="page-head">
        <button className="ghost" onClick={() => nav('/decks')}>←</button>
        <input
          value={deck.name}
          onChange={(e) => decksApi.renameDeck(deck.id, e.target.value)}
          style={{ fontSize: 22, fontWeight: 700, background: 'transparent', border: 'none', minWidth: 200 }}
        />
        <select value={deck.format} onChange={(e) => decksApi.setFormat(deck.id, e.target.value)}>
          {FORMAT_LIST.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <div className="spacer" />
        <button className="ghost" onClick={() => setShowExport(true)}>⬇ Export</button>
      </div>

      <div className="builder">
        <SearchColumn deck={deck} decksApi={decksApi} fmt={fmt} bind={bind} toast={toast} />
        <DeckListColumn deck={deck} decksApi={decksApi} fmt={fmt} getCard={getCard} bind={bind} commanderCards={commanderCards} />
        <StatsColumn deck={deck} fmt={fmt} entries={entries} getCard={getCard} result={result} commanderCards={commanderCards} bind={bind} />
      </div>

      {showExport && <ExportModal deck={deck} getCard={getCard} onClose={() => setShowExport(false)} toast={toast} />}
    </div>
  )
}

// ---------------- Search column ----------------
function SearchColumn({ deck, decksApi, fmt, bind, toast }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState('')
  const reqId = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setInfo(''); return }
    const my = ++reqId.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        // bias Commander toward color identity of the commander, if any
        const { cards, total } = await searchCards(term)
        if (my !== reqId.current) return
        setResults(cards.slice(0, 60))
        setInfo(total > cards.length ? `${total} matches — showing first ${Math.min(60, cards.length)}` : `${total} match${total === 1 ? '' : 'es'}`)
      } catch (e) {
        if (my === reqId.current) { setResults([]); setInfo('Search error') }
      } finally {
        if (my === reqId.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="panel">
      <p className="col-head">Add cards</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search Scryfall… (e.g. counterspell, t:dragon)"
        style={{ width: '100%' }}
      />
      <div className="faint" style={{ fontSize: 12, margin: '6px 0 10px' }}>
        {loading ? <><span className="spin">⟳</span> searching…</> : info || 'Supports Scryfall syntax (c:, t:, o:, cmc>=3…)'}
      </div>
      <div className="search-results">
        {results.map((card) => {
          const canCmd = fmt.commander && cardCanBeCommander(card)
          return (
            <div className="search-row" key={card.id}>
              <div className="nm" {...bind(card)}>
                <div className="t">{card.name} <OwnedBadge name={card.name} /></div>
                <div className="s">{card.type_line} · {manaText(card)}</div>
              </div>
              {canCmd && (
                <button className="ghost sm" title="Set as commander"
                  onClick={() => { decksApi.toggleCommander(deck.id, card); toast.ok(`${card.name} → commander`) }}>★</button>
              )}
              <button className="sm" onClick={() => { decksApi.addCard(deck.id, card, 1); toast.ok(`+ ${card.name}`) }}>+</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------- Deck list column ----------------
function DeckListColumn({ deck, decksApi, fmt, getCard, bind, commanderCards }) {
  const entries = Object.values(deck.cards || {})
  const groups = {}
  for (const e of entries) {
    const t = primaryType(e.card || getCard(e.name))
    ;(groups[t] ||= []).push(e)
  }
  const maybe = Object.values(deck.maybe || {})

  return (
    <div className="panel">
      {/* commander row */}
      {fmt.commander && (
        <div style={{ marginBottom: 14 }}>
          <p className="col-head">Commander</p>
          {commanderCards.length === 0 ? (
            <div className="faint" style={{ fontSize: 13 }}>Search a legendary creature and click ★ to set your commander.</div>
          ) : (
            commanderCards.map((c) => (
              <div className="card-row" key={c.id}>
                <span style={{ color: 'var(--accent-2)' }}>★</span>
                <span className="cn" {...bind(c)}>{c.name}</span>
                <ManaPips identity={colorIdentity(c)} colorless={colorIdentity(c).length === 0} />
                <button className="ghost icon sm" title="Remove" onClick={() => decksApi.toggleCommander(deck.id, c)}>✕</button>
              </div>
            ))
          )}
        </div>
      )}

      <p className="col-head">
        Deck · {entries.reduce((s, e) => s + e.qty, 0)} cards
      </p>
      <div className="deck-list">
        {TYPE_GROUPS.filter((t) => groups[t]?.length).map((t) => (
          <div className="type-group" key={t}>
            <div className="gh">{t} <span className="faint">({groups[t].reduce((s, e) => s + e.qty, 0)})</span></div>
            {groups[t]
              .sort((a, b) => (a.card?.cmc || 0) - (b.card?.cmc || 0) || a.name.localeCompare(b.name))
              .map((e) => (
                <CardRow key={e.name} entry={e} deck={deck} decksApi={decksApi} fmt={fmt} bind={bind} />
              ))}
          </div>
        ))}
        {entries.length === 0 && <div className="faint" style={{ fontSize: 13 }}>No cards yet — search on the left to add some.</div>}
      </div>

      {maybe.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="col-head">Maybeboard · {maybe.reduce((s, e) => s + e.qty, 0)}</p>
          {maybe.map((e) => (
            <CardRow key={e.name} entry={e} deck={deck} decksApi={decksApi} fmt={fmt} bind={bind} board="maybe" />
          ))}
        </div>
      )}
    </div>
  )
}

function CardRow({ entry, deck, decksApi, fmt, bind, board = 'cards' }) {
  const card = entry.card
  const max = fmt.singleton ? 1 : fmt.maxCopies || 4
  return (
    <div className="card-row">
      <button className="ghost icon sm" onClick={() => decksApi.setQty(deck.id, entry.name, entry.qty - 1, board)}>−</button>
      <span className="q">{entry.qty}</span>
      <button className="ghost icon sm" onClick={() => decksApi.setQty(deck.id, entry.name, entry.qty + 1, board)} disabled={!fmt.basicLandsUnlimited && entry.qty >= max && !isBasic(card)}>+</button>
      <span className="cn" {...(card ? bind(card) : {})}>{entry.name}</span>
      {card && <span className="cmc">{manaText(card)}</span>}
      {board === 'cards' ? (
        <button className="ghost icon sm" title="To maybeboard" onClick={() => decksApi.moveBoard(deck.id, entry.name, 'cards', 'maybe')}>⤓</button>
      ) : (
        <button className="ghost icon sm" title="To deck" onClick={() => decksApi.moveBoard(deck.id, entry.name, 'maybe', 'cards')}>⤒</button>
      )}
      <button className="ghost icon sm danger" title="Remove" onClick={() => decksApi.removeCard(deck.id, entry.name, board)}>✕</button>
    </div>
  )
}

// ---------------- Stats / legality column ----------------
function StatsColumn({ deck, fmt, entries, getCard, result, commanderCards, bind }) {
  const coll = useCollection()
  const curve = useMemo(() => manaCurve(entries, getCard), [deck])
  const colors = useMemo(() => deckColorBreakdown(entries, getCard), [deck])
  const identity = fmt.commander ? commanderIdentity(commanderCards) : Object.keys(colors).filter((c) => c !== 'C' && colors[c])
  const maxBar = Math.max(1, ...curve)
  const art = commanderCards[0] ? imageUris(commanderCards[0]) : null

  // how many of this deck's cards you own (capped per card)
  const allEntries = [...entries, ...commanderCards.map((c) => ({ name: c.name, qty: 1 }))]
  const totalNeeded = allEntries.reduce((s, e) => s + e.qty, 0)
  const ownedHave = allEntries.reduce((s, e) => s + Math.min(coll?.ownedQty(e.name) || 0, e.qty), 0)

  return (
    <div className="panel stat-block">
      {art && (
        <div className="commander-slot" {...bind(commanderCards[0])}>
          <img src={art.normal} alt={commanderCards[0].name} />
        </div>
      )}

      <div>
        <p className="col-head">Legality · {fmt.label}</p>
        <div className={`badge ${result.legal ? 'ok' : 'bad'}`} style={{ marginBottom: 6 }}>
          {result.legal ? '✓ Legal' : `✗ ${result.violations.length} issue${result.violations.length === 1 ? '' : 's'}`}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>{result.total}/{result.needed} cards</div>
        {(result.violations.length > 0 || result.warnings.length > 0) && (
          <ul className="violations">
            {result.violations.map((v, i) => <li key={`v${i}`}>✗ {v}</li>)}
            {result.warnings.map((w, i) => <li key={`w${i}`} className="warn">⚠ {w}</li>)}
          </ul>
        )}
        {totalNeeded > 0 && (
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            🗃️ You own {ownedHave}/{totalNeeded} cards{ownedHave >= totalNeeded ? ' — full deck!' : ''}
          </div>
        )}
      </div>

      <div>
        <p className="col-head">Color identity</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ManaPips identity={identity} colorless={identity.length === 0} />
        </div>
        <IdentityBar counts={colors} />
      </div>

      <div>
        <p className="col-head">Mana curve</p>
        <div className="curve">
          {curve.map((n, i) => (
            <div className="bar" key={i} style={{ height: `${(n / maxBar) * 100}%` }} title={`${i === 7 ? '7+' : i} CMC: ${n}`}>
              {n > 0 && <span>{n}</span>}
            </div>
          ))}
        </div>
        <div className="curve-labels">
          {['0', '1', '2', '3', '4', '5', '6', '7+'].map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>
    </div>
  )
}

// ---------------- export modal ----------------
function ExportModal({ deck, getCard, onClose, toast }) {
  const text = useMemo(() => exportDecklist(deck, getCard), [deck])
  return (
    <Modal title="Export decklist" onClose={onClose} wide>
      <textarea readOnly rows={16} value={text} style={{ width: '100%', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }} />
      <div className="row">
        <button className="ghost" onClick={onClose}>Close</button>
        <button className="primary" onClick={() => { navigator.clipboard?.writeText(text); toast.ok('Copied to clipboard.') }}>Copy</button>
      </div>
    </Modal>
  )
}

// ---------------- helpers ----------------
function manaText(card) {
  const mc = card.mana_cost || card.card_faces?.[0]?.mana_cost || ''
  return mc.replace(/[{}]/g, '') || (primaryType(card) === 'Land' ? 'Land' : '—')
}
function isBasic(card) {
  return (card?.type_line || '').includes('Basic') && (card?.type_line || '').includes('Land')
}
export function cardCanBeCommander(card) {
  const line = card.type_line || ''
  const text = card.oracle_text || ''
  return (line.includes('Legendary') && line.includes('Creature')) || text.includes('can be your commander')
}
