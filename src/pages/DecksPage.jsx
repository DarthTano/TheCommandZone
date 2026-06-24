import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDecks, makeCardLookup } from '../state/DeckContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { Modal } from '../components/Modal.jsx'
import { ImportModal } from '../components/ImportModal.jsx'
import { ManaPips } from '../components/ManaPips.jsx'
import { FORMATS, FORMAT_LIST, DEFAULT_FORMAT, validateDeck, commanderIdentity, deckColorBreakdown } from '../lib/formats.js'
import { imageUris } from '../lib/scryfall.js'
import { generateRandomCommanderDeck } from '../lib/randomDeck.js'

export function DecksPage() {
  const { decks, createDeck, importDeck, deleteDeck, duplicateDeck } = useDecks()
  const nav = useNavigate()
  const toast = useToast()
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [rolling, setRolling] = useState(false)

  async function rollRandom() {
    if (rolling) return
    setRolling(true)
    toast.toast('Rolling up a random Commander deck…')
    try {
      const result = await generateRandomCommanderDeck()
      const id = importDeck(result.name, 'commander', result)
      toast.ok(`Built "${result.name}".`)
      nav(`/decks/${id}`)
    } catch (e) {
      toast.err(`Couldn’t build a random deck: ${e.message}`)
    } finally {
      setRolling(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Your Decks</h1>
        <div className="spacer" />
        <button className="ghost" onClick={rollRandom} disabled={rolling}>
          {rolling ? <><span className="spin">⟳</span> Rolling…</> : '🎲 Random deck'}
        </button>
        <button className="ghost" onClick={() => setShowImport(true)}>⬆ Import list</button>
        <button className="primary" onClick={() => setShowNew(true)}>+ New deck</button>
      </div>

      {decks.length === 0 ? (
        <div className="empty">
          <div className="big">⚒️</div>
          <p>No decks yet. Forge your first Commander deck, or import a list from Moxfield / Archidekt / MTGA.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button className="primary" onClick={() => setShowNew(true)}>+ New deck</button>
            <button className="ghost" onClick={() => setShowImport(true)}>⬆ Import list</button>
          </div>
        </div>
      ) : (
        <div className="grid-decks">
          {decks.map((d) => (
            <DeckTile
              key={d.id}
              deck={d}
              onOpen={() => nav(`/decks/${d.id}`)}
              onDuplicate={() => { const id = duplicateDeck(d.id); toast.ok('Duplicated.'); }}
              onDelete={() => { if (confirm(`Delete "${d.name}"?`)) { deleteDeck(d.id); toast.ok('Deck deleted.') } }}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewDeckModal
          onClose={() => setShowNew(false)}
          onCreate={(name, format) => {
            const id = createDeck(name, format)
            setShowNew(false)
            nav(`/decks/${id}`)
          }}
        />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={(id) => nav(`/decks/${id}`)} />
      )}
    </div>
  )
}

function DeckTile({ deck, onOpen, onDuplicate, onDelete }) {
  const getCard = makeCardLookup(deck)
  const fmt = FORMATS[deck.format] || FORMATS.commander
  const commanderCards = (deck.commanders || []).map(getCard).filter(Boolean)
  const identity = fmt.commander
    ? commanderIdentity(commanderCards)
    : Object.keys(deckColorBreakdown(Object.values(deck.cards || {}), getCard)).filter(
        (c) => c !== 'C' && deckColorBreakdown(Object.values(deck.cards || {}), getCard)[c],
      )
  const art = commanderCards[0] ? imageUris(commanderCards[0])?.art_crop : null
  const result = validateDeck(deck, getCard)
  const cardCount = Object.values(deck.cards || {}).reduce((s, e) => s + e.qty, 0) + (fmt.commander ? deck.commanders.length : 0)

  return (
    <div className="deck-card" onClick={onOpen}>
      <div className="art" style={art ? { backgroundImage: `url(${art})` } : undefined}>
        <span className="fmt">{fmt.label}</span>
      </div>
      <div className="body">
        <h3>{deck.name}</h3>
        <div className="meta">
          <ManaPips identity={identity} colorless={identity.length === 0} />
          <span>· {cardCount} cards</span>
        </div>
        <div className="meta" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <span className={`badge ${result.legal ? 'ok' : 'bad'}`}>
            {result.legal ? '✓ Legal' : `✗ ${result.violations.length}`}
          </span>
          <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <button className="ghost icon sm" title="Duplicate" onClick={onDuplicate}>⧉</button>
            <button className="ghost icon sm danger" title="Delete" onClick={onDelete}>🗑</button>
          </span>
        </div>
      </div>
    </div>
  )
}

function NewDeckModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState(DEFAULT_FORMAT)
  return (
    <Modal title="New deck" onClose={onClose}>
      <div className="field">
        <label>Deck name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My Commander deck"
          onKeyDown={(e) => e.key === 'Enter' && onCreate(name || 'Untitled Deck', format)} />
      </div>
      <div className="field">
        <label>Format</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMAT_LIST.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <span className="faint" style={{ fontSize: 12 }}>{FORMATS[format].blurb}</span>
      </div>
      <div className="row">
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => onCreate(name || 'Untitled Deck', format)}>Create</button>
      </div>
    </Modal>
  )
}
