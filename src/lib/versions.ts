import type { Section, Song } from '../types'
import { uid } from '../types'

const KEY = 'flowstate.versions.v1'
const PER_SONG_LIMIT = 20
const TOTAL_LIMIT = 80

export interface SongVersion {
  id: string
  songId: string
  at: number
  title: string
  sections: Section[]
  /** Auto snapshots are taken while you write; manual ones from the menu. */
  auto: boolean
}

function cloneSections(sections: Section[]): Section[] {
  return sections.map((section) => ({
    ...section,
    lines: section.lines.map((line) => ({ ...line })),
  }))
}

/** Only the lyrics matter when deciding whether a snapshot is new. */
function fingerprint(sections: Section[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      kind: section.kind,
      title: section.title,
      lines: section.lines.map((line) => line.text),
    })),
  )
}

function read(): SongVersion[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SongVersion[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v) => !!v && typeof v.id === 'string' && typeof v.songId === 'string' && Array.isArray(v.sections),
    )
  } catch {
    return []
  }
}

function write(list: SongVersion[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Out of room: versions are a convenience, so never break writing for them.
  }
}

export function listVersions(songId: string): SongVersion[] {
  return read()
    .filter((v) => v.songId === songId)
    .sort((a, b) => b.at - a.at)
}

export function latestVersion(songId: string): SongVersion | undefined {
  return listVersions(songId)[0]
}

/** Snapshots the song, unless the newest snapshot is already this exact draft. */
export function saveVersion(song: Song, auto: boolean): SongVersion | null {
  const content = cloneSections(song.sections)
  const print = fingerprint(content)
  const all = read()
  const previous = all.filter((v) => v.songId === song.id).sort((a, b) => b.at - a.at)[0]
  if (previous && fingerprint(previous.sections) === print) return null

  const version: SongVersion = {
    id: uid(),
    songId: song.id,
    at: Date.now(),
    title: song.title,
    sections: content,
    auto,
  }

  let next = [version, ...all]
  const perSong = next.filter((v) => v.songId === song.id)
  if (perSong.length > PER_SONG_LIMIT) {
    const doomed = new Set(perSong.slice(PER_SONG_LIMIT).map((v) => v.id))
    next = next.filter((v) => !doomed.has(v.id))
  }
  next = next.slice(0, TOTAL_LIMIT)
  write(next)
  return version
}

export function deleteVersion(id: string): void {
  write(read().filter((v) => v.id !== id))
}

export function deleteVersionsFor(songIds: string[]): void {
  if (!songIds.length) return
  const doomed = new Set(songIds)
  write(read().filter((v) => !doomed.has(v.songId)))
}

/** Detaches stored sections so a restored version cannot mutate the snapshot. */
export function sectionsFromVersion(version: SongVersion): Section[] {
  return cloneSections(version.sections)
}

/** One line of context for the history list, e.g. "Verse 1 · 4 bars". */
export function describeVersion(version: SongVersion): string {
  const bars = version.sections.reduce(
    (n, section) => n + section.lines.filter((line) => line.text.trim()).length,
    0,
  )
  const first = version.sections.find((section) => section.lines.some((line) => line.text.trim()))
  return `${copyFor(first?.title)} · ${bars} bar${bars === 1 ? '' : 's'}`
}

function copyFor(title: string | undefined): string {
  return title && title.trim() ? title : 'Untitled section'
}
