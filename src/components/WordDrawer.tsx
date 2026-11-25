import { useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { Vibe } from '../types'
import {
  analyzeWord, endWord, findRhymes, lineSyllables, sameSyllableWords,
} from '../lib/engine'
import { SWAPS, MULTI_PHRASES, VIBE_SWAPS } from '../lib/wordbank'
import { IconButton, Segmented, Sheet } from './ui'
import type { WordTarget } from './LineRow'

type Tab = 'rhymes' | 'swaps' | 'multis' | 'same'
type RhymeKind = 'perfect' | 'multi' | 'slant'

interface Props {
  target: WordTarget | null
  vibe: Vibe
  onClose: () => void
  onApply: (replacement: string) => void
}

export default function WordDrawer({ target, vibe, onClose, onApply }: Props) {
  const [tab, setTab] = useState<Tab>('rhymes')
  const [kind, setKind] = useState<RhymeKind>('perfect')

  const info = target ? analyzeWord(target.word) : null
  const rhymes = useMemo(() => (target ? findRhymes(target.word) : { perfect: [], multi: [], slant: [] }), [target?.word])

  const swaps = useMemo(() => {
    if (!target) return []
    const direct = SWAPS[target.word.toLowerCase()] ?? []
    const vibeWords = VIBE_SWAPS[vibe] ?? []
    return Array.from(new Set([...direct, ...vibeWords])).slice(0, 36)
  }, [target?.word, vibe])

  const multis = useMemo(() => {
    if (!target) return []
    const t = analyzeWord(target.word)
    if (!t) return []
    const phrases = MULTI_PHRASES.filter((p) => {
      const w = endWord(p)
      const inf = analyzeWord(w)
      if (!inf) return false
      return inf.key === t.key || inf.vowel === t.vowel
    })
    const words = findRhymes(target.word)
    const multiWords = [...words.multi, ...words.perfect.filter((r) => r.syllables >= 3)]
      .map((r) => r.word)
    return Array.from(new Set([...phrases, ...multiWords])).slice(0, 40)
  }, [target?.word])

  const same = useMemo(() => (target ? sameSyllableWords(target.word, 36) : []), [target?.word])

  const activeRhymes =
    kind === 'perfect' ? rhymes.perfect : kind === 'multi' ? rhymes.multi : rhymes.slant

  return (
    <Sheet open={!!target} onClose={onClose} className="word-sheet" label="Word tools">
      <div className="sheet-head word-head">
        <div>
          <span className="eyebrow">Word tools</span>
          <h2>
            {target?.word}
            {info && <em>{info.syllables} syl</em>}
          </h2>
          <p className="word-hint">Choose a word to drop it into the bar.</p>
        </div>
        <IconButton onClick={onClose} aria-label="Close word tools"><X size={18} /></IconButton>
      </div>

      <div className="word-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rhymes', label: `Rhymes` },
            { value: 'swaps', label: 'Words' },
            { value: 'multis', label: 'Multis' },
            { value: 'same', label: 'Same syl' },
          ]}
          ariaLabel="Word tool"
        />
      </div>

      <div className="word-body">
        {!info && (
          <p className="word-empty">
            That spelling is not in the pronunciation dictionary, so rhymes are unavailable.
            Slang like “jawn”, “glizzy” and “bape” is included; invented words can still be used,
            they just won't colour yet.
          </p>
        )}

        {tab === 'rhymes' && info && (
          <>
            <div className="kind-row">
              {(['perfect', 'multi', 'slant'] as RhymeKind[]).map((k) => {
                const list = k === 'perfect' ? rhymes.perfect : k === 'multi' ? rhymes.multi : rhymes.slant
                return (
                  <button
                    key={k}
                    className={`kind-pill ${kind === k ? 'is-on' : ''}`}
                    onClick={() => setKind(k)}
                  >
                    {k === 'perfect' ? 'Perfect' : k === 'multi' ? 'Multisyllabic' : 'Slant'}
                    <span>{list.length}</span>
                  </button>
                )
              })}
            </div>
            {activeRhymes.length ? (
              <div className="chip-cloud">
                {activeRhymes.map((r) => (
                  <button key={r.word} className="word-chip" onClick={() => onApply(r.word)} title={`${r.word} · ${r.syllables} syllables`}>
                    {r.word}<sup>{r.syllables}</sup>
                  </button>
                ))}
              </div>
            ) : (
              <p className="word-empty">No {kind} rhymes found in the common dictionary. Try a different word or browse multis.</p>
            )}
            <div className="word-tip">
              <ArrowRight size={13} /> Perfect = same final vowel and consonants. Multisyllabic keeps several syllables in line. Slant shares the vowel but bends the ending.
            </div>
          </>
        )}

        {tab === 'swaps' && (
          <>
            {swaps.length ? (
              <>
                <p className="group-caption">Same-meaning swaps and {vibe} vocabulary</p>
                <div className="chip-cloud">
                  {swaps.map((s) => (
                    <button key={s} className="word-chip is-alt" onClick={() => onApply(s)}>{s}</button>
                  ))}
                </div>
              </>
            ) : (
              <p className="word-empty">No built-in swaps for “{target?.word}” yet. Double-click another word, or use the rhymes tab.</p>
            )}
            <div className="word-tip">
              <ArrowRight size={13} /> Swaps keep the thought and change the texture. Syllable counts may move the pocket, so read it out loud.
            </div>
          </>
        )}

        {tab === 'multis' && (
          <>
            {multis.length ? (
              <>
                <p className="group-caption">Phrase fragments and multi-syllable echoes</p>
                <div className="chip-cloud">
                  {multis.map((m) => (
                    <button key={m} className="word-chip is-phrase" onClick={() => onApply(m)}>
                      {m}
                      <sup>{lineSyllables(m)}</sup>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="word-empty">No multi-syllable matches for that ending. Try a stressed final syllable like “flow”, “mind” or “away”.</p>
            )}
            <div className="word-tip">
              <ArrowRight size={13} /> Multis can replace the tail of a bar. Rhyme across two or more syllables for a denser pocket.
            </div>
          </>
        )}

        {tab === 'same' && (
          <>
            {same.length ? (
              <>
                <p className="group-caption">Common words with the same syllable count</p>
                <div className="chip-cloud">
                  {same.map((r) => (
                    <button key={r.word} className="word-chip is-alt" onClick={() => onApply(r.word)}>
                      {r.word}<sup>{r.syllables}</sup>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="word-empty">No same-syllable suggestions for that word.</p>
            )}
            <div className="word-tip">
              <ArrowRight size={13} /> Keeping the syllable count keeps the pocket while the meaning shifts.
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
