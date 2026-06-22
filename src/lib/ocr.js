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
