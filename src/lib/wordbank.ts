export const STOPWORDS = new Set(
  `the a an and or but if then than that this these those i you he she it we they me him her us them my your his its our their
  is am are was were be been being do does did doing have has had having will would can could should may might must not no
  of to in on at by for with from as so up down out over under again just too very really like about into through during
  before after above below between both each few more most other some such only own same any all`.split(/\s+/),
)

export const FILLERS = [
  'just', 'really', 'very', 'kinda', 'sorta', 'sort of', 'kind of', 'literally',
  'actually', 'basically', 'simply', 'totally', 'definitely', 'honestly',
]

/** Same-syllable swaps a writer can drop in without breaking the pocket. */
export const SWAPS: Record<string, string[]> = {
  money: ['paper', 'bands', 'racks', 'bread', 'cheese', 'funds'],
  friend: ['brother', 'homie', 'day one', 'partner', 'kin'],
  enemies: ['opps', 'foes', 'snakes', 'vultures', 'fakes'],
  car: ['whip', 'ride', 'coupe', 'foreign', 'sedan'],
  house: ['crib', 'spot', 'pad', 'home', 'estate'],
  city: ['block', 'town', 'hood', 'streets', 'ends'],
  woman: ['shorty', 'baby', 'queen', 'lady', 'girl'],
  man: ['brother', 'youngin', 'guy', 'soldier', 'king'],
  police: ['law', 'jakes', 'fed', 'task force', 'blue'],
  gun: ['stick', 'tool', 'hammer', 'iron', 'piece'],
  clothes: ['fit', 'fits', 'drip', 'garments', 'threads'],
  jewelry: ['chain', 'ice', 'frost', 'jewels', 'links'],
  moneybag: ['bag', 'sack', 'stash', 'stack', 'pile'],
  crazy: ['insane', 'wild', 'unhinged', 'frantic', 'loose'],
  good: ['solid', 'proper', 'clean', 'blessed', 'official'],
  bad: ['foul', 'rotten', 'crooked', 'shady', 'broken'],
  tired: ['drained', 'worn out', 'heavy', 'spent', 'done'],
  afraid: ['scared', 'shook', 'uneasy', 'rattled', 'frozen'],
  happy: ['golden', 'light', 'floating', 'alive', 'up'],
  sad: ['blue', 'low', 'hollow', 'aching', 'grey'],
  angry: ['heated', 'fuming', 'tight', 'bitter', 'sharp'],
  walk: ['stroll', 'step', 'slide', 'roam', 'move'],
  run: ['sprint', 'race', 'bolt', 'dash', 'move'],
  talk: ['speak', 'say', 'vent', 'preach', 'tell it'],
  think: ['know', 'feel', 'believe', 'reckon', 'figure'],
  leave: ['dip', 'slide', 'bounce', 'fade', 'depart'],
  start: ['begin', 'kick off', 'launch', 'open', 'ignite'],
  stop: ['halt', 'quit', 'fold', 'rest', 'pause'],
  get: ['grab', 'catch', 'secure', 'cop', 'pull'],
  make: ['build', 'craft', 'cook', 'shape', 'stack'],
  win: ['take it', 'claim', 'conquer', 'eat', 'close'],
  lose: ['fall', 'fold', 'stumble', 'drop', 'miss'],
  hard: ['heavy', 'rugged', 'tough', 'rough', 'steep'],
  easy: ['light', 'simple', 'smooth', 'casual', 'plain'],
  quickly: ['fast', 'swiftly', 'in a flash', 'overnight', 'rapid'],
  slowly: ['easy', 'patient', 'steady', 'softly', 'drifting'],
  beautiful: ['gorgeous', 'radiant', 'stunning', 'golden', 'fine'],
  ugly: ['crooked', 'ragged', 'grim', 'rough', 'busted'],
  big: ['heavy', 'huge', 'massive', 'giant', 'tall'],
  small: ['tiny', 'slight', 'little', 'slim', 'short'],
  important: ['vital', 'heavy', 'central', 'key', 'major'],
  interesting: ['curious', 'strange', 'magnetic', 'different', 'wild'],
  problem: ['issue', 'drama', 'headache', 'storm', 'mess'],
  answer: ['reply', 'response', 'key', 'truth', 'word'],
  story: ['tale', 'chapter', 'record', 'account', 'legend'],
  dream: ['vision', 'wish', 'plan', 'goal', 'picture'],
  time: ['moment', 'season', 'chapter', 'window', 'clock'],
  life: ['world', 'path', 'journey', 'story', 'days'],
  love: ['care', 'warmth', 'devotion', 'passion', 'light'],
  pain: ['hurt', 'ache', 'weight', 'scar', 'sting'],
  heart: ['chest', 'core', 'soul', 'center', 'spirit'],
  mind: ['head', 'thoughts', 'mental', 'focus', 'brain'],
  truth: ['facts', 'real', 'honesty', 'word', 'light'],
  lie: ['story', 'act', 'front', 'fable', 'mask'],
  fast: ['quick', 'rapid', 'swift', 'brisk', 'warp'],
  cold: ['frozen', 'icy', 'chilled', 'distant', 'stone'],
  hot: ['heated', 'burning', 'flame', 'blazing', 'fire'],
  night: ['evening', 'dark', 'late', 'midnight', 'moon'],
  day: ['morning', 'sunrise', 'afternoon', 'light', 'hours'],
  street: ['block', 'road', 'concrete', 'avenue', 'pavement'],
  music: ['sound', 'beat', 'rhythm', 'melody', 'track'],
  song: ['track', 'record', 'tune', 'cut', 'single'],
  stage: ['mic', 'spotlight', 'floor', 'platform', 'show'],
  crowd: ['fans', 'room', 'packed house', 'people', 'audience'],
  future: ['tomorrow', 'next', 'coming', 'ahead', 'later'],
  past: ['history', 'yesterday', 'old days', 'behind', 'memory'],
  family: ['blood', 'kin', 'tribe', 'circle', 'house'],
  success: ['wins', 'shine', 'paper', 'glory', 'arrival'],
  failure: ['loss', 'fall', 'lesson', 'setback', 'bruise'],
  dangerous: ['risky', 'wild', 'hazard', 'shady', 'sharp'],
  tiredness: ['exhaustion', 'fatigue', 'burnout', 'weight', 'wear'],
}

