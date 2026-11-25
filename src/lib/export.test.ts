import { describe, expect, it } from 'vitest'
import { songToJson, songToLrc, songToMarkdown, songToText } from './export'
import { blankLine, blankSection, newSong } from '../types'

const song = newSong({
  title: 'Static',
  bpm: 120,
  sections: [
    {
      ...blankSection('verse', 'Verse 1'),
      lines: [blankLine('First bar'), blankLine('Second bar'), blankLine('')],
    },
  ],
})

describe('song exports', () => {
  it('writes plain text with section labels', () => {
    const text = songToText(song)
    expect(text).toContain('Static')
    expect(text).toContain('[VERSE 1]')
    expect(text).toContain('Second bar')
    expect(text).not.toContain('undefined')
  })

  it('writes markdown headings', () => {
    const markdown = songToMarkdown(song)
    expect(markdown).toContain('# Static')
    expect(markdown).toContain('## Verse 1')
    expect(markdown).toContain('First bar')
  })

  it('stamps LRC one bar apart at the song tempo', () => {
    const stamps = songToLrc(song).match(/\[\d{2}:\d{2}\.\d{2}\]/g) ?? []
    expect(stamps).toHaveLength(2)
    expect(stamps[0]).toBe('[00:00.00]')
    // 120 BPM: four beats is two seconds.
    expect(stamps[1]).toBe('[00:02.00]')
  })

  it('round-trips through the song JSON', () => {
    const parsed = JSON.parse(songToJson(song)) as { song: { id: string } }
    expect(parsed.song.id).toBe(song.id)
  })
})
