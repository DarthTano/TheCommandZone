// OCR for the card scanner. Lazy-loads tesseract.js (so it's a separate chunk,
// not in the main bundle) and reuses a single worker across scans.

let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      // 'eng' model is fetched from CDN on first use (~few MB), then cached.
      return createWorker('eng')
    })()
  }
  return workerPromise
}

// Run OCR on an image source (canvas, blob, <img>, data URL, or file path in
// node) and return the most title-like cleaned line.
export async function recognizeTitle(image) {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  return cleanTitle(data.text || '')
}

// Raw OCR text (for the set/collector strip).
export async function recognizeText(image) {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  return data.text || ''
}

// Best-effort parse of a card's bottom-left line(s) → { set, number }.
// Modern frames read like "0123/0456 C" then "M21 • EN • <artist>". We pull the
// 3–5 char set code and the collector number.
export function parseSetCollector(raw = '') {
  const text = raw.toUpperCase().replace(/[|]/g, '')
  // collector number: digits, optionally NNN/NNN (take the first group)
  const numMatch = text.match(/\b(\d{1,4})\s*\/\s*\d{1,4}\b/) || text.match(/\b(\d{1,4})\b/)
  // set code: a 3–5 char token of letters/digits that isn't purely digits and isn't "EN"
  const tokens = text.match(/\b[A-Z0-9]{3,5}\b/g) || []
  const setCode = tokens.find((t) => /[A-Z]/.test(t) && !/^\d+$/.test(t) && t !== 'EN' && t !== 'ENG')
  const number = numMatch ? numMatch[1].replace(/^0+(?=\d)/, '') : null
  if (!setCode || !number) return null
  return { set: setCode, number }
}

// Card names are letters + spaces + a few punctuation marks. Take the longest
// plausible line and strip OCR noise.
export function cleanTitle(raw = '') {
  const lines = raw
    .split('\n')
    .map((s) => s.replace(/[^A-Za-z ,'\-\/]/g, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 3)
  if (!lines.length) return ''
  // prefer the longest line (the name is usually the longest run of letters)
  return lines.sort((a, b) => b.length - a.length)[0]
}

export async function terminateOcr() {
  if (workerPromise) {
    try { const w = await workerPromise; await w.terminate() } catch { /* ignore */ }
    workerPromise = null
  }
}
