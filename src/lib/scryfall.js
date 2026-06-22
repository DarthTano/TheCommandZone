// Scryfall API data layer.
// Docs: https://scryfall.com/docs/api  — free, no key required.
// Scryfall asks clients to insert 50–100ms between requests and to send a
// User-Agent + Accept header. Browsers won't let us set User-Agent, but we
// throttle politely and cache aggressively in localStorage.

const API = 'https://api.scryfall.com'
const CACHE_KEY = 'manaforge.cardcache.v1'
const MIN_GAP_MS = 90

// ---- request throttle (serialise + space out calls) ----
let chain = Promise.resolve()
function throttled(fn) {
  const run = chain.then(() => fn())
  // advance the chain regardless of success, with a small gap
  chain = run.then(
    () => sleep(MIN_GAP_MS),
    () => sleep(MIN_GAP_MS),
  )
  return run
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- persistent card cache (keyed by lowercased oracle/exact name) ----
let memCache = null
function loadCache() {
  if (memCache) return memCache
  try {
    memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    memCache = {}
  }
  return memCache
}
let saveTimer = null
function saveCache() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(memCache))
    } catch {
      /* quota — ignore, mem cache still serves the session */
    }
  }, 400)
}
const nameKey = (n) => (n || '').trim().toLowerCase()

function cacheCard(card) {
  if (!card || !card.name) return card
  const c = loadCache()
  c[nameKey(card.name)] = card
  // double-faced cards are also searchable by their front face name
  if (card.card_faces?.[0]?.name) c[nameKey(card.card_faces[0].name)] = card
  saveCache()
  return card
}
export function getCachedCard(name) {
  return loadCache()[nameKey(name)] || null
}

// ---- shape we care about; keep full card too for previews ----
export function imageUris(card) {
  if (!card) return null
  if (card.image_uris) return card.image_uris
  // double-faced: use the front face
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris
  return null
}

async function get(path) {
  return throttled(async () => {
    const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return { object: 'not_found', notFound: true }
    if (!res.ok) throw new Error(`Scryfall ${res.status}: ${await res.text()}`)
    return res.json()
  })
}

// Full text search. Returns { cards, total, hasMore, nextPage }.
export async function searchCards(query, { page = 1 } = {}) {
  if (!query || !query.trim()) return { cards: [], total: 0, hasMore: false }
  const q = encodeURIComponent(query.trim())
  const data = await get(`/cards/search?q=${q}&unique=cards&order=name&page=${page}`)
  if (data.notFound || data.object === 'error') {
    return { cards: [], total: 0, hasMore: false }
  }
  ;(data.data || []).forEach(cacheCard)
  return {
    cards: data.data || [],
    total: data.total_cards || 0,
    hasMore: !!data.has_more,
    page,
  }
}

// Autocomplete card names (fast, for type-ahead).
export async function autocomplete(fragment) {
  if (!fragment || fragment.trim().length < 2) return []
  const data = await get(`/cards/autocomplete?q=${encodeURIComponent(fragment.trim())}`)
  return data.data || []
}

// Exact named lookup (cache-first).
export async function namedCard(name) {
  const cached = getCachedCard(name)
  if (cached) return cached
  const data = await get(`/cards/named?exact=${encodeURIComponent(name)}`)
  if (data.notFound) return null
  return cacheCard(data)
}

// Batch resolve up to 75 names at once via POST /cards/collection.
// identifiers: array of names (strings). Returns { found: Map(nameKey->card), notFound: [names] }.
export async function resolveCollection(names) {
  const found = new Map()
  const notFound = []
  const pending = []

  // serve from cache first
  for (const name of names) {
    const c = getCachedCard(name)
    if (c) found.set(nameKey(name), c)
    else pending.push(name)
  }

  // chunk the rest into batches of 75
  for (let i = 0; i < pending.length; i += 75) {
    const chunk = pending.slice(i, i + 75)
    const body = { identifiers: chunk.map((n) => ({ name: n })) }
    const data = await throttled(async () => {
      const res = await fetch(`${API}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Scryfall collection ${res.status}`)
      return res.json()
    })
    ;(data.data || []).forEach((card) => {
      cacheCard(card)
      found.set(nameKey(card.name), card)
    })
    // map Scryfall's not_found identifiers back to the input names
    const foundLower = new Set((data.data || []).map((c) => nameKey(c.name)))
    for (const n of chunk) {
      if (!found.has(nameKey(n)) && !foundLower.has(nameKey(n))) notFound.push(n)
    }
  }
  return { found, notFound }
}

// ---- light helpers on the card object ----
export const cardCmc = (card) => (typeof card?.cmc === 'number' ? card.cmc : 0)

// Primary type bucket for grouping in the deck list.
const TYPE_ORDER = [
  'Creature', 'Planeswalker', 'Battle', 'Sorcery', 'Instant',
  'Artifact', 'Enchantment', 'Land',
]
export function primaryType(card) {
  const line = card?.type_line || (card?.card_faces?.[0]?.type_line) || ''
  for (const t of TYPE_ORDER) if (line.includes(t)) return t
  return 'Other'
}
export const TYPE_GROUPS = [...TYPE_ORDER, 'Other']

// Color identity letters in WUBRG order (Commander uses identity, not cost).
export const WUBRG = ['W', 'U', 'B', 'R', 'G']
export function colorIdentity(card) {
  const ci = card?.color_identity || []
  return WUBRG.filter((c) => ci.includes(c))
}
