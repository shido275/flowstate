import { describe, expect, it } from 'vitest'
import type { Snippet, Song } from '../../types'
import { DEFAULT_SETTINGS } from '../../types'
import {
  isSongRow,
  mergePrefs,
  mergeSongs,
  prefsFromState,
  songTime,
  type PrefsDoc,
  type RemoteSong,
} from './sync'

const song = (id: string, updatedAt: number, extra: Partial<Song> = {}): Song => ({
  id,
  title: id,
  sections: [],
  takes: [],
  folder: 'Drafts',
  vibe: 'trap',
  bpm: 90,
  beatStyle: 'trap',
  topic: '',
  keywords: [],
  notes: '',
  createdAt: 1,
  updatedAt,
  ...extra,
})

const row = (doc: Song, revision = 1): RemoteSong => ({
  id: doc.id,
  revision,
  doc,
  updated_at: new Date(doc.updatedAt).toISOString(),
})

const ids = (songs: Song[]) => songs.map((s) => s.id)

describe('mergeSongs', () => {
  it('pushes songs the cloud has never seen', () => {
    const plan = mergeSongs([song('a', 100)], [])
    expect(ids(plan.songs)).toEqual(['a'])
    expect(ids(plan.push)).toEqual(['a'])
    expect(plan.pulled).toEqual([])
  })

  it('pulls songs only the cloud has', () => {
    const plan = mergeSongs([], [row(song('b', 200))])
    expect(ids(plan.songs)).toEqual(['b'])
    expect(plan.push).toEqual([])
    expect(plan.pulled).toEqual(['b'])
  })

  it('keeps the newer local copy and pushes it', () => {
    const local = song('a', 300, { title: 'mine' })
    const plan = mergeSongs([local], [row(song('a', 200, { title: 'theirs' }))])
    expect(plan.songs[0].title).toBe('mine')
    expect(ids(plan.push)).toEqual(['a'])
    expect(plan.pulled).toEqual([])
  })

  it('takes the newer cloud copy and does not push it back', () => {
    const plan = mergeSongs([song('a', 200, { title: 'mine' })], [row(song('a', 300, { title: 'theirs' }))])
    expect(plan.songs[0].title).toBe('theirs')
    expect(plan.push).toEqual([])
    expect(plan.pulled).toEqual(['a'])
  })

  it('gives ties to the cloud, so two devices never ping-pong', () => {
    const plan = mergeSongs([song('a', 500, { title: 'mine' })], [row(song('a', 500, { title: 'theirs' }))])
    expect(plan.songs[0].title).toBe('theirs')
    expect(plan.push).toEqual([])
  })

  it('does not report a pull when both copies already match', () => {
    const same = song('a', 500)
    const plan = mergeSongs([same], [row({ ...same })])
    expect(plan.pulled).toEqual([])
    expect(plan.push).toEqual([])
  })

  it('honours tombstones when the deletion is the newer edit', () => {
    const local = song('a', 400)
    const deleted = song('a', 600, { deletedAt: 600 })
    const plan = mergeSongs([local], [row(deleted)])
    expect(plan.songs[0].deletedAt).toBe(600)
    expect(plan.push).toEqual([])
  })

  it('resurrects when the local restore is newer than the cloud tombstone', () => {
    const restored = song('a', 700)
    const plan = mergeSongs([restored], [row(song('a', 600, { deletedAt: 600 }))])
    expect(plan.songs[0].deletedAt).toBeUndefined()
    expect(ids(plan.push)).toEqual(['a'])
  })

  it('sorts the merged library by newest edit', () => {
    const plan = mergeSongs(
      [song('old', 100), song('new', 900)],
      [row(song('middle', 500))],
    )
    expect(ids(plan.songs)).toEqual(['new', 'middle', 'old'])
  })

  it('keeps the highest revision when a row arrives twice', () => {
    const old = row(song('a', 100, { title: 'one' }), 2)
    const fresh = row(song('a', 100, { title: 'two' }), 9)
    const plan = mergeSongs([], [old, fresh])
    expect(plan.songs[0].title).toBe('two')
  })

  it('ignores rows that are not songs', () => {
    const plan = mergeSongs([], [{ id: 'x', revision: 1, doc: null, updated_at: '' } as unknown as RemoteSong])
    expect(plan.songs).toEqual([])
  })

  it('falls back to createdAt when a song has no updatedAt', () => {
    expect(songTime({ ...song('a', 0), updatedAt: 0, createdAt: 42 })).toBe(42)
    expect(isSongRow(row(song('a', 1)))).toBe(true)
    expect(isSongRow({ id: 'a', revision: 1, doc: { sections: [] } })).toBe(false)
  })
})

