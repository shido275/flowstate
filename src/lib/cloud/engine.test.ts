import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, emptyState, type AppState, type Song } from '../../types'
import { createSyncEngine, type SyncStatus } from './engine'

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

interface Row {
  id: string
  revision: number
  doc: Song
  updated_at: string
}

/**
 * The smallest Supabase-shaped object the engine actually uses: push_song, one
 * read and one upsert. It mirrors the server's optimistic concurrency, so a
 * stale expectation comes back as "no row" exactly like the real function.
 */
class FakeCloud {
  rows = new Map<string, Row>()
  prefs: { doc: Record<string, unknown>; updated_at: string } | null = null
  /** Pushes the server answers with no row, as it does on a moved revision. */
  rejects = new Set<string>()
  /** Pushes that raise, like the payload cap does. */
  throws = new Set<string>()
  sinceValues: (string | null)[] = []
  private clock = Date.UTC(2026, 0, 1)

  stamp(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  put(doc: Song, revision = 1): Row {
    const row = { id: doc.id, revision, doc, updated_at: this.stamp() }
    this.rows.set(doc.id, row)
    return row
  }

  client(): SupabaseClient {
    const cloud = this

    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name !== 'push_song') return { data: null, error: null }
      const doc = args.p_doc as Song
      if (cloud.throws.has(doc.id)) {
        return { data: null, error: { message: 'That song is too large to sync (limit 256 KB)' } }
      }
      if (cloud.rejects.has(doc.id)) return { data: null, error: null }
      const existing = cloud.rows.get(doc.id)
      const expected = args.p_expected as number | null
      if (existing && expected !== null && existing.revision !== Number(expected)) {
        return { data: null, error: null }
      }
      const revision = existing ? existing.revision + 1 : 1
      cloud.put(doc, revision)
      return { data: [{ revision }], error: null }
    }

    const from = (table: string) => {
      if (table === 'songs') {
        const state: { since: string | null } = { since: null }
        const run = () => {
          cloud.sinceValues.push(state.since)
          const rows = [...cloud.rows.values()].filter(
            (row) => !state.since || Date.parse(row.updated_at) > Date.parse(state.since),
          )
          return { data: rows, error: null }
        }
        const builder = {
          select: () => builder,
          gt: (_column: string, value: string) => {
            state.since = value
            return builder
          },
          then: (resolve: (value: unknown) => unknown) => resolve(run()),
        }
        return builder
      }

      let mode: 'read' | 'upsert' = 'read'
      let payload: { doc: Record<string, unknown> } | null = null
      const builder = {
        select: () => builder,
        upsert: (values: { doc: Record<string, unknown> }) => {
          mode = 'upsert'
          payload = values
          return builder
        },
        maybeSingle: async () => {
          if (mode === 'upsert' && payload) {
            cloud.prefs = { doc: payload.doc, updated_at: cloud.stamp() }
            return { data: { updated_at: cloud.prefs.updated_at }, error: null }
          }
          return { data: cloud.prefs, error: null }
        },
      }
      return builder
    }

    return { rpc, from } as unknown as SupabaseClient
  }
}

function harness(cloud: FakeCloud, initial: Partial<AppState> = {}) {
  let state: AppState = { ...emptyState(), ...initial }
  const statuses: SyncStatus[] = []
  const errors: (string | null)[] = []
  const retries: (() => unknown)[] = []

  const engine = createSyncEngine({
    getClient: () => cloud.client(),
    getUserId: () => 'user-1',
    isSignedIn: () => true,
    getState: () => state,
    apply: (patch) => {
      state = { ...state, ...patch }
    },
    onStatus: (next) => statuses.push(next),
    onSynced: () => undefined,
    onError: (message) => errors.push(message),
    online: () => true,
    now: () => Date.parse(cloud.stamp()),
    retry: (run) => {
      retries.push(run)
    },
  })

  const drainRetries = async () => {
    for (let i = 0; i < 8; i++) {
      const next = retries.shift()
      if (!next) return
      await next()
    }
  }

  return {
    engine,
    getState: () => state,
    setState: (next: AppState) => {
      state = next
    },
    statuses,
    errors,
    retries,
    drainRetries,
  }
}

