# Flowstate

A free, open-source, local-first songwriting studio. Write lyrics with live rhyme colouring, live syllable counts, scansion, a beat grid, section structure, takes, a local beat machine and a booth teleprompter — all on your own device. No account is needed to write; cloud sync is optional, off until you sign in, and only ever copies what you choose to sync.

The calm paper-and-serif interface is modelled on [Flowrite](https://github.com/pi22by7/flowrite); the writing toolset draws on the features writers know from RapPad, RhymeFlux and Lyric Studio.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # typecheck + production build
npm test         # analyzer and export smoke tests
```

## What is inside

**Writing canvas**
- Live watercolour rhyme colouring — Strict, Rap or Loose detection, with 15 rhyme families
- Live syllable count, Flowrite-style dot/triangle/hex glyphs, and rhyme-scheme letters (A/B/C)
- Beat grid per line with amber/red drift warnings against the section average
- Undo and redo across lyric and library edits (`⌘/Ctrl+Z`, `⇧⌘/Ctrl+Z`), grouped per typing burst
- Automatic version history — a snapshot every two minutes and when you leave a song, plus manual saves and one-tap restore
- Section types (intro, verse, pre-chorus, hook, bridge, outro), targets and reordering
- Per-bar drafts, voice takes recorded to IndexedDB, and a local “spark” co-writer
- Double-click any word for rhymes, same-syllable words, swaps and multi-syllable phrases
- Ghost rhymes on empty bars, focus mode, keyboard-first editing, paste-a-verse support

**Studio tools**
- Rhyme finder grouped by syllable count (perfect / multisyllabic / slant)
- Syllable counter and rhyme-scheme analyser for pasted lyrics
- Flow & scansion view: CMU stress marks, dashed guesses and a beat anchor every four syllables
- Lyric coach: clichés, repeated words, filler, uneven pockets, orphaned rhymes
- “Rate my rap” blueprint with five live scores
- Topic roller, 60-second freestyle pad, and a daily rhyme game
- Song idea generator, full-song reader, structure reordering
- Snippet vault: bookmark a bar in one song, pull it into another
- Export TXT, Markdown, LRC timeline, per-song JSON, 1080×1350 PNG, share sheet, print/PDF, and full JSON backup

**Sound & performance**
- Offline synthesized trap, drill, boom-bap and lo-fi drum patterns with BPM and tap tempo
- Full-song booth recorder with an optional four-beat count-in and beat playback, alongside per-bar takes
- Booth teleprompter with adjustable size, scroll speed, mirror and screen wake-lock

**Your own words**
- Teach the analyser pronunciations the dictionary does not carry — names, slang, invented words — in Settings. They then count, stress and rhyme like any other word.

## Cloud sync (optional)

A build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` shows a **Sign in to sync** pill on the home screen; without them Flowstate is local-only and the SDK is never downloaded.

- One Postgres row per song, keyed by the same id used locally, with a `revision` token so two devices cannot overwrite each other blindly. A device that loses a merge keeps its version in the local history.
- Deletions travel as tombstones. Trash is restorable, *Deleted forever* is a purge that every device learns, and another device can never re-upload a song you erased.
- Settings, folders, the snippet vault and taught pronunciations sync too. Vault and pronunciation removals carry their own tombstones, so removing a snippet on one device actually removes it.
- Invite links share a single song with another writer as an editor or a read-only viewer. The link works for fourteen days; the owner can remove someone at any time.
- Changes arrive live over Supabase Realtime, with a 45-second incremental poll as the fallback.

Audio takes never sync: they stay in the recording device's IndexedDB, and other devices label them “elsewhere” rather than offering a play button that cannot work.

A free-plan Supabase project pauses after about a week without use; sync shows a connection error until the project is restored from the dashboard.

## Privacy

Everything lives in `localStorage` (lyrics, settings, versions) and IndexedDB (audio takes) in your browser. There is no analytics. Nothing is uploaded unless you sign in, and signing out leaves every song on the device.

With sync on, your songs, settings, folders, snippet vault and taught pronunciations are stored in your Supabase project. **Erase my cloud copy** in the sync sheet removes what the account holds without touching this browser. Shared songs are the one case where your lyrics are readable by a second person: an invite link adds them as editor or viewer until the owner removes them. Passwords are handled by Supabase Auth and never touch Flowstate code.

Export a backup from Settings to move your library without an account. If two tabs have the same library open, the second one stops writing and offers to load the other tab's version instead of silently overwriting it.

## Install it

Flowstate ships a web app manifest and a small service worker. After one online visit, browsers offer **Install** (desktop Chrome) or **Add to Home Screen** (iOS/Android). On install the worker precaches the shell and reads `index.html` for the hashed build files, so the first offline reload has everything it needs; navigations prefer a fast network response and fall back to the cached shell after a beat. Bump `CACHE` in `public/sw.js` when shipping a release that must not come from an older cache.

## Android app

`android/` is a [Capacitor](https://capacitorjs.com) shell around the same `dist/` build, so the APK runs the identical local-first app with its lyrics, takes and settings stored on the device.

```bash
npm install
npm run android:apk   # build web assets, sync them, assemble the debug APK
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. It needs JDK 21 and Android SDK platform 36 with build-tools 36 (`ANDROID_HOME` and `JAVA_HOME` set), or open `android/` in Android Studio and press Run. The debug APK is self-signed with the debug key and installs on Android 7.0+ (minSdk 24) after allowing installs from unknown sources; publishing to Play needs a release signing config of your own. App id is `com.flowstate.app`, and the launcher icon and splash come from `public/icons/icon-512.png`.

## Windows app

`electron/` is a thin shell around the same `dist/` build, served from a private `app://flowstate` origin so the page keeps one stable origin for local storage and counts as a secure context for the microphone.

```bash
npm install
npm run desktop            # build, then open the desktop app
npm run desktop:installer  # build the NSIS installer (run this on Windows)
```

The installer lands in `release/Flowstate-Setup-<version>.exe` and installs per user, so no admin prompt. It is **not code signed**, so Windows shows "Unknown publisher" and SmartScreen until you configure `win.sign` in `electron-builder.yml` (an OV/EV certificate or Azure Trusted Signing).

Pushing a `v*` tag runs `.github/workflows/release.yml`: the same installer is built on `windows-latest` and attached to the GitHub release together with `SHA256SUMS.txt` — the URL and hash a winget manifest needs. Set `FLOWSTATE_DEV_URL=http://localhost:3000` to point the shell at `npm run dev` instead of `dist/`.

Exports, the PNG share image and Print/PDF go through the main process: files open a Save dialog and printing opens the native print dialog. The booth recorder needs Windows **Settings → Privacy → Microphone → Let desktop apps access your microphone**.

## Deploy the demo

`vite.config.ts` builds with `base: './'`, so the same `dist/` works at a domain root or under a GitHub Pages project path.

1. Push the repository to GitHub.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. `.github/workflows/pages.yml` builds and publishes `dist/` on every push to `main`; `.github/workflows/ci.yml` typechecks, tests and builds on pushes and pull requests.
4. For cloud sync, add repository **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and variables → Actions → Variables**. Both are read at build time, so a missing variable deploys a local-only demo — never a broken one.
5. In the Supabase dashboard, set **Authentication → URL Configuration → Site URL** to the Pages URL and add it to the redirect allow list. Confirmation and password-reset emails otherwise point at `localhost`.
6. Apply `supabase/migrations/*.sql` in order, or run `supabase link` then `supabase db push`; `supabase/config.toml` holds the local ports and auth settings.

The site lands at `https://<user>.github.io/<repo>/`.

## Built with

React, TypeScript and Vite. Rhyme and syllable analysis uses the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) via `cmu-pronouncing-dictionary`; suggestions are ranked against the [google-10000-english](https://github.com/first20hours/google-10000-english) word list. Type is Lora and Inter (SIL OFL). The co-writer is a deterministic local generator, not a cloud AI model.

The dictionary is a multi-megabyte chunk, so it is loaded after the interface paints: syllable counts fall back to a letter heuristic for the first moment, then rhyme colour and exact counts appear. Tests live next to the analyzers (`src/lib/*.test.ts`) and run under Vitest.

## Not included

Community feeds, battles, full real-time co-writing, a licensed beat library and image search all require a backend or paid services, so they are deliberately absent. Sync is the one networked feature, it is optional, and the writing app is offline and free by design.

## License

MIT — see [LICENSE](LICENSE).