export const VIBE_SWAPS: Record<string, string[]> = {
  trap: ['plug', 'lit', 'turnt', 'slidin', 'bussin', 'racks', 'opps', 'whip', 'drip', 'on go'],
  drill: ['mask', 'smoke', 'opp block', 'cold', 'pressure', 'no face', 'splash', 'trap line'],
  lyrical: ['cathedral', 'ember', 'constellation', 'monument', 'silhouette', 'tapestry', 'echo', 'fracture'],
  melodic: ['golden', 'midnight', 'quiet', 'honey', 'fading', 'gentle', 'ocean', 'morning'],
}

export const MULTI_PHRASES = [
  'take advantage', 'do some damage', 'stack the cabbage', 'learn the language', 'act savage',
  'live lavish', 'leave the baggage', 'out of pocket', 'under pressure', 'no discussion',
  'off the record', 'on the regular', 'in the moment', 'for the record', 'against the odds',
  'behind the curtain', 'beneath the surface', 'across the border', 'beyond the limit',
  'under the radar', 'over the noise', 'through the static', 'past the point', 'down the line',
  'out of time', 'out of reach', 'out of sight', 'in the dark', 'in the clear', 'in the wind',
  'on the line', 'on the rise', 'on the low', 'off the chain', 'off the deep end',
  'keep it moving', 'make it happen', 'break the cycle', 'chase the feeling', 'hold the line',
  'raise the ceiling', 'set the tone', 'shift the culture', 'move the needle', 'feel the pressure',
  'test the water', 'face the music', 'pay the piper', 'take the wheel', 'steal the show',
  'call the shots', 'run the city', 'own the moment', 'kill the noise', 'cut the cord',
  'lost in the sauce', 'stuck in the middle', 'deep in the trenches', 'back in the saddle',
  'afraid of the dark', 'made of the pain', 'born in the fire', 'built from the bottom',
  'raised by the block', 'driven by hunger', 'haunted by the past', 'chasing the dawn',
  'countin the bands', 'pushin the line', 'stackin the paper', 'chasin the paper',
  'on another level', 'onto something bigger', 'nothing to lose', 'everything to prove',
  'ready for war', 'built for this', 'made for this', 'meant for this', 'here for this',
  'sick of the talk', 'tired of the games', 'done with the drama', 'over the noise',
  'drop the act', 'cut the check', 'count me in', 'listen close', 'watch it happen',
  'break the bank', 'flip the script', 'change the weather', 'make it look easy',
  'take a breath', 'say it louder', 'hold your ground', 'stand your ground',
  'look in the mirror', 'walk through the fire', 'swim with the sharks', 'dance with the devil',
  'talk to the moon', 'write it in stone', 'burn it all down', 'start it again',
]

