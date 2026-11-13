# Song translator (Lantern Slide)

Turns every Hidden Track song into a timed prompt track: each sung line becomes a visual scene prompt.
Output: `public/lantern/tracks/<suno id>.json` = `{v, id, title, bpm, dur, conf, cues: [[start_s, end_s, lyric, scene, energy_label]]}`.

Pipeline (runs on a local GPU machine beside the frame server, $0, no cloud). Set `ST_OLLAMA` (or `OLLAMA_HOST`) to your Ollama base URL,
and `ST_HOME` to this folder if the frame server imports `song_track.py` from somewhere else:
1. `fetch_lyrics.py` pulls each song's lyric sheet and style tags from Suno's public clip API.
2. `pc_batch.py`: section/energy analysis, demucs vocal stem (GPU, capped at 25% VRAM), faster-whisper small.en word timestamps (CPU),
   then `align.py` matches the lyric sheet to the heard words (difflib anchors, word-count interpolation between anchors).
3. `pc_scenes.py` + `scene_lib.py`: local Ollama (gemma3:4b) writes one scene per unique line; denylist + no real people / faces / text.
   Both batches pause whenever a Lantern Slide viewer is connected.
4. `build_tracks.py` merges align + scenes into the compact track files.

Playback: the card shows the current line and its scene (`src/app/embed/LyricCue.tsx`, CC toggle). The frame server loads the same
track (`song_track.py`: local file, then hiddentrack.fm, then a live Ollama pass for uncached songs) and uses the current line's scene as
the prompt; a typed viewer prompt overrides for 8 s, then hands back to the song.