describe('mergePrefs', () => {
  const snippet = (id: string, createdAt: number): Snippet => ({ id, text: id, createdAt })

  const local: PrefsDoc = {
    settings: { ...DEFAULT_SETTINGS, bpm: 90 },
    folders: ['Drafts', 'EP'],
    vault: [snippet('l1', 10), snippet('shared', 5)],
    lexicon: { nginx: 'N GIN X' },
  }

  it('unions folders, vaults and taught pronunciations', () => {
    const merged = mergePrefs(local, {
      settings: { ...DEFAULT_SETTINGS, bpm: 140, theme: 'dark' },
      folders: ['Singles', 'Drafts'],
      vault: [snippet('r1', 20), snippet('shared', 5)],
      lexicon: { read: 'RED' },
    })
    expect(merged.folders).toEqual(['Singles', 'Drafts', 'EP'])
    expect(merged.vault.map((s) => s.id)).toEqual(['r1', 'l1', 'shared'])
    expect(merged.vault.filter((s) => s.id === 'shared')).toHaveLength(1)
    expect(merged.lexicon).toEqual({ nginx: 'N GIN X', read: 'RED' })
  })

  it('lets the cloud win on settings', () => {
    const merged = mergePrefs(local, { settings: { ...DEFAULT_SETTINGS, bpm: 140 } })
    expect(merged.settings.bpm).toBe(140)
    expect(merged.folders).toEqual(['Drafts', 'EP'])
  })

  it('survives an empty cloud doc', () => {
    const merged = mergePrefs(local, {})
    expect(merged.settings).toEqual(local.settings)
    expect(merged.vault).toHaveLength(2)
  })

  it('reads prefs off app state', () => {
    const prefs = prefsFromState({
      version: 1,
      songs: [],
      folders: ['Drafts'],
      settings: DEFAULT_SETTINGS,
      streak: { days: ['2026-01-01'], best: 1 },
      vault: [],
      lexicon: {},
    })
    expect(prefs.folders).toEqual(['Drafts'])
    expect(prefs).not.toHaveProperty('streak')
  })

  it('carries the removal tombstones through app state', () => {
    const prefs = prefsFromState({
      version: 1,
      songs: [],
      folders: ['Drafts'],
      settings: DEFAULT_SETTINGS,
      streak: { days: [], best: 0 },
      vault: [],
      lexicon: { drizzy: 'D R IH1 Z IY0' },
      lexiconAt: { drizzy: 7 },
      removedVault: { gone: 5 },
      removedLexicon: { nginx: 6 },
    })
    expect(prefs.removedVault).toEqual({ gone: 5 })
    expect(prefs.removedLexicon).toEqual({ nginx: 6 })
    expect(prefs.lexiconAt).toEqual({ drizzy: 7 })
  })

  it('keeps a snippet deleted here deleted after a pull', () => {
    const merged = mergePrefs(
      { ...local, vault: [], removedVault: { l1: 50 } },
      { vault: [snippet('l1', 10)] },
    )
    expect(merged.vault).toEqual([])
    expect(merged.removedVault?.l1).toBe(50)
  })

  it('deletes a snippet the other device removed', () => {
    const merged = mergePrefs(local, { vault: [], removedVault: { l1: 90 } })
    expect(merged.vault.map((s) => s.id)).not.toContain('l1')
    expect(merged.vault.map((s) => s.id)).toContain('shared')
    expect(merged.removedVault?.l1).toBe(90)
  })

  it('lets a word taught after a removal come back', () => {
    const merged = mergePrefs(
      {
        ...local,
        lexicon: { drizzy: 'D R IH1 Z IY0' },
        lexiconAt: { drizzy: 200 },
        removedLexicon: { drizzy: 100 },
      },
      { removedLexicon: { drizzy: 100 } },
    )
    expect(merged.lexicon.drizzy).toBe('D R IH1 Z IY0')
  })

  it('drops a word removed after it was taught', () => {
    const merged = mergePrefs(
      { ...local, lexicon: { drizzy: 'D R IH1 Z IY0' }, lexiconAt: { drizzy: 100 } },
      { lexicon: { drizzy: 'D R IH1 Z IY0' }, removedLexicon: { drizzy: 200 } },
    )
    expect(merged.lexicon).toEqual({})
    expect(merged.lexiconAt).toEqual({})
  })

  it('tombstones vault entries that fall off the 300 cap', () => {
    const many = Array.from({ length: 305 }, (_, i) => snippet(`s${i}`, i + 1))
    const merged = mergePrefs({ ...local, vault: many }, {})
    expect(merged.vault).toHaveLength(300)
    expect(Object.keys(merged.removedVault ?? {})).toHaveLength(5)
    // The oldest five fall off; the newest stay.
    expect(merged.vault.map((s) => s.id)).toContain('s304')
    expect(merged.vault.map((s) => s.id)).not.toContain('s0')
  })
})
