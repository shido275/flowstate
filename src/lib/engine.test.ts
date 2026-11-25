import { beforeAll, describe, expect, it } from 'vitest'
import {
  analyzeWord,
  dictionaryReady,
  findRhymes,
  lineSyllables,
  scanLine,
  setUserLexicon,
  wordSyllables,
} from './engine'

beforeAll(async () => {
  await dictionaryReady()
})

describe('pronunciation analysis', () => {
  it('counts syllables from the dictionary', () => {
    expect(lineSyllables('I been on the road for a minute')).toBe(9)
    expect(wordSyllables('rhythm')).toBe(2)
    expect(wordSyllables('2016')).toBeGreaterThan(1)
  })

  it('keys rhymes from the last stressed vowel', () => {
    expect(analyzeWord('time')?.key).toBe('AY M')
    // "roses" must rhyme on OW, not the trailing schwa.
    expect(analyzeWord('roses')?.vowel).toBe('OW')
  })

  it('returns perfect rhymes that share the key', () => {
    const rhymes = findRhymes('time')
    expect(rhymes.perfect.length).toBeGreaterThan(0)
    expect(rhymes.perfect.every((entry) => analyzeWord(entry.word)?.key === 'AY M')).toBe(true)
    expect(rhymes.perfect.every((entry) => entry.syllables < 3)).toBe(true)
  })

  it('marks scansion stress and beat anchors', () => {
    const scan = scanLine('the city never sleeps')
    expect(scan.syllables).toHaveLength(6)
    expect(scan.syllables.filter((syllable) => syllable.stress === 1).length).toBeGreaterThan(1)
    expect(scan.beatSlots).toBe(2)
    expect(scan.onBeat).toBeLessThanOrEqual(scan.beatSlots)
  })

  it('guesses rather than fails on unknown words', () => {
    const scan = scanLine('zzqxx bloop')
    expect(scan.guessedWords.length).toBeGreaterThan(0)
    expect(scan.syllables.length).toBeGreaterThan(0)
  })

  it('learns a taught pronunciation', () => {
    setUserLexicon({ flowstate: 'F L OW1 S T EY2 T' })
    expect(wordSyllables('flowstate')).toBe(2)
    expect(analyzeWord('flowstate')?.vowel).toBe('EY')
    expect(analyzeWord('flowstate')?.key).toBe('EY T')
    setUserLexicon({})
  })
})
