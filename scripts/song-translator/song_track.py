"""Song translator for the Lantern Slide frame server: a timed prompt track per song.

get(song, tl) -> Track (never blocks). Sources, fastest first:
  1. tracks/<id>.json on this PC (catalog batch output)
  2. https://hiddentrack.fm/lantern/tracks/<id>.json (the same files, shipped with the site)
  3. LIVE: Suno lyric sheet + local Ollama streamed scene pass, lines timed across the song's vocal sections by word count.
     First scenes arrive in about a second or two with the model warm; the rest stream in. Saved to tracks/live/ for next time.
cue_at(track, t) -> (start, end, lyric, scene, label) | None
"""
import json, os, re, sys, threading, time, urllib.request
from pathlib import Path
HERE = Path(__file__).resolve().parent
TR = HERE / "tracks"; LIVE = TR / "live"; LIVE.mkdir(parents=True, exist_ok=True)
SITE = os.environ.get("ST_SITE", "https://hiddentrack.fm")
sys.path.insert(0, str(HERE))
if os.environ.get("ST_HOME"): sys.path.insert(0, os.environ["ST_HOME"])
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_mem, _lock, _live_running = {}, threading.Lock(), set()
MAX_LIVE = 2

class Track:
    def __init__(self, song): self.song, self.cues, self.source, self.ready, self.first_s = song, [], "none", False, None
    def add(self, cue):
        self.cues.append(cue); self.cues.sort(key=lambda c: c[0])

def _load_json(p):
    try: return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception: return None

def _fetch_site(song):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"{SITE}/lantern/tracks/{song}.json", headers={"User-Agent": "lantern-slide"}), timeout=6)
        return json.load(r)
    except Exception: return None

def cue_at(track, t):
    if not track or not track.cues: return None
    cs = track.cues; lo, hi, hit = 0, len(cs) - 1, -1
    while lo <= hi:
        m = (lo + hi) // 2
        if cs[m][0] <= t: hit, lo = m, m + 1
        else: hi = m - 1
    if hit < 0: return None
    c = cs[hit]
    return c if t <= max(c[1], c[0] + 2.5) + 1.5 else None

def _time_lines(uniq_all, tl):
    """No ASR on the live path: spread lines over the non-intro sections by word count (good enough to follow verse/hook)."""
    dur = tl["duration"]; secs = tl.get("sections") or [{"start": 0, "end": dur, "label": "drive"}]
    vocal = [s for s in secs if s["label"] != "intro_or_break"] or secs
    t0 = max(vocal[0]["start"], min(12.0, dur * 0.06)); t1 = min(dur - 2, vocal[-1]["end"])
    wc = [max(3, len(l.split())) for _, l in uniq_all]; tot = sum(wc) or 1; t = t0; out = []
    lab = lambda x: next((s["label"] for s in secs if s["start"] <= x < s["end"]), secs[-1]["label"])
    for (sec, l), w in zip(uniq_all, wc):
        d = (t1 - t0) * w / tot; out.append((round(t, 2), round(t + d * 0.92, 2), l, lab(t))); t += d
    return out

def _live(song, tl, tr):
    try:
        import scene_lib
        req = urllib.request.Request(f"https://studio-api.prod.suno.com/api/clip/{song}", headers={"User-Agent": "Mozilla/5.0"})
        d = json.load(urllib.request.urlopen(req, timeout=8)); m = d.get("metadata") or {}
        meta = {"title": d.get("title"), "tags": m.get("tags"), "lyrics": m.get("prompt") or ""}
        # every sung line in order (repeats included) for timing; scenes come per unique line
        lines, sec = [], "Intro"
        for raw in meta["lyrics"].splitlines():
            l = raw.strip()
            if not l: continue
            mm = scene_lib.TAG.match(l)
            if mm: sec = mm.group(1).split(":")[0].strip() or sec; continue
            l = re.sub(r"\[[^\]]*\]", "", l).strip()
            if l: lines.append((sec, l))
        if not lines: tr.ready = True; return
        timed = _time_lines(lines, tl); t0 = time.time()
        for k, scene in scene_lib.stream_scenes(meta):
            if tr.first_s is None: tr.first_s = round(time.time() - t0, 2)
            for (s, e, l, lab) in timed:
                if scene_lib.key(l) == k: tr.add([s, e, l[:120], scene, lab])
        have = {scene_lib.key(c[2]) for c in tr.cues}
        miss = [(sec, l) for sec, l in scene_lib.unique_lines(meta["lyrics"]) if scene_lib.key(l) not in have]
        if miss:  # fill any lines the stream skipped
            got = {}
            for c in range(0, len(miss), 20): scene_lib._batch(meta, miss[c:c + 20], c, miss, got)
            for (s, e, l, lab) in timed:
                k = scene_lib.key(l)
                if k in got and k not in have: tr.add([s, e, l[:120], got[k], lab])
        tr.ready = True; tr.source = "live"
        (LIVE / f"{song}.json").write_text(json.dumps({"v": 1, "id": song, "live": True, "first_s": tr.first_s, "total_s": round(time.time() - t0, 2), "cues": tr.cues}, ensure_ascii=False), encoding="utf-8")
        print(f"song translator live {song[:8]}: {len(tr.cues)} cues, first {tr.first_s}s, total {time.time() - t0:.1f}s", flush=True)
    except Exception as e:
        print(f"song translator live failed {song[:8]} {type(e).__name__}: {str(e)[:120]}", flush=True); tr.ready = True
    finally:
        with _lock: _live_running.discard(song)

def get(song, tl=None):
    if not UUID.match(song or ""): return None
    with _lock:
        if song in _mem and (_mem[song].ready or _mem[song].cues or song in _live_running): return _mem[song]
        tr = _mem[song] = Track(song)
    for p, src in ((TR / f"{song}.json", "local"), (LIVE / f"{song}.json", "live-cache")):
        j = _load_json(p)
        if j and j.get("cues"): tr.cues, tr.source, tr.ready = [list(c) for c in j["cues"]], src, True; return tr
    def bg():
        j = _fetch_site(song)
        if j and j.get("cues"):
            tr.cues, tr.source, tr.ready = [list(c) for c in j["cues"]], "site", True
            try: (TR / f"{song}.json").write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
            except Exception: pass
            return
        if tl is None: tr.ready = True; return
        with _lock:
            if len(_live_running) >= MAX_LIVE: tr.ready = True; return
            _live_running.add(song)
        _live(song, tl, tr)
    threading.Thread(target=bg, daemon=True).start()
    return tr
