import type { Section, Song, Vibe } from '../types'
import {
  analyzeWord,
  endRhyme,
  endWord,
  findRhymes,
  lineSyllables,
  rhymeFamilyKey,
  tokenizeLine,
  wordSyllables,
} from './engine'
import {
  CLICHES,
  CLICHE_SWAPS,
  FILLERS,
  MULTI_PHRASES,
  SONG_IDEA_GENRES,
  SONG_IDEA_IMAGES,
  SONG_IDEA_MOODS,
  SONG_IDEA_MOVES,
  STOPWORDS,
  SWAPS,
  VIBES,
  VIBE_SWAPS,
} from './wordbank'

export interface SchemeRow {
  lineId: string
  text: string
  syllables: number
  letter: string
  rhymeKey: string | null
}

export function rhymeScheme(section: Section): SchemeRow[] {
  const letters = new Map<string, string>()
  return section.lines.map((line) => {
    const text = line.text.trim()
    if (!text) return { lineId: line.id, text: '', syllables: 0, letter: '', rhymeKey: null }
    const info = endRhyme(text)
    const key = info?.key ?? null
    let letter = ''
    if (key) {
      // Letters follow the order a rhyme family first appears, not the line number.
      if (!letters.has(key)) letters.set(key, String.fromCharCode(65 + (letters.size % 26)))
      letter = letters.get(key)!
    }
    return { lineId: line.id, text, syllables: lineSyllables(text), letter, rhymeKey: key }
  })
}

export interface CoachNote {
  id: string
  severity: 'info' | 'warn' | 'tip'
  title: string
  detail: string
  sectionId?: string
  lineId?: string
}

const unique = <T,>(arr: T[]) => Array.from(new Set(arr))

