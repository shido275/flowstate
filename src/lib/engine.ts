import COMMON_RAW from '../data/common-words.txt?raw'
import { STOPWORDS } from './wordbank'

const STRESS_RE = /[012]$/
const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
])

/** ARPABET phones with an optional 0/1/2 stress digit, e.g. "JH AO1 N". */
export const PHONE_RE = /^[A-Z]{1,2}[012]?(\s+[A-Z]{1,2}[012]?)*$/

/** Slang and dialect spellings the CMU dictionary does not carry. */
const EXTRA_PRONUNCIATIONS: Record<string, string> = {
  jawn: 'JH AO1 N',
  glizzy: 'G L IH1 Z IY0',
  henny: 'HH EH1 N IY0',
  bape: 'B EY1 P',
  drizzy: 'D R IH1 Z IY0',
  'k-dot': 'K EY1 D AA2 T',
  kdot: 'K EY1 D AA2 T',
  finna: 'F IH1 N AH0',
  tryna: 'T R AY1 N AH0',
  gonna: 'G AA1 N AH0',
  wanna: 'W AA1 N AH0',
  gotta: 'G AA1 T AH0',
  bout: 'B AW1 T',
  'fit': 'F IH1 T',
  bougie: 'B UW1 ZH IY0',
  thottie: 'TH AA1 T IY0',
  bussin: 'B AH1 S IH0 N',
  litty: 'L IH1 T IY0',
  drip: 'D R IH1 P',
  sauce: 'S AO1 S',
  opp: 'AA1 P',
  opps: 'AA1 P S',
  block: 'B L AA1 K',
  reppin: 'R EH1 P IH0 N',
  flexin: 'F L EH1 K S IH0 N',
  slidin: 'S L AY1 D IH0 N',
  ridin: 'R AY1 D IH0 N',
  trippin: 'T R IH1 P IH0 N',
}

/* --------------------------- dictionary lifecycle -------------------------- */
/*
 * The CMU dictionary is several megabytes, so it is fetched as its own chunk
 * after the app shell paints. Until it lands, syllable counts fall back to a
 * letter heuristic and rhyme colouring waits; both correct themselves as soon
 * as the chunk is parsed.
 */

type Pronunciations = Record<string, string>

let status: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
let epoch = 0
const dictionaryListeners = new Set<() => void>()
let basePronMap: Map<string, string[]> | null = null
let pronMap: Map<string, string[]> | null = null
let userLexicon: Record<string, string> = {}
let resolveReady: (() => void) | null = null
const readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve
})

export function subscribeDictionary(listener: () => void): () => void {
  dictionaryListeners.add(listener)
  return () => {
    dictionaryListeners.delete(listener)
  }
}

/** Bumps whenever the pronunciation data (or the user's lexicon) changes. */
export function dictionaryEpoch(): number {
  return epoch
}

export function dictionaryState(): 'idle' | 'loading' | 'ready' | 'error' {
  return status
}

/** Resolves once the dictionary has loaded (or failed to). */
export function dictionaryReady(): Promise<void> {
  ensureDictionary()
  return readyPromise
}

export function ensureDictionary(): void {
  if (status !== 'idle') return
  status = 'loading'
  import('cmu-pronouncing-dictionary')
    .then((mod) => {
      buildPronMap(mod.dictionary as Pronunciations)
      status = 'ready'
    })
    .catch(() => {
      status = 'error'
    })
    .finally(() => {
      bump()
      resolveReady?.()
      resolveReady = null
    })
}

function buildPronMap(dictionary: Pronunciations): void {
  const map = new Map<string, string[]>()
  for (const [key, value] of Object.entries(dictionary)) {
    if (key.includes('(')) continue
    map.set(key.toLowerCase(), value.split(' '))
  }
  for (const [key, value] of Object.entries(EXTRA_PRONUNCIATIONS)) {
    map.set(key, value.split(' '))
  }
  basePronMap = map
  applyUserLexicon()
}

function applyUserLexicon(): void {
  if (!basePronMap) return
  const next = new Map(basePronMap)
  for (const [word, phones] of Object.entries(userLexicon)) {
    const clean = cleanWord(word)
    const normalised = phones.trim().toUpperCase()
    if (!clean || !PHONE_RE.test(normalised)) continue
    next.set(clean, normalised.split(/\s+/))
  }
  pronMap = next
}

/** Teaches the analyser how you actually say a word. */
export function setUserLexicon(lexicon: Record<string, string>): void {
  userLexicon = { ...lexicon }
  if (!basePronMap) return
  applyUserLexicon()
  bump()
}

function bump(): void {
  epoch++
  analysisCache.clear()
  rhymeCache.clear()
  candidates = null
  for (const listener of [...dictionaryListeners]) listener()
}