export interface VibeKit {
  label: string
  blurb: string
  prefixes: string[]
  punches: string[]
  sparks: string[]
}

export const VIBES: Record<string, VibeKit> = {
  trap: {
    label: 'Trap',
    blurb: 'Atlanta pocket, triplet flows, ad-libs',
    prefixes: [
      "Late nights, I'm still on the",
      "Whole team lit, we came for the",
      "No sleep, I'm livin' for the",
      "Big steppers, we ain't never chased the",
      "Blue faces, I ain't gotta chase the",
      "They talk, but they never gonna take the",
      "I put the city on my back for the",
      "Same circle, we was really in the",
    ],
    punches: [
      "They ain't ready for the",
      "I don't fold, I'm built for the",
      "You can't handle the",
      "We don't chase, we attract the",
      "Tell 'em keep the",
    ],
    sparks: [
      "Started with a whisper, now the whole block knows my name",
      "Keys in the ignition, I ain't looking in the mirror",
      "Paper over passion, I was taught to make it last",
      "Whole gang eating, ain't nobody at the table starving",
      "I don't do the talking, I just show up and deliver",
      "New phone, new city, same hunger in my chest",
      "They was counting me out while I was counting up the checks",
      "I keep the circle small and the vision panoramic",
    ],
  },
  drill: {
    label: 'Drill',
    blurb: 'Dark energy, choppy bars, cold detail',
    prefixes: [
      "Mask on, no face, we don't talk about the",
      "Cold nights, long roads, I ain't never left the",
      "Speak less, move smart, let 'em guess about the",
      "No chain, no flash, just the pressure and the",
      "Every door they closed turned into another",
      "I don't trust the applause, I just trust the",
      "City on my shoulders, now I'm standing on the",
      "Same block, different year, still dodging the",
    ],
    punches: [
      "No face, no case, that's the",
      "Keep the noise away from the",
      "They can't touch the",
      "Silence speaks louder than the",
      "We ain't here for the",
    ],
    sparks: [
      "Mask on, no face, they don't know who's in the car",
      "Cold nights, long roads, I ain't never coming back",
      "Speak less, move smart, let the silence do the talking",
      "They was smiling in my face while they plotted in the dark",
      "No chain, no flash, just the pressure in my chest",
      "Every door that they closed turned into a different route",
      "I don't trust the applause, I just trust the ones who stayed",
      "City on my shoulders and it's heavy but I carry it",
    ],
  },
  lyrical: {
    label: 'Lyrical',
    blurb: 'Layered rhymes, big metaphors, dense imagery',
    prefixes: [
      "I carved a little kingdom out of all the",
      "There's a quiet kind of thunder in the",
      "I wrote my name in smoke and watched it meet the",
      "Every scar became a sentence in the",
      "I planted all my doubts and grew a garden from the",
      "The mirror is a witness to the",
      "I found a strange religion in the",
      "My thoughts are heavy weather, so I read the",
    ],
    punches: [
      "I turned the wound into the",
      "There's a monument inside the",
      "You can't measure me against the",
      "I found my voice inside the",
      "The silence never owned the",
    ],
    sparks: [
      "I carve constellations out of everything I lost",
      "There's a cathedral in the quiet where I bury what I can't say",
      "I write my name in smoke and watch the wind remember it",
      "Every scar is a sentence in a story I survived",
      "I planted all my doubts and grew a garden out of patience",
      "The mirror is a witness and it never looks away",
      "I found a kind of freedom in the things I left behind",
      "My thoughts are heavy weather but I learned to read the sky",
    ],
  },
  melodic: {
    label: 'Melodic',
    blurb: 'Singable hooks, open vowels, warm emotion',
    prefixes: [
      "Hold me in the quiet of the",
      "We were golden in the light of the",
      "Every echo of your voice is a",
      "I keep your ghost beside me like a",
      "Tell me how to find the light beyond the",
      "We were dancing in the wreckage of the",
      "I would trade a thousand mornings for the",
      "The silence sings a little softer in the",
    ],
    punches: [
      "I'll be waiting by the",
      "You were always gonna be the",
      "Nothing hits me like the",
      "I still hear you in the",
      "Take me back into the",
    ],
    sparks: [
      "Hold me in the quiet before the morning breaks",
      "We were golden in the summer, now the winter's in my hands",
      "Every echo of your voice is a room I can't leave",
      "I keep your ghost beside me like a coat I never wore",
      "Tell me how to let the light in when the curtains never move",
      "We were dancing in the wreckage like the world was made of glass",
      "I would trade a thousand mornings just to hear you say my name",
      "The silence sings a little softer when you're gone",
    ],
  },
}

