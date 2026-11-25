import { useSyncExternalStore } from 'react'
import { dictionaryEpoch, subscribeDictionary } from './engine'

/**
 * Re-renders when the pronunciation dictionary (or the user's lexicon) lands,
 * so rhyme colour and exact syllables appear without a reload.
 */
export function useDictionaryEpoch(): number {
  return useSyncExternalStore(subscribeDictionary, dictionaryEpoch, dictionaryEpoch)
}