export function coachSong(song: Song): CoachNote[] {
  const notes: CoachNote[] = []
  const allLines = song.sections.flatMap((s) => s.lines.filter((l) => l.text.trim()))
  if (!allLines.length) {
    return [
      {
        id: 'empty',
        severity: 'info',
        title: 'Nothing to coach yet',
        detail: 'Write a few bars and the coach will look for clichés, filler, uneven pockets and orphaned lines.',
      },
    ]
  }

  // Clichés
  const fullText = allLines.map((l) => l.text.toLowerCase()).join('\n')
  const foundCliches = CLICHES.filter((c) => fullText.includes(c))
  if (foundCliches.length) {
    notes.push({
      id: 'cliche',
      severity: 'warn',
      title: `${foundCliches.length} familiar phrase${foundCliches.length > 1 ? 's' : ''}`,
      detail: `Try bending: ${foundCliches
        .slice(0, 4)
        .map((c) => `${c} → ${(CLICHE_SWAPS[c] ?? ['a fresher image'])[0]}`)
        .join('; ')}.`,
    })
  }

  // Repeated content words
  const words = fullText.match(/[a-z]+(?:'[a-z]+)?/g) ?? []
  const counts = new Map<string, number>()
  for (const w of words) {
    if (STOPWORDS.has(w) || w.length < 4) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const repeated = [...counts.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  if (repeated.length) {
    notes.push({
      id: 'repeat',
      severity: 'tip',
      title: 'Words on repeat',
      detail: `${repeated.map(([w, n]) => `“${w}” ×${n}`).join(', ')}. Repetition can be a hook — or a crutch. Swap one instance for a concrete image.`,
    })
  }

  // Filler
  let fillerCount = 0
  for (const f of FILLERS) {
    const re = new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`, 'gi')
    fillerCount += (fullText.match(re) ?? []).length
  }
  if (fillerCount >= 3) {
    notes.push({
      id: 'filler',
      severity: 'tip',
      title: `${fillerCount} filler words`,
      detail: '“Just”, “really”, “very” and friends dilute the bar. Cut them and the line usually hits harder at the same syllable count.',
    })
  }

  // Uneven pockets + long bars
  for (const section of song.sections) {
    const counts = section.lines
      .filter((l) => l.text.trim())
      .map((l) => lineSyllables(l.text))
    if (counts.length >= 3) {
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length
      const outliers = section.lines
        .filter((l) => l.text.trim())
        .map((l) => ({ line: l, n: lineSyllables(l.text) }))
        .filter(({ n }) => Math.abs(n - mean) >= 5)
      if (outliers.length) {
        notes.push({
          id: `uneven-${section.id}`,
          severity: 'warn',
          title: 'A bar drifts off the pocket',
          detail: `${section.title}: average ${Math.round(mean)} syllables, but ${outliers
            .slice(0, 2)
            .map(({ line, n }) => `“${line.text.slice(0, 34)}…” sits at ${n}`)
            .join(' and ')}. Trim it or commit to the shift.`,
          sectionId: section.id,
          lineId: outliers[0].line.id,
        })
      }
    }
    const long = section.lines.find((l) => lineSyllables(l.text) >= 20)
    if (long) {
      notes.push({
        id: `long-${long.id}`,
        severity: 'tip',
        title: 'A long bar',
        detail: `${lineSyllables(long.text)} syllables in one breath. Split it across two lines and let the beat breathe.`,
        sectionId: section.id,
        lineId: long.id,
      })
    }
  }

  // Orphaned end rhymes
  const endKeys = allLines.map((l) => endRhyme(l.text)?.key).filter(Boolean) as string[]
  const keyCounts = new Map<string, number>()
  endKeys.forEach((k) => keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1))
  const orphans = allLines.filter((l) => {
    const k = endRhyme(l.text)?.key
    return k ? (keyCounts.get(k) ?? 0) < 2 : false
  })
  if (orphans.length >= 2) {
    notes.push({
      id: 'orphan',
      severity: 'info',
      title: `${orphans.length} lines rhyme with nothing`,
      detail: `“${orphans[0].text.slice(0, 40)}${orphans[0].text.length > 40 ? '…' : ''}” is the first. Either answer it or make the isolation deliberate.`,
      lineId: orphans[0].id,
    })
  }

  // Same end word back to back
  const endWords = allLines.map((l) => (l.text.match(/[A-Za-z']+\s*$/) ?? [''])[0].trim().toLowerCase())
  const doubled = endWords.filter((w, i) => w && endWords.indexOf(w) !== i)
  if (doubled.length) {
    notes.push({
      id: 'double-end',
      severity: 'tip',
      title: 'Reused line endings',
      detail: `“${unique(doubled).slice(0, 3).join('”, “')}” ends more than one bar. A fresh rhyme keeps the scheme moving.`,
    })
  }

  if (!notes.length) {
    notes.push({
      id: 'clean',
      severity: 'info',
      title: 'The page reads clean',
      detail: 'No clichés, filler or wild syllable swings stood out. Read it aloud once before you commit.',
    })
  }
  return notes.slice(0, 14)
}

export interface Score {
  key: string
  label: string
  value: number
  note: string
}

export interface Blueprint {
  scores: Score[]
  overall: number
  bars: number
}

export function rateSong(song: Song): Blueprint {
  const lines = song.sections.flatMap((s) => s.lines.filter((l) => l.text.trim()))
  const bars = lines.length
  if (!bars) {
    return {
      bars: 0,
      overall: 0,
      scores: [
        { key: 'end', label: 'End rhymes', value: 0, note: 'Write a few bars first.' },
        { key: 'internal', label: 'Internal rhymes', value: 0, note: 'Write a few bars first.' },
        { key: 'multi', label: 'Multis', value: 0, note: 'Write a few bars first.' },
        { key: 'pocket', label: 'Pocket', value: 0, note: 'Write a few bars first.' },
        { key: 'variety', label: 'Variety', value: 0, note: 'Write a few bars first.' },
      ],
    }
  }

  const endInfos = lines.map((l) => (l.text.trim() ? endRhyme(l.text) : null))
  const keyCounts = new Map<string, number>()
  endInfos.forEach((i) => i && keyCounts.set(i.key, (keyCounts.get(i.key) ?? 0) + 1))
  const answered = endInfos.filter((i) => i && (keyCounts.get(i.key) ?? 0) > 1).length
  const endScore = Math.min(10, (answered / bars) * 10 * 1.15)

  const repeatedFamilies = new Map<string, number>()
  let totalWords = 0
  for (const line of lines) {
    for (const token of tokenizeLine(line.text)) {
      if (!token.word) continue
      totalWords++
      const info = analyzeWord(token.word)
      if (!info) continue
      const k = rhymeFamilyKey(info, 'strict')
      if (k) repeatedFamilies.set(k, (repeatedFamilies.get(k) ?? 0) + 1)
    }
  }
  const internalPairs = [...repeatedFamilies.values()].reduce(
    (n, count) => n + Math.max(0, count - 1),
    0,
  )
  const internalScore = Math.min(10, (internalPairs / Math.max(1, totalWords)) * 34)

  const multiEnds = endInfos.filter((i) => i && (i.syllables >= 3 || answered > 0 && i.key2)).length
  const phraseHits = MULTI_PHRASES.filter((p) =>
    lines.some((l) => l.text.toLowerCase().includes(p)),
  ).length
  const multiScore = Math.min(10, ((multiEnds / bars) * 12 + phraseHits * 1.5))

  let deviation = 0
  let groups = 0
  for (const section of song.sections) {
    const counts = section.lines.filter((l) => l.text.trim()).map((l) => lineSyllables(l.text))
    if (counts.length < 2) continue
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    deviation += counts.reduce((n, c) => n + Math.abs(c - mean), 0) / counts.length
    groups++
  }
  const avgDeviation = groups ? deviation / groups : 0
  const pocketScore = Math.max(0, 10 - avgDeviation * 1.45)

  const contentWords = (lines.flatMap((l) => l.text.toLowerCase().match(/[a-z]+/g) ?? []) as string[]).filter(
    (w) => !STOPWORDS.has(w) && w.length > 2,
  )
  const uniqueRatio = contentWords.length ? new Set(contentWords).size / contentWords.length : 0
  const varietyScore = Math.min(10, uniqueRatio * 14)

  const round = (n: number) => Math.round(Math.max(0, Math.min(10, n)) * 10) / 10
  const scores: Score[] = [
    {
      key: 'end',
      label: 'End rhymes',
      value: round(endScore),
      note: `${answered} of ${bars} line endings are answered by another bar.`,
    },
    {
      key: 'internal',
      label: 'Internal rhymes',
      value: round(internalScore),
      note: `${internalPairs} sound echoes inside your lines.`,
    },
    {
      key: 'multi',
      label: 'Multis',
      value: round(multiScore),
      note: `${multiEnds} multi-syllable endings, ${phraseHits} built-in multi phrases.`,
    },
    {
      key: 'pocket',
      label: 'Pocket',
      value: round(pocketScore),
      note: `Lines sit ${avgDeviation.toFixed(1)} syllables off the average — lower is tighter.`,
    },
    {
      key: 'variety',
      label: 'Variety',
      value: round(varietyScore),
      note: `${Math.round(uniqueRatio * 100)}% of your content words are unique.`,
    },
  ]
  const overall = Math.round((scores.reduce((n, s) => n + s.value, 0) / scores.length) * 10) / 10
  return { scores, overall, bars }
}

const NOUNS = new Set(
  `time mind pain rain chain game name fame blame dream scheme cream team scene green queen king ring thing swing
  flow glow low dough gold cold world girl heart start scar star car bar night light fight right sight flight life
  knife wife zone throne phone stone home road load code mode wave grave save cage stage page rage space place case
  chase grace face race trace bag stack trap track back crack block clock lock rock stock drop top spot lot shot pot
  paper hater player money honey city pity fire desire power tower hour faith weight breath death step rep pressure
  treasure pleasure measure vision decision mission position ambition condition tension attention session lesson
  blessing weapon grind shine crime dime climb prime slime spine line sign design decline sunshine outline
  issues blues news shoes truth youth roots boots proof roof moves grooves rules tools fools cool school
  town crown sound ground round down frown clown loud cloud proud crowd doubt shout route south mouth
  pain vein plane lane train brain stain main gain rain flame shame frame claim same came
  storm form warm norm born torn sworn horn dawn drawn gone long song strong wrong
  night flight bright light might tight white write right sight fight bite height
  dream stream beam gleam team scheme theme supreme extreme
  alone bone stone zone phone throne clone grown known own shown blown flown
  flow go low slow show glow grow throw blow know snow row crow pro bro doe foe hoe joe toe woe
  land hand stand band brand grand sand demand command understand
  wall fall call small tall ball hall all crawl
  war score door floor more store before ignore
  soul goal whole role control patrol console
  way day stay play say pray gray lay pay they weigh
  price ice nice twice slice dice advice device
  fear year near clear tear rear appear career`
    .split(/\s+/)
    .filter(Boolean),
)

const NOUNISH_SUFFIX = /(tion|sion|ness|ity|ment|ance|ence|ing|er|or|ure|ship|hood|dom|ism|ist|age|ade|ery|ry|ty|ight|ame|ain|one|oad|ove|ace|ake|ale|ame|ore|old|ame)$/

function isNounish(word: string): boolean {
  return NOUNS.has(word) || NOUNISH_SUFFIX.test(word)
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type CowriteKind = 'complete' | 'punch' | 'switch' | 'rewrite' | 'god'

export function coWrite(
  kind: CowriteKind,
  vibe: Vibe,
  previousLines: string[],
  currentLine = '',
): string[] {
  const kit = VIBES[vibe] ?? VIBES.trap
  const target = [...previousLines].reverse().find((l) => l.trim()) ?? ''
  const targetWord = target ? endWord(target) : ''
  const rhymeWords = targetWord
    ? [...findRhymes(targetWord).perfect, ...findRhymes(targetWord).slant]
        .filter((r) => isNounish(r.word))
        .map((r) => r.word)
    : []
  const usableRhymes = unique(rhymeWords).slice(0, 24)

  if (kind === 'rewrite') {
    return rewriteLine(currentLine, vibe)
  }
  if (kind === 'switch') {
    return shuffle(kit.sparks).slice(0, 3)
  }
  if (kind === 'god') {
    return shuffle(kit.sparks).slice(0, 3)
  }
  if (!usableRhymes.length) {
    return shuffle(kit.sparks).slice(0, 3)
  }

  if (kind === 'complete') {
    const prefixes = shuffle(kit.prefixes)
    const picked = shuffle(usableRhymes)
    return prefixes.slice(0, 3).map((p, i) => `${p} ${picked[i % picked.length]}`)
  }
  const punches = shuffle(kit.punches)
  const picked = shuffle(usableRhymes)
  return punches.slice(0, 3).map((p, i) => cap(`${p} ${picked[i % picked.length]}`))
}

export function rewriteLine(line: string, vibe: Vibe): string[] {
  const clean = line.trim()
  if (!clean) return []
  const vibeWords = VIBE_SWAPS[vibe] ?? []
  const variants: string[] = []

  // 1. Strip filler and tighten spacing.
  let stripped = clean
  for (const filler of FILLERS) {
    stripped = stripped.replace(new RegExp(`\\b${filler.replace(/ /g, '\\s+')}\\b`, 'gi'), '')
  }
  stripped = stripped.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim()
  if (stripped !== clean) variants.push(cap(stripped))

  // 2. Same-syllable synonym / vibe swap on one content word.
  const tokens = tokenizeLine(clean).filter((t) => t.word)
  const targets = tokens
    .map((t) => t.word.toLowerCase())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  for (const word of shuffle(targets)) {
    const options = [...(SWAPS[word] ?? []), ...vibeWords].filter(
      (o) => !o.includes(' ') && o.toLowerCase() !== word,
    )
    const sameSyllables = options.filter((o) => {
      const info = analyzeWord(o)
      return info && info.syllables === wordSyllables(word)
    })
    const chosen = (sameSyllables.length ? sameSyllables : options)[0]
    if (chosen) {
      const re = new RegExp(`\\b${word}\\b`, 'i')
      const next = clean.replace(re, chosen)
      if (next !== clean) variants.push(cap(next))
      break
    }
  }

  // 3. De-cliché the phrase.
  for (const [cliche, swaps] of Object.entries(CLICHE_SWAPS)) {
    if (clean.toLowerCase().includes(cliche)) {
      variants.push(cap(clean.toLowerCase().replace(cliche, swaps[Math.floor(Math.random() * swaps.length)])))
      break
    }
  }

  return unique(variants).slice(0, 3)
}

export interface SongIdea {
  title: string
  mood: string
  genre: string
  image: string
  move: string
  keywords: string[]
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function generateIdea(): SongIdea {
  const openers = ['Headlights', 'Static', 'Gold Teeth', 'Rearview', 'Neon', 'Sunday', 'Cold Water', 'Paper Crown', 'Empty Gallery', 'Rooftop', 'Velvet', 'Concrete', 'Midnight', 'Sunday', 'Glass', 'Copper']
  const closers = ['in the Rain', 'in Reverse', 'on the Floor', 'at 4AM', 'in the Static', 'with No Signal', 'on the Way Down', 'Before the Morning', 'in a Quiet Room', 'on Empty', 'with the Lights Off']
  return {
    title: `${pick(openers)} ${pick(closers)}`,
    mood: pick(SONG_IDEA_MOODS),
    genre: pick(SONG_IDEA_GENRES),
    image: pick(SONG_IDEA_IMAGES),
    move: pick(SONG_IDEA_MOVES),
    keywords: shuffle([
      'distance', 'window', 'pressure', 'almost', 'gold', 'rain', 'phone', 'mirror',
      'exit', 'summer', 'silence', 'engine', 'promise', 'corner', 'light',
    ]).slice(0, 5),
  }
}

export function gameCheck(input: string, target: string): { ok: boolean; points: number; kind: 'perfect' | 'slant' | 'multi' | 'no' } {
  const a = analyzeWord(input)
  const b = analyzeWord(target)
  if (!a || !b) return { ok: false, points: 0, kind: 'no' }
  if (a.key === b.key) {
    return a.syllables > 2
      ? { ok: true, points: 15, kind: 'multi' }
      : { ok: true, points: 10, kind: 'perfect' }
  }
  if (a.vowel === b.vowel) return { ok: true, points: 6, kind: 'slant' }
  return { ok: false, points: 0, kind: 'no' }
}

export function analyzePastedText(text: string): {
  rows: { text: string; syllables: number; letter: string; rhymeKey: string | null }[]
  total: number
  average: number
} {
  const letters = new Map<string, string>()
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const info = endRhyme(line)
      let letter = ''
      if (info) {
        if (!letters.has(info.key)) letters.set(info.key, String.fromCharCode(65 + (letters.size % 26)))
        letter = letters.get(info.key)!
      }
      return { text: line, syllables: lineSyllables(line), letter, rhymeKey: info?.key ?? null }
    })
  const total = rows.reduce((n, r) => n + r.syllables, 0)
  return { rows, total, average: rows.length ? total / rows.length : 0 }
}