export interface Topic {
  topic: string
  keys: string[]
}

export const TOPICS: Topic[] = [
  { topic: 'Coming back from rock bottom', keys: ['basement', 'rebuild', 'hunger', 'morning', 'second wind'] },
  { topic: 'The block at 3am', keys: ['headlights', 'corners', 'quiet', 'engine', 'smoke'] },
  { topic: 'A love you outgrew', keys: ['old coat', 'kitchen', 'distance', 'photos', 'maybe'] },
  { topic: 'Fake friends', keys: ['masks', 'dinner', 'envy', 'silence', 'exit'] },
  { topic: 'Chasing your dream while everyone doubts you', keys: ['doubt', 'mirror', 'stubborn', 'receipts', 'believe'] },
  { topic: 'Missing your hometown', keys: ['porch', 'rain', 'blocks', 'faces', 'sunday'] },
  { topic: 'Proving the doubters wrong', keys: ['scoreboard', 'silence', 'pressure', 'focus', 'proof'] },
  { topic: 'Losing a friend', keys: ['empty chair', 'voicemail', 'winter', 'memories', 'ache'] },
  { topic: 'The pressure of being almost famous', keys: ['spotlight', 'nerves', 'hotel', 'mirror', 'noise'] },
  { topic: 'A night that changed everything', keys: ['rain', 'phone call', 'highway', 'decision', 'sunrise'] },
  { topic: 'Money vs. peace', keys: ['numbers', 'quiet', 'chains', 'freedom', 'cost'] },
  { topic: 'Growing up too fast', keys: ['childhood', 'keys', 'watch', 'borrowed', 'streets'] },
  { topic: 'A letter to your younger self', keys: ['remember', 'careful', 'patience', 'scars', 'light'] },
  { topic: 'The one that got away', keys: ['subway', 'summer', 'almost', 'letter', 'again'] },
  { topic: 'Winning but feeling empty', keys: ['trophy', 'silence', 'penthouse', 'mirror', 'void'] },
  { topic: 'A city that never sleeps', keys: ['traffic', 'neon', 'strangers', 'midnight', 'rooftop'] },
  { topic: 'Letting go of guilt', keys: ['weight', 'breath', 'confession', 'river', 'light'] },
  { topic: 'Addiction and recovery', keys: ['numbers', 'temptation', 'morning', 'better', 'hold on'] },
  { topic: 'The grind nobody sees', keys: ['alarm', 'empty', 'practice', 'doubt', 'repeat'] },
  { topic: 'Family loyalty', keys: ['table', 'debt', 'promise', 'blood', 'sacrifice'] },
  { topic: 'Turning pain into art', keys: ['canvas', 'bruise', 'gold', 'alchemy', 'record'] },
  { topic: 'A summer you can’t get back', keys: ['fireworks', 'sandals', 'vhs', 'gold hour', 'young'] },
  { topic: 'Paranoia in success', keys: ['locks', 'whispers', 'shadow', 'pressure', 'windows'] },
  { topic: 'Starting over in a new city', keys: ['suitcase', 'maps', 'strangers', 'hope', 'empty room'] },
  { topic: 'Staying down for the team', keys: ['circle', 'ride', 'court', 'loyalty', 'phone'] },
  { topic: 'The price of being honest', keys: ['mirror', 'consequence', 'silence', 'bills', 'voice'] },
  { topic: 'A night at the studio', keys: ['red light', 'coffee', 'playback', 'rewrite', 'dawn'] },
  { topic: 'Falling for someone dangerous', keys: ['warning', 'gravity', 'fast car', 'maybe', 'exit'] },
  { topic: 'The last conversation', keys: ['phone', 'pause', 'hallway', 'if only', 'goodbye'] },
  { topic: 'Learning to be alone', keys: ['sunday', 'quiet', 'window', 'coffee', 'slowly'] },
  { topic: 'Living up to a name', keys: ['pressure', 'story', 'mirror', 'weight', 'legacy'] },
  { topic: 'The people who held you down', keys: ['table', 'hands', 'early', 'faith', 'debt'] },
  { topic: 'Leaving the neighborhood behind', keys: ['keys', 'rearview', 'corners', 'memory', 'distance'] },
  { topic: 'Fighting your own mind', keys: ['noise', 'mirror', 'night', 'breathe', 'again'] },
  { topic: 'A second chance', keys: ['doorway', 'light', 'yesterday', 'forgive', 'begin'] },
  { topic: 'Unfinished love letter', keys: ['paper', 'ink', 'almost', 'drawer', 'send'] },
]

