import type { AppState, Song } from '../types'
import { DEFAULT_SETTINGS, emptyState, todayKey } from '../types'

export const STATE_KEY = 'flowstate.state.v1'
const DEVICE_KEY = 'flowstate.device.v1'
const OWNER_KEY = 'flowstate.owner.v1'

let cachedDevice: string | null = null

/**
 * A stable id for this browser. Takes carry it so another device can say where
 * the audio lives instead of silently offering a play button that cannot work.
 */
export function deviceId(): string {
  if (cachedDevice) return cachedDevice
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return (cachedDevice = stored)
    const created = `dev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DEVICE_KEY, created)
    return (cachedDevice = created)
  } catch {
    // Storage unavailable: a per-session id is enough to tell takes apart.
    return (cachedDevice = `dev-session-${Math.random().toString(36).slice(2, 8)}`)
  }
}

/** Which account this browser's library was last synced to. */
export function loadOwnerId(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

export function saveOwnerId(id: string | null): void {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    // Nothing to do: the guard only needs to work when storage does.
  }
}

function numberMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  )
}

function normalizeSong(song: Song): Song {
  return {
    ...song,
    takes: Array.isArray(song.takes) ? song.takes : [],
    sections: song.sections.map((section) => ({
      ...section,
      lines: (section.lines ?? []).map((line) => ({
        ...line,
        drafts: Array.isArray(line.drafts) ? line.drafts : [],
        takes: Array.isArray(line.takes) ? line.takes : [],
      })),
    })),
  }
}

/** Fills in anything an older save (or a hand-edited backup) is missing. */
export function normalizeState(parsed: Partial<AppState> | null | undefined): AppState {
  const base = emptyState()
  if (!parsed) return base
  const songs = Array.isArray(parsed.songs)
    ? parsed.songs
        .filter((s): s is Song => !!s && typeof s.id === 'string' && Array.isArray(s.sections))
        .map(normalizeSong)
    : []
  return {
    version: 1,
    songs,
    folders: Array.isArray(parsed.folders) && parsed.folders.length ? parsed.folders : base.folders,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    streak: {
      days: Array.isArray(parsed.streak?.days) ? parsed.streak!.days : [],
      best: typeof parsed.streak?.best === 'number' ? parsed.streak!.best : 0,
    },
    vault: Array.isArray(parsed.vault)
      ? parsed.vault.filter((v) => !!v && typeof v.id === 'string' && typeof v.text === 'string')
      : [],
    lexicon:
      parsed.lexicon && typeof parsed.lexicon === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.lexicon).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {},
    lexiconAt: numberMap(parsed.lexiconAt),
    removedVault: numberMap(parsed.removedVault),
    removedLexicon: numberMap(parsed.removedLexicon),
  }
}

export function parseState(raw: string | null): AppState | null {
  if (!raw) return null
  try {
    return normalizeState(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return null
  }
}

export function loadState(): AppState {
  try {
    return parseState(localStorage.getItem(STATE_KEY)) ?? emptyState()
  } catch {
    return emptyState()
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export interface StorageInfo {
  /** Bytes used by Flowstate's own localStorage keys. */
  localBytes: number
  /** Whole-origin usage reported by the browser, when it will say. */
  usage: number | null
  quota: number | null
}

export async function storageInfo(): Promise<StorageInfo> {
  let localBytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      localBytes += key.length + (localStorage.getItem(key)?.length ?? 0)
    }
  } catch {
    localBytes = 0
  }
  let usage: number | null = null
  let quota: number | null = null
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (estimate) {
      usage = estimate.usage ?? null
      quota = estimate.quota ?? null
    }
  } catch {
    // The browser declined to estimate; the local byte count still tells the story.
  }
  return { localBytes, usage, quota }
}

export function recordWritingDay(state: AppState): AppState {
  const day = todayKey()
  if (state.streak.days.includes(day)) return state
  const days = [...state.streak.days, day].slice(-400)
  return { ...state, streak: { days, best: Math.max(state.streak.best, days.length) } }
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 45_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Late night'
}

/* ------------------------------ takes storage ----------------------------- */

const DB_NAME = 'flowstate'
const STORE = 'takes'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putTakeBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getTakeBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return blob
}

export async function deleteTakeBlob(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
