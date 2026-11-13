# Hidden Track

Joe Gaither's music site, live at https://hiddentrack.fm. Fresh Cuts, newest first, with a player that keeps going while you move around the site.

## Adding a Fresh Cuts batch

All tracks live in one file: `src/lib/fresh-cuts.ts`.

1. Add the new songs to the **top** of the `tracks` array. The list is newest first, and the home page, `/listen`, the X player at `/embed` and `/listen/x` all read from it.
2. Put a comment line above the batch, like `// Fresh Cuts 2026-10-19 AM`.
3. Each entry is `{ title, lane, hook, href, tags }`. `href` is the public Suno song URL (`https://suno.com/song/<id>`). The song must be published on Suno, since playback and downloads come from Suno's public CDN.
4. **Always set `tags`.** Pick one or more from `hard`, `halloween`, `cinematic`, `party`, `chill`, `love`, `sad`, `funny` (the list lives in `src/lib/moods.ts`). Tags drive the mood filters on the home page, the rooms on `/map` and the `/halloween` playlist. Anything spooky, haunted, horror or October-night gets `halloween`, or it won't show up on `/halloween`. Example:

   ```ts
   { title: "Closed Casket", lane: "Cold storytelling rap", hook: "...", href: "https://suno.com/song/<id>", tags: ["halloween", "hard", "sad"] },
   ```

   If `tags` is missing, moods are guessed from the lane and hook, which is fine for old cuts but not good enough for new ones.
5. Open a PR, squash-merge it, and Vercel deploys to production.

Share links are built from titles (`/?t=<slug>`). If two titles match, the later one gets `-2`, so add new songs at the top and don't reorder old ones.

## Routes

- `/` and `/listen`: the Fresh Cuts list and the sticky bottom player (auto-advance, shuffle, share links, downloads)
- `/song/<slug>`: one page per song (play, download, license, related songs, OG card, JSON-LD). Every song is in `/sitemap.xml` automatically.
- `/map`: The Cobbler's Chart, a footprint map of the catalog. Rooms are moods, so tags decide where a song lives.
- `/halloween`: free Halloween and horror music, every track tagged `halloween`. Auto-advance stays inside the playlist.
- `/license`: the free-to-use terms
- `/embed`: the compact player used inside X posts
- `/listen/x`: the page to paste on X (Twitter player card). Add `?v=2` or a new number to bust X's card cache.
- `/api/download/<slug>`: downloads an audio-only .m4a (`Title - Hidden Track.m4a`), remuxed without re-encoding from the Suno MP4 by `src/lib/m4a-remux.ts`. Falls back to the MP4 if the remux fails.

## Local

```
npm install
npm run dev
```

## Counting House and the store

- `/album/counting-house`: the debut album. Track order lives in `src/lib/album.ts` as Fresh Cuts slugs, so every row plays in the sticky player and links to its `/song/<slug>` page. The cover is a type-only placeholder (`src/components/album/LedgerCover.tsx`); swap in the real art when it lands.
- Store links live in `src/lib/store.ts`. They are public Stripe Payment Link URLs, not secrets, so no Stripe key is needed in Vercel.
  - `cdPreorderUrl`: Counting House CD pre-order. While it's `null`, the album page says "CD pre-orders open here soon."
  - `tipUrl`: "Keep Hidden Track free", pay what you want. While it's `null`, the footer and license page hide it.
- Copy rule: every song stays free. The CD is for the shelf. Don't make claims about streaming platforms on the site yet.

## Visuals (Signal engine)

- `src/lib/signal-engine.ts`: band split, energy, transient and afterglow math behind every visual channel. Synthesizes a spectrum when Web Audio is not live, so the X card never looks dead before the first tap.
- `src/components/viz/SignalCanvas.tsx`: the Black Sun corona and mirrored blades as one WebGL shader, with a Canvas 2D fallback (`?viz=2d` forces it). Lazy init, capped DPR, paused offscreen, one still frame under reduced motion.
- The hero wordmark and the X card title are meters: Anybody's width axis rides the bass.

## Direction

The look is System 04 Broadcast ("public signal": monumental headlines over a strict information grid, hard cuts and ticker passes, screenprint ink and transit vinyl), dials at type 98, rupture 82, heat 96, grit 84, motion 95, detail 72. The two background plates are `source-art/plates/tower.webp` and `desk.webp`. The dial-to-CSS values live as `--pd-*` tokens at the top of `src/app/globals.css`. The Broadcast signature is the six-band signal meter in the hero.

## Channels (Signal Theater and plate rigs)

Eleven visual channels share one signal and one setting (`src/lib/scenes.ts`, `src/lib/scene-store.ts`). Switch them from the channel dial on the home page, the TV button in the dock (full-screen Signal Theater, arrow keys change channel, Esc closes) or the channel button in the X card. `?viz=<scene-id>` picks one from a link and `?viz=2d` still forces the Canvas fallback for Black Sun.

- V01-V08: Signal Theater's Canvas scenes (Neon Rift, Black Sun, Wave Temple, Gravity Grid, Spectral Crown, Wormhole, Dust Choir, Signal Ghost), re-inked in the Broadcast palette. Black Sun stays on WebGL with the 2D fallback.
- V09-V11: plate rigs, a web port of the Cathedral V04 rig. `scripts/build-plate-rigs.py` cuts a dark base plus twenty luminous alpha plates from a master (V04 polygons, feathered masks times the master's own luminance). In the browser each plate follows one of six bands (sub, bass, lowmid, mid, highmid, treble) smoothed at the V04 speeds (5, 6.5, 6, 7, 8.5, 11 per second), with V04's per-plate alpha gain, scale gain, idle oscillator and push axis. Pirate Tower and Mixing Desk use the two background plates; Cathedral V04 uses its own master. Rig images load only when the channel is picked.

Rebuild the rigs after changing a plate: `python3 scripts/build-plate-rigs.py`.

## License

The source code in this repository is released under the MIT License. See [LICENSE](LICENSE).

The MIT License covers the code only. The songs are free to use as described at https://hiddentrack.fm/license.
