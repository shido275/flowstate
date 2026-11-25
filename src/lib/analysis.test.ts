import { beforeAll, describe, expect, it } from 'vitest'
import { coachSong, rateSong, rhymeScheme } from './analysis'
import { dictionaryReady } from './engine'
import { blankLine, blankSection, newSong } from '../types'

const song = newSong({
  title: 'Rearview',
  bpm: 90,
  sections: [
    {
      ...blankSection('verse', 'Verse 1'),
      lines: [
        blankLine('I had a dream about the time'),
        blankLine('I wrote it down and made it rhyme'),
        blankLine('I never let the pressure go'),
        blankLine('I keep the money and the flow'),
      ],
    },
    {
      ...blankSection('hook', 'Hook'),
      lines: [blankLine('We are never going home'), blankLine('We are never going home')],
    },
  ],
})

beforeAll(async () => {
  await dictionaryReady()
})

describe('rhyme scheme', () => {
  it('letters repeated endings together', () => {
    const rows = rhymeScheme(song.sections[0])
    expect(rows.map((row) => row.letter)).toEqual(['A', 'A', 'B', 'B'])
    expect(rows[0].rhymeKey).toBe(rows[1].rhymeKey)
  })

  it('counts syllables per line', () => {
    const rows = rhymeScheme(song.sections[0])
    expect(rows.every((row) => row.syllables > 4)).toBe(true)
  })
})

describe('blueprint scoring', () => {
  it('returns five bounded scores', () => {
    const report = rateSong(song)
    expect(report.bars).toBe(6)
    expect(report.scores).toHaveLength(5)
    for (const score of report.scores) {
      expect(score.value).toBeGreaterThanOrEqual(0)
      expect(score.value).toBeLessThanOrEqual(10)
    }
    expect(report.overall).toBeGreaterThanOrEqual(0)
  })

  it('reports nothing to coach on a blank song', () => {
    const notes = coachSong(newSong({ title: 'Blank' }))
    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('empty')
  })
})