export const CLICHES = [
  'broken heart', 'broken dreams', 'shine bright', 'like a star', 'against all odds',
  'heart of gold', 'tears on my pillow', 'down on my knees', 'lost in the dark',
  'diamond in the rough', 'light at the end', 'ride or die', 'no pain no gain',
  'through the struggle', 'rise above', 'never give up', 'hold on tight',
  'set the world on fire', 'burn it down', 'king of the world', 'top of the world',
  'living the dream', 'made it out', 'came from nothing', 'from rags to riches',
  'one in a million', 'head in the clouds', 'feet on the ground', 'fire in my soul',
  'ice in my veins', 'heart on my sleeve', 'time will tell', 'only time will tell',
  'let it go', 'here we go again', 'same old story', 'written in the stars',
  'meant to be', 'holding on', 'moving on', 'lost in time', 'end of the road',
]

export const CLICHE_SWAPS: Record<string, string[]> = {
  'broken heart': ['cracked chest', 'hollow ribcage', 'unsteady pulse'],
  'shine bright': ['burn clean', 'glow low', 'catch the light'],
  'like a star': ['like a flare', 'like a signal', 'like a furnace'],
  'lost in the dark': ['missing in the static', 'off the map', 'unlit'],
  'heart of gold': ['gold-plated courage', 'a soft center', 'warm metal'],
  'no pain no gain': ['ache, then arrive', 'cost, then keep', 'the bruise teaches'],
  'never give up': ['stay in the ring', 'keep the engine on', 'don’t fold'],
  'living the dream': ['waking up inside it', 'paying for the view', 'holding the thread'],
  'made it out': ['found the exit', 'learned the way home', 'stepped past the line'],
  'time will tell': ['the clock keeps receipts', 'wait for the ledger', 'the hours answer'],
}

export const SONG_IDEA_MOODS = ['restless', 'triumphant', 'hollow', 'tender', 'defiant', 'nostalgic', 'hopeful', 'claustrophobic', 'electric', 'quietly furious']
export const SONG_IDEA_GENRES = ['trap', 'drill', 'boom bap', 'R&B', 'melodic rap', 'lo-fi', 'pop rap', 'spoken word']
export const SONG_IDEA_IMAGES = ['headlights in rain', 'a lit window at 4am', 'an empty stadium', 'a cracked phone screen', 'a suitcase by the door', 'a crowded train', 'a burned CD', 'a rooftop at dusk', 'a kitchen table with two cups']
export const SONG_IDEA_MOVES = ['a confession', 'a victory lap', 'a letter never sent', 'a warning', 'a memory', 'a dare', 'an apology', 'a prayer', 'a toast']

export const RHYME_GAME_WORDS = [
  'time', 'mind', 'flow', 'low', 'pain', 'rain', 'night', 'light', 'game', 'name',
  'gold', 'cold', 'street', 'heat', 'wrong', 'long', 'real', 'feel', 'chain', 'rain',
  'days', 'ways', 'home', 'alone', 'heart', 'start', 'lost', 'cost', 'wave', 'save',
]

export const COWRITER_NOTE =
  'The co-writer is a local, offline spark engine: it builds ideas from the built-in pronunciation dictionary and vibe word kits, not a cloud language model.'