describe('sync engine', () => {
  it('pulls songs the cloud has and reports one clean pass', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('cloud', 200))
    const h = harness(cloud)

    await h.engine.sync('full')

    expect(h.getState().songs.map((s) => s.id)).toEqual(['cloud'])
    expect(h.statuses.at(-1)).toBe('synced')
    expect(h.errors.at(-1)).toBeNull()
  })

  it('pushes songs the cloud has never seen', async () => {
    const cloud = new FakeCloud()
    const h = harness(cloud, { songs: [song('mine', 100)] })

    await h.engine.sync('full')

    expect(cloud.rows.get('mine')?.doc.id).toBe('mine')
  })

  it('never deletes a cloud row, so an empty device cannot wipe the account', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('kept', 100))
    const h = harness(cloud)

    // Before the first full read a push is a no-op, not a delete pass.
    await h.engine.sync('push')
    expect(cloud.rows.size).toBe(1)

    await h.engine.sync('full')
    expect([...cloud.rows.keys()]).toEqual(['kept'])
    expect(h.getState().songs.map((s) => s.id)).toEqual(['kept'])
  })

  it('sends a purge as a tombstone instead of dropping the row', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('gone', 100))
    const h = harness(cloud)
    await h.engine.sync('full')

    h.setState({
      ...h.getState(),
      songs: h.getState().songs.map((s) => ({ ...s, purgedAt: 500, updatedAt: 500 })),
    })
    await h.engine.sync('push')

    expect(cloud.rows.get('gone')?.doc.purgedAt).toBe(500)
    expect(cloud.rows.get('gone')?.revision).toBe(2)
    expect(h.errors.at(-1)).toBeNull()
  })

  it('takes a newer cloud purge over a local copy', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('gone', 900, { purgedAt: 900 }))
    const h = harness(cloud, { songs: [song('gone', 100)] })

    await h.engine.sync('full')

    expect(h.getState().songs[0].purgedAt).toBe(900)
  })

  it('rereads before retrying a push the server refused', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('a', 100))
    cloud.rejects.add('a')
    const h = harness(cloud)
    await h.engine.sync('full')

    h.setState({ ...h.getState(), songs: [song('a', 400)] })
    await h.engine.sync('push')

    expect(h.retries).toHaveLength(1)
    expect(h.errors.some((message) => message && message.includes('Couldn’t save'))).toBe(false)

    cloud.rejects.delete('a')
    await h.drainRetries()

    expect(cloud.rows.get('a')?.doc.updatedAt).toBe(400)
    expect(h.errors.at(-1)).toBeNull()
    expect(h.statuses.at(-1)).toBe('synced')
  })

  it('reports a push the server keeps refusing instead of looping forever', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('a', 100))
    cloud.rejects.add('a')
    const h = harness(cloud)
    await h.engine.sync('full')

    h.setState({ ...h.getState(), songs: [song('a', 400)] })
    await h.engine.sync('push')
    await h.drainRetries()

    expect(h.errors.some((message) => message && message.includes('Couldn’t save'))).toBe(true)
    expect(h.statuses.at(-1)).toBe('error')
    expect(h.retries).toHaveLength(0)
  })

  it('surfaces a server error as an error, not a sync', async () => {
    const cloud = new FakeCloud()
    cloud.throws.add('big')
    const h = harness(cloud, { songs: [song('big', 100)] })

    await h.engine.sync('full')

    expect(h.errors.at(-1)).toContain('too large')
    expect(h.statuses.at(-1)).toBe('error')
    expect(h.statuses).not.toContain('synced')
  })

  it('only downloads rows that changed after the first pass', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('a', 100))
    const h = harness(cloud)

    await h.engine.sync('full')
    expect(cloud.sinceValues[0]).toBeNull()

    cloud.put(song('b', 200))
    await h.engine.sync('full')

    expect(cloud.sinceValues[1]).not.toBeNull()
    expect(h.getState().songs.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('finds a shared song that arrived with an older timestamp (an invite)', async () => {
    const cloud = new FakeCloud()
    cloud.prefs = { doc: { folders: ['Drafts'], vault: [], lexicon: {} }, updated_at: cloud.stamp() }
    const h = harness(cloud)
    await h.engine.sync('full')

    // Accepting an invite can add a row that is older than this device's last sync,
    // which the incremental read never asks for.
    cloud.rows.set('shared', {
      id: 'shared',
      revision: 1,
      doc: song('shared', 100),
      updated_at: new Date(Date.UTC(2025, 11, 31)).toISOString(),
    })
    await h.engine.sync('full')
    expect(h.getState().songs.map((s) => s.id)).not.toContain('shared')

    await h.engine.refresh()
    expect(h.getState().songs.map((s) => s.id)).toContain('shared')
    expect(cloud.sinceValues.at(-1)).toBeNull()
  })

  it('does not rewrite unchanged songs on a later pass', async () => {
    const cloud = new FakeCloud()
    cloud.put(song('a', 100))
    const h = harness(cloud)

    await h.engine.sync('full')
    const revision = cloud.rows.get('a')?.revision

    await h.engine.sync('full')

    expect(cloud.rows.get('a')?.revision).toBe(revision)
  })

  it('lets the cloud settings win when only the cloud moved', async () => {
    const cloud = new FakeCloud()
    cloud.prefs = {
      doc: {
        settings: { ...DEFAULT_SETTINGS, bpm: 140 },
        folders: ['Drafts'],
        vault: [],
        lexicon: {},
      },
      updated_at: new Date(Date.UTC(2026, 0, 2)).toISOString(),
    }
    const h = harness(cloud)

    await h.engine.sync('full')

    expect(h.getState().settings.bpm).toBe(140)
  })

  it('pushes settings changed here', async () => {
    const cloud = new FakeCloud()
    const h = harness(cloud)
    await h.engine.sync('full')

    h.setState({
      ...h.getState(),
      settings: { ...h.getState().settings, bpm: 122 },
    })
    await h.engine.sync('push')

    expect(cloud.prefs?.doc).toMatchObject({ settings: { bpm: 122 } })
  })
})
