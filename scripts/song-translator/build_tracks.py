"""Merge align/<id>.json (timed lines + section analysis) and scenes/<id>.json (line -> scene) into the compact prompt track
the card and frame server read: public/lantern/tracks/<id>.json = {v, id, bpm, dur, cues:[[start, end, lyric, scene, label]]}."""
import json, os, re, sys
SRC, OUT = sys.argv[1], sys.argv[2]
def key(l): return re.sub(r"[^a-z0-9 ]", "", l.lower()).strip()
os.makedirs(OUT, exist_ok=True); n = 0
for f in sorted(os.listdir(os.path.join(SRC, "align"))):
    sid = f[:-5]; sp = os.path.join(SRC, "scenes", f)
    if not os.path.exists(sp): continue
    a = json.load(open(os.path.join(SRC, "align", f), encoding="utf-8")); sc = json.load(open(sp, encoding="utf-8"))["scenes"]
    secs = a["analysis"]["sections"]
    lab = lambda t: next((s["label"] for s in secs if s["start"] <= t < s["end"]), secs[-1]["label"] if secs else "drive")
    cues = []
    for l in a["lines"]:
        s = sc.get(key(l["text"]))
        if not s: continue
        cues.append([round(l["start"], 2), round(l["end"], 2), l["text"][:120], s[:160], lab(l["start"])])
    if len(cues) < 4: continue
    cues.sort(key=lambda c: c[0])
    json.dump({"v": 1, "id": sid, "title": a.get("title"), "bpm": a["analysis"]["bpm"], "dur": a["analysis"]["duration"],
               "conf": round(sum(l["conf"] for l in a["lines"]) / max(1, len(a["lines"])), 2), "cues": cues},
              open(os.path.join(OUT, sid + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n += 1
print("tracks", n)