/* --------------------------------- helpers -------------------------------- */

const analysisCache = new Map<string, RhymeInfo | null>()

const stripStress = (phone: string) => phone.replace(STRESS_RE, '')
const cleanWord = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'-]/g, '')
    .replace(/^[-']+|[-']+$/g, '')

function phonesFor(word: string): string[] | null {
  if (!pronMap) return null
  const direct = pronMap.get(word)
  if (direct) return direct
  if (word.endsWith("'s")) {
    const base = pronMap.get(word.slice(0, -2))
    if (base) return [...base, 'Z']
  }
  if (word.endsWith("in'")) {
    const base = pronMap.get(word.replace(/in'$/, 'ing'))
    if (base) return base
  }
  const noApos = pronMap.get(word.replace(/'/g, ''))
  if (noApos) return noApos
  return null
}

export interface RhymeInfo {
  word: string
  phones: string[]
  syllables: number
  /** Stressed vowel of the final rhyme syllable, e.g. "AY". */
  vowel: string
  /** Everything after that vowel, stress stripped, e.g. "M". */
  coda: string
  /** Perfect rhyme key, e.g. "AY M". */
  key: string
  /** Tail from the previous vowel, for multi-syllable comparison. */
  key2?: string
}

export function analyzeWord(raw: string): RhymeInfo | null {
  const word = cleanWord(raw)
  if (!word) return null
  if (analysisCache.has(word)) return analysisCache.get(word)!
  const phones = phonesFor(word)
  if (!phones) {
    // Not a real miss while the dictionary is still in flight: leave it uncached
    // so the answer can change as soon as the chunk arrives.
    if (status === 'ready' || status === 'error') analysisCache.set(word, null)
    return null
  }
  const vowelIdxs: number[] = []
  phones.forEach((p, i) => {
    if (VOWELS.has(stripStress(p))) vowelIdxs.push(i)
  })
  if (!vowelIdxs.length) {
    analysisCache.set(word, null)
    return null
  }
  // Rhyme from the last stressed vowel, not a trailing unstressed syllable:
  // "roses" (OW1 Z IH0 Z) rhymes on OW, never on the schwa.
  let lastStress = -1
  for (let i = vowelIdxs.length - 1; i >= 0; i--) {
    if (/[12]$/.test(phones[vowelIdxs[i]])) {
      lastStress = vowelIdxs[i]
      break
    }
  }
  if (lastStress < 0) lastStress = vowelIdxs[vowelIdxs.length - 1]
  const vowel = stripStress(phones[lastStress])
  const coda = phones
    .slice(lastStress + 1)
    .map(stripStress)
    .join(' ')
  const key = coda ? `${vowel} ${coda}` : vowel
  const previousVowels = vowelIdxs.filter((i) => i < lastStress)
  let key2: string | undefined
  if (previousVowels.length) {
    const prev = previousVowels[previousVowels.length - 1]
    key2 = phones
      .slice(prev)
      .map(stripStress)
      .join(' ')
  }
  const info: RhymeInfo = {
    word,
    phones,
    syllables: vowelIdxs.length,
    vowel,
    coda,
    key,
    key2,
  }
  analysisCache.set(word, info)
  return info
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function numberWords(n: number): string {
  if (n < 10) return ONES[n]
  if (n < 20) return TEENS[n - 10]
  if (n < 100) return `${TENS[Math.floor(n / 10)]} ${n % 10 ? ONES[n % 10] : ''}`.trim()
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred ${n % 100 ? numberWords(n % 100) : ''}`.trim()
  if (n < 1000000) return `${numberWords(Math.floor(n / 1000))} thousand ${n % 1000 ? numberWords(n % 1000) : ''}`.trim()
  return String(n)
}

export function heuristicSyllables(word: string): number {
  let s = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!s) return 0
  if (s.length <= 2) return 1
  s = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = s.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export function stripAdlibs(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
}

export function wordSyllables(raw: string): number {
  const token = raw.replace(/[’]/g, "'")
  if (!token) return 0
  if (/^[A-Z]{2,5}$/.test(token)) return token.length
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    if (Number.isFinite(n) && n < 1000000) return lineSyllables(numberWords(n))
    return String(token).length
  }
  const info = analyzeWord(token)
  if (info) return info.syllables
  return heuristicSyllables(token)
}

export function lineSyllables(text: string): number {
  const clean = stripAdlibs(text)
  const tokens = clean.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|\d+/g) || []
  return tokens.reduce((sum, t) => sum + wordSyllables(t), 0)
}

export interface LineToken {
  /** Full token including leading/trailing punctuation. */
  text: string
  /** Bare word for dictionary lookup (empty for whitespace/punctuation). */
  word: string
  start: number
  end: number
}

const WORD_CHARS = /[A-Za-z0-9'’\-]/

export function tokenizeLine(text: string): LineToken[] {
  const tokens: LineToken[] = []
  const re = /\s+|[^\s]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[0]
    if (/^\s+$/.test(raw)) {
      tokens.push({ text: raw, word: '', start: m.index, end: m.index + raw.length })
      continue
    }
    let s = 0
    let e = raw.length
    while (s < e && !WORD_CHARS.test(raw[s])) s++
    while (e > s && !WORD_CHARS.test(raw[e - 1])) e--
    tokens.push({
      text: raw,
      word: raw.slice(s, e).replace(/[’]/g, "'"),
      start: m.index + s,
      end: m.index + e,
    })
  }
  return tokens
}

export function endWord(text: string): string {
  const clean = stripAdlibs(text).trim()
  const tokens = tokenizeLine(clean).filter((t) => t.word)
  return tokens.length ? tokens[tokens.length - 1].word : ''
}

export function endRhyme(text: string): RhymeInfo | null {
  const w = endWord(text)
  return w ? analyzeWord(w) : null
}

export function rhymeFamilyKey(info: RhymeInfo | null, mode: 'strict' | 'rap' | 'loose'): string | null {
  if (!info) return null
  if (mode === 'strict') return info.key
  if (mode === 'rap') return info.vowel
  // Loose: group related vowel sounds, the way a region's accent blends them.
  const groups: Record<string, string> = {
    IY: 'front', IH: 'front', EH: 'front', EY: 'front',
    AE: 'open', AA: 'open', AH: 'open',
    AO: 'round', OW: 'round', OY: 'round',
    UW: 'back', UH: 'back',
    ER: 'rhotic', AY: 'diph-ay', AW: 'diph-aw',
  }
  return groups[info.vowel] ?? info.vowel
}

export interface RhymeEntry {
  word: string
  syllables: number
  rank: number
}

export interface RhymeResults {
  perfect: RhymeEntry[]
  multi: RhymeEntry[]
  slant: RhymeEntry[]
}

interface Candidate extends RhymeEntry {
  info: RhymeInfo
}

let candidates: Candidate[] | null = null

function getCandidates(): Candidate[] {
  if (!pronMap) return []
  if (candidates) return candidates
  const seen = new Set<string>()
  const list: Candidate[] = []
  const words = COMMON_RAW.split(/\r?\n/)
  words.forEach((raw, index) => {
    const w = raw.trim().toLowerCase()
    if (!w || seen.has(w) || w.length < 2 || w.length > 14) return
    if (!/^[a-z][a-z'-]*$/.test(w)) return
    seen.add(w)
    const info = analyzeWord(w)
    if (!info) return
    list.push({ word: w, syllables: info.syllables, rank: index, info })
  })
  candidates = list
  return list
}

const rhymeCache = new Map<string, RhymeResults>()

export function findRhymes(word: string): RhymeResults {
  const cacheKey = cleanWord(word)
  const cached = cacheKey ? rhymeCache.get(cacheKey) : undefined
  if (cached) return cached
  const target = analyzeWord(word)
  const empty: RhymeResults = { perfect: [], multi: [], slant: [] }
  if (!target) return empty
  const pool = getCandidates()
  const seen = new Set([target.word])
  const perfect: RhymeEntry[] = []
  const multi: RhymeEntry[] = []
  const slant: RhymeEntry[] = []
  for (const c of pool) {
    if (seen.has(c.word)) continue
    const inf = c.info
    let bucket: RhymeEntry[] | null = null
    if (inf.key === target.key) {
      bucket = c.syllables >= 3 ? multi : perfect
    } else if (inf.key2 && target.key2 && inf.key2 === target.key2 && inf.vowel === target.vowel) {
      bucket = multi
    } else if (inf.vowel === target.vowel) {
      bucket = slant
    } else if (inf.coda === target.coda && rhymeFamilyKey(inf, 'loose') === rhymeFamilyKey(target, 'loose')) {
      bucket = slant
    }
    if (bucket) {
      seen.add(c.word)
      bucket.push({ word: c.word, syllables: c.syllables, rank: c.rank })
    }
  }
  const byRelevance = (a: RhymeEntry, b: RhymeEntry) => a.rank - b.rank
  perfect.sort(byRelevance)
  multi.sort((a, b) => a.syllables - b.syllables || a.rank - b.rank)
  slant.sort(byRelevance)
  const result = {
    perfect: perfect.slice(0, 90),
    multi: multi.slice(0, 90),
    slant: slant.slice(0, 90),
  }
  if (rhymeCache.size > 300) rhymeCache.clear()
  rhymeCache.set(cacheKey, result)
  return result
}

export function sameSyllableWords(word: string, limit = 30): RhymeEntry[] {
  const target = analyzeWord(word)
  if (!target) return []
  const pool = getCandidates()
  const out: RhymeEntry[] = []
  for (const c of pool) {
    if (c.word === target.word) continue
    if (c.info.syllables !== target.syllables) continue
    if (STOPWORDS.has(c.word)) continue
    out.push({ word: c.word, syllables: c.syllables, rank: c.rank })
  }
  out.sort((a, b) => a.rank - b.rank)
  return out.slice(0, limit)
}

/* --------------------------------- scansion -------------------------------- */

export interface ScannedSyllable {
  /** Vowel phone without the stress digit, e.g. "AY" — "?" when guessed. */
  vowel: string
  /** 0 = unstressed, 1 = primary stress, 2 = secondary stress. */
  stress: 0 | 1 | 2
  /** True when the word is not in the dictionary and this is a guess. */
  guessed: boolean
}

export interface LineScan {
  syllables: ScannedSyllable[]
  /** Stresses that land on a four-syllable beat anchor. */
  onBeat: number
  /** Beat anchors in the line (one per four syllables). */
  beatSlots: number
  /** Words that had to be guessed because the dictionary did not have them. */
  guessedWords: string[]
}

export function scanLine(text: string): LineScan {
  const syllables: ScannedSyllable[] = []
  const guessedWords: string[] = []
  for (const token of tokenizeLine(stripAdlibs(text))) {
    if (!token.word) continue
    const info = analyzeWord(token.word)
    if (info) {
      for (const phone of info.phones) {
        const vowel = stripStress(phone)
        if (!VOWELS.has(vowel)) continue
        const digit = Number(phone.slice(-1))
        syllables.push({ vowel, stress: digit === 1 ? 1 : digit === 2 ? 2 : 0, guessed: false })
      }
    } else {
      const count = heuristicSyllables(token.word)
      guessedWords.push(token.word)
      for (let i = 0; i < count; i++) {
        syllables.push({ vowel: '?', stress: i % 2 === 0 ? 1 : 0, guessed: true })
      }
    }
  }
  let onBeat = 0
  for (let i = 0; i < syllables.length; i += 4) {
    if (syllables[i].stress === 1) onBeat++
  }
  return { syllables, onBeat, beatSlots: Math.ceil(syllables.length / 4), guessedWords }
}

/* -------------------------------- families -------------------------------- */

/** Groups rhyme families for colouring, counting how often each appears. */
export interface FamilyInfo {
  counts: Map<string, number>
  colors: Map<string, number>
  order: string[]
}

export function collectFamilies(
  lines: string[],
  mode: 'strict' | 'rap' | 'loose' | 'off',
): FamilyInfo {
  const counts = new Map<string, number>()
  const order: string[] = []
  if (mode !== 'off') {
    for (const line of lines) {
      for (const token of tokenizeLine(line)) {
        if (!token.word) continue
        const info = analyzeWord(token.word)
        const key = rhymeFamilyKey(info, mode)
        if (!key) continue
        const n = (counts.get(key) ?? 0) + 1
        if (n === 1) order.push(key)
        counts.set(key, n)
      }
    }
  }
  const colors = new Map<string, number>()
  let i = 0
  for (const key of order) {
    if ((counts.get(key) ?? 0) < 2) continue
    colors.set(key, i % 15)
    i++
  }
  return { counts, colors, order }
}

export function familyColorIndex(
  info: RhymeInfo | null,
  mode: 'strict' | 'rap' | 'loose' | 'off',
  families: FamilyInfo,
): number | null {
  if (!info || mode === 'off') return null
  const key = rhymeFamilyKey(info, mode)
  if (!key) return null
  return families.colors.get(key) ?? null
}

/**
 * Rhyme colours for paper and screen. Every swatch clears 4.5:1 against the
 * light paper (#faf7f0) and the dark paper (#17171d), so coloured lyrics stay
 * readable rather than decorative.
 */
export const RHYME_PALETTE_LIGHT = [
  '#8d5568', '#4f6b3d', '#4c6287', '#8a6026', '#6b4f80',
  '#3f7068', '#8d4b3f', '#566b3b', '#6f4a72', '#3d5d7c',
  '#7c5a51', '#4c6b60', '#765638', '#5a5378', '#5f6b3b',
]

export const RHYME_PALETTE_DARK = [
  '#e2b3c3', '#b6d1a0', '#adc2e7', '#e0bd88', '#c8aede',
  '#9bd1c7', '#e6a99c', '#b9cc9f', '#cfa7d4', '#a2c0df',
  '#d8b2a7', '#b1cbc1', '#d0aa87', '#b7b0d5', '#c2ce9b',
]
