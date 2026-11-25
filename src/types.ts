export type SectionKind = 'intro' | 'verse' | 'pre' | 'hook' | 'bridge' | 'outro'
export type Vibe = 'trap' | 'drill' | 'lyrical' | 'melodic'
export type RhymeMode = 'off' | 'strict' | 'rap' | 'loose'
export type BeatStyle = 'trap' | 'drill' | 'boom' | 'lofi'
export type Theme = 'light' | 'dark' | 'system'

export interface Take {
  id: string
  name: string
  duration: number
  createdAt: number
  /** Which browser recorded it. The audio itself never leaves that device. */
  device?: string
}

export interface Line {
  id: string
  text: string
  drafts: string[]
  takes: Take[]
}

export interface Section {
  id: string
  kind: SectionKind
  title: string
  target: number
  lines: Line[]
}

export interface Snippet {
  id: string
  text: string
  createdAt: number
  /** Title of the song this was lifted from, when it came from one. */
  source?: string
}

export interface Song {
  id: string
  title: string
  sections: Section[]
  /** Full-song vocal takes, recorded in the booth. */
  takes: Take[]
  folder: string
  vibe: Vibe
  bpm: number
  beatStyle: BeatStyle
  topic: string
  keywords: string[]
  notes: string
  createdAt: number
  updatedAt: number
  /** In the trash: still synced, restorable. */
  deletedAt?: number
  /** Erased for good: a tombstone that syncs so no other device resurrects it. */
  purgedAt?: number
}

export interface Settings {
  theme: Theme
  fontScale: number
  rhymeMode: RhymeMode
  showSyllables: boolean
  showBeatGrid: boolean
  showRhymeLetters: boolean
  ghostRhymes: boolean
  bpm: number
  beatStyle: BeatStyle
  click: boolean
  volume: number
  teleprompterSize: number
}

export interface StreakState {
  days: string[]
  best: number
}

export interface AppState {
  version: 1
  songs: Song[]
  folders: string[]
  settings: Settings
  streak: StreakState
  /** Cross-song snippet vault. */
  vault: Snippet[]
  /** User-taught pronunciations, keyed by lowercase word. */
  lexicon: Record<string, string>
  /** When each taught word was last set, so a later teach beats an earlier removal. */
  lexiconAt?: Record<string, number>
  /** Snippet ids removed here, with when. Tombstones keep removals deleted. */
  removedVault?: Record<string, number>
  /** Taught words removed here, with when. */
  removedLexicon?: Record<string, number>
}

export const SECTION_LABELS: Record<SectionKind, string> = {
  intro: 'Intro',
  verse: 'Verse',
  pre: 'Pre-Chorus',
  hook: 'Hook',
  bridge: 'Bridge',
  outro: 'Outro',
}

export const VIBE_LABELS: Record<Vibe, string> = {
  trap: 'Trap',
  drill: 'Drill',
  lyrical: 'Lyrical',
  melodic: 'Melodic',
}

export const SECTION_OPTIONS = Object.keys(SECTION_LABELS) as SectionKind[]
export const VIBE_OPTIONS = Object.keys(VIBE_LABELS) as Vibe[]
export const BEAT_OPTIONS: { id: BeatStyle; label: string }[] = [
  { id: 'trap', label: 'Trap' },
  { id: 'drill', label: 'Drill' },
  { id: 'boom', label: 'Boom Bap' },
  { id: 'lofi', label: 'Lo-fi' },
]

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  rhymeMode: 'rap',
  showSyllables: true,
  showBeatGrid: true,
  showRhymeLetters: true,
  ghostRhymes: true,
  bpm: 90,
  beatStyle: 'trap',
  click: true,
  volume: 0.7,
  teleprompterSize: 34,
}

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function blankLine(text = ''): Line {
  return { id: uid(), text, drafts: [], takes: [] }
}

export function blankSection(kind: SectionKind = 'verse', title?: string): Section {
  return {
    id: uid(),
    kind,
    title: title ?? SECTION_LABELS[kind],
    target: 12,
    lines: [blankLine(), blankLine(), blankLine(), blankLine()],
  }
}

export function newSong(opts: Partial<Song> = {}): Song {
  const now = Date.now()
  return {
    id: uid(),
    title: 'Untitled song',
    sections: [blankSection('verse', 'Verse 1'), blankSection('hook', 'Hook')],
    takes: [],
    folder: 'Drafts',
    vibe: 'trap',
    bpm: 90,
    beatStyle: 'trap',
    topic: '',
    keywords: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...opts,
  }
}

export function emptyState(): AppState {
  return {
    version: 1,
    songs: [],
    folders: ['Drafts', 'Singles', 'EP'],
    settings: { ...DEFAULT_SETTINGS },
    streak: { days: [], best: 0 },
    vault: [],
    lexicon: {},
    lexiconAt: {},
    removedVault: {},
    removedLexicon: {},
  }
}

export const todayKey = (d = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function streakCount(days: string[]): number {
  const set = new Set(days)
  const cursor = new Date()
  if (!set.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (set.has(todayKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

export function lineCount(song: Song): number {
  return song.sections.reduce(
    (n, s) => n + s.lines.filter((l) => l.text.trim().length > 0).length,
    0,
  )
}
