import { useEffect, useState } from 'react'
import { Modal } from './Modal.jsx'
import { ManaPips } from './ManaPips.jsx'
import { getRulings, getPrintings, imageUris, colorIdentity, cardById } from '../lib/scryfall.js'
import { useDecks } from '../state/DeckContext.jsx'
import { useCollection } from '../state/CollectionContext.jsx'
import { useToast } from '../state/ToastContext.jsx'

const LEGAL_FORMATS = ['standard', 'pioneer', 'modern', 'pauper', 'legacy', 'vintage', 'commander', 'brawl']

export function CardDetailModal({ card: initial, onClose }) {
  const [card, setCard] = useState(initial)
  const [face, setFace] = useState(0)
  const [tab, setTab] = useState('details') // details | rulings | printings
  const [rulings, setRulings] = useState(null)
  const [printings, setPrintings] = useState(null)
  const decks = useDecks()
  const coll = useCollection()
  const toast = useToast()
  const [qty, setQty] = useState(1)

  // reset when a different card opens
  useEffect(() => { setCard(initial); setFace(0); setTab('details'); setRulings(null); setPrintings(null) }, [initial])

  useEffect(() => {
    let ok = true
    if (tab === 'rulings' && rulings === null) getRulings(card).then((r) => ok && setRulings(r)).catch(() => ok && setRulings([]))
    if (tab === 'printings' && printings === null) getPrintings(card).then((p) => ok && setPrintings(p)).catch(() => ok && setPrintings([]))
    return () => { ok = false }
  }, [tab, card]) // eslint-disable-line react-hooks/exhaustive-deps

  const faces = card.card_faces?.length ? card.card_faces : [card]
  const img = (card.card_faces?.[face]?.image_uris || card.image_uris || imageUris(card))?.normal
  const owned = coll?.ownedQty(card.name) || 0
  const price = card.prices?.usd
  const priceFoil = card.prices?.usd_foil

  return (
    <Modal title={card.name} onClose={onClose} wide>
      <div className="cd-grid">
        <div className="cd-art">
          {img ? <img src={img} alt={card.name} /> : <div className="card-noimg">{card.name}</div>}
          {card.card_faces?.length > 1 && (
            <button className="ghost sm" style={{ marginTop: 8, width: '100%' }} onClick={() => setFace((f) => (f + 1) % card.card_faces.length)}>⟳ Flip</button>
          )}
        </div>

        <div className="cd-body">
          <div className="cd-tabs">
            {['details', 'rulings', 'printings'].map((t) => (
              <button key={t} className={`cd-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="cd-details">
              {faces.map((f, i) => (
                <div key={i} style={{ marginBottom: faces.length > 1 ? 12 : 0 }}>
                  {faces.length > 1 && <div style={{ fontWeight: 700 }}>{f.name}</div>}
                  <div className="muted" style={{ fontSize: 13 }}>
                    {f.type_line}{f.mana_cost ? ` · ${f.mana_cost.replace(/[{}]/g, '')}` : ''}
                  </div>
                  {f.oracle_text && <p className="cd-oracle">{f.oracle_text}</p>}
                  {(f.power || f.toughness) && <div className="faint">{f.power}/{f.toughness}</div>}
                </div>
              ))}

              <div className="cd-row"><span className="cd-k">Color identity</span>
                <ManaPips identity={colorIdentity(card)} colorless={colorIdentity(card).length === 0} /></div>
              <div className="cd-row"><span className="cd-k">Set</span><span>{card.set_name} ({(card.set || '').toUpperCase()}) · {card.rarity}</span></div>
              <div className="cd-row"><span className="cd-k">Price</span>
                <span>{price ? `$${price}` : '—'}{priceFoil ? ` · foil $${priceFoil}` : ''}</span></div>

              <div className="cd-legal">
                {LEGAL_FORMATS.map((fmt) => {
                  const s = card.legalities?.[fmt] || 'not_legal'
                  return <span key={fmt} className={`legal-chip ${s}`}>{fmt}</span>
                })}
              </div>

              {/* actions */}
              <div className="cd-actions">
                <div className="cd-coll">
                  <span className="faint">Owned: {owned}</span>
                  <input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 56 }} />
                  <button className="sm" onClick={() => { coll.add(card.name, qty); toast.ok(`Added ${qty}× ${card.name} to collection.`) }}>+ Collection</button>
                </div>
                <select defaultValue="" onChange={(e) => {
                  const d = decks.getDeck(e.target.value); if (!d) return
                  decks.addCard(d.id, card, 1); toast.ok(`Added to ${d.name}.`); e.target.value = ''
                }}>
                  <option value="" disabled>+ Add to a deck…</option>
                  {decks.decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {tab === 'rulings' && (
            <div className="cd-rulings">
              {rulings === null ? <div className="faint"><span className="spin">⟳</span> loading…</div>
                : rulings.length === 0 ? <div className="faint">No rulings for this card.</div>
                : rulings.map((r, i) => (
                  <div key={i} className="ruling"><span className="faint">{r.published_at}</span><div>{r.comment}</div></div>
                ))}
            </div>
          )}

          {tab === 'printings' && (
            <div className="cd-prints">
              {printings === null ? <div className="faint"><span className="spin">⟳</span> loading…</div>
                : printings.map((p) => (
                  <button key={p.id} className={`print-row${p.id === card.id ? ' cur' : ''}`} onClick={() => cardById(p.id).then((c) => c && setCard(c))}>
                    <span className="cn">{p.set_name} ({(p.set || '').toUpperCase()})</span>
                    <span className="faint">{p.rarity}</span>
                    <span>{p.prices?.usd ? `$${p.prices.usd}` : '—'}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
