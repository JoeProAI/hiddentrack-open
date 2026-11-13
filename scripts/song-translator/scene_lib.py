"""Lyric line -> visual scene prompt via local Ollama (gemma3:4b). Used by the catalog batch and the live on-demand path."""
import json, os, re, time, urllib.request
MODEL = os.environ.get("ST_MODEL", "gemma3:4b"); OLLAMA = (os.environ.get("ST_OLLAMA") or os.environ.get("OLLAMA_HOST") or "").rstrip("/")
if OLLAMA and "://" not in OLLAMA: OLLAMA = "http://" + OLLAMA
def ollama_url():
    if not OLLAMA: raise RuntimeError("set ST_OLLAMA (or OLLAMA_HOST) to your Ollama base URL")
    return OLLAMA
DENY = re.compile(r"\b(nude|nudes|naked|nsfw|porn\w*|hentai|sex|sexy|sexual|boobs?|tits|genitals?|gore|gory|corpse|bloody|dismember\w*|decapitat\w*|nazi|swastika|"
                  r"celebrity|celebrities|taylor swift|beyonce|kanye|trump|biden|obama|elon musk|musk|putin|rihanna|eminem|selfie|headshot|logo|caption|text|words|letters|lyrics)\b", re.I)
TAG = re.compile(r"^\s*\[([^\]]*)\]\s*$")
SYS = ("You turn song lyrics into visual scene prompts for a live music visualizer. For EACH numbered line, write ONE vivid, concrete scene "
       "(8 to 18 words): a place, objects, light, motion and colour that SHOWS what the line means. Match the song's style and mood. "
       "Rules: no real or famous people, no recognizable faces (people only as silhouettes, figures, hands or crowds from behind), "
       "no brand names, no written text or words in the image, no gore, no nudity, nothing sexual. Never quote the lyric; translate it into imagery. "
       "Return JSON: {\"scenes\":[{\"n\":<line number>,\"scene\":\"...\"}]} with one entry per line, in order.")
def key(l): return re.sub(r"[^a-z0-9 ]", "", l.lower()).strip()
def unique_lines(lyrics):
    out, seen, sec = [], set(), "Intro"
    for raw in (lyrics or "").splitlines():
        l = raw.strip()
        if not l: continue
        m = TAG.match(l)
        if m: sec = m.group(1).split(":")[0].strip() or sec; continue
        l = re.sub(r"\[[^\]]*\]", "", l).strip(); k = key(l)
        if k and k not in seen: seen.add(k); out.append((sec, l))
    return out
def clean(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip(" .\"'")
    return "" if (not s or DENY.search(s)) else s[:160]
def _chat(prompt, n, stream=False):
    body = {"model": MODEL, "stream": stream, "format": "json", "keep_alive": "60s",
            "options": dict({"temperature": 0.8, "num_ctx": 8192, "num_predict": 60 * n + 200}, **({"num_gpu": int(os.environ["ST_NUM_GPU"])} if os.environ.get("ST_NUM_GPU") else {})),
            "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": prompt}]}
    return urllib.request.urlopen(urllib.request.Request(ollama_url() + "/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=300)
def prompt_for(meta, chunk, base):
    return (f"Song: {meta.get('title')}\nStyle: {(meta.get('tags') or '')[:300]}\n\nLines:\n" +
            "\n".join(f"{base + k + 1}. [{sec}] {l}" for k, (sec, l) in enumerate(chunk)))
def scenes_for(meta, chunk_size=40):
    """Batch: {key(line): scene} for every unique line, plus timing."""
    uniq = unique_lines(meta.get("lyrics")); out = {}; t0 = time.time(); first = None
    for c in range(0, len(uniq), chunk_size):
        chunk = uniq[c:c + chunk_size]
        _batch(meta, chunk, c, uniq, out)
        if first is None: first = round(time.time() - t0, 2)
    for _ in range(2):  # small models sometimes skip lines: ask again for just the missing ones
        miss = [(sec, l) for sec, l in uniq if key(l) not in out]
        if not miss: break
        for c in range(0, len(miss), 20): _batch(meta, miss[c:c + 20], c, miss, out)
    return {"model": MODEL, "scenes": out, "first_s": first, "total_s": round(time.time() - t0, 2)}
def _batch(meta, chunk, c, uniq, out):
        for _ in range(2):
            try:
                d = json.load(_chat(prompt_for(meta, chunk, c), len(chunk)))
                for g in json.loads(d["message"]["content"]).get("scenes", []):
                    try: n = int(g.get("n"))
                    except Exception: continue
                    s = clean(g.get("scene"))
                    if s and c < n <= c + len(chunk): out[key(uniq[n - 1][1])] = s
                break
            except Exception as e:
                print("scene retry", repr(e)[:120], flush=True)
def stream_scenes(meta, first_n=6):
    """Live path: yields (key, scene) as soon as each one is parsed from the token stream. First chunk is small so the
    opening lines land in about a second, then the rest follow in bigger chunks."""
    uniq = unique_lines(meta.get("lyrics")); spans = [(0, min(first_n, len(uniq)))]
    c = spans[0][1]
    while c < len(uniq): spans.append((c, min(c + 30, len(uniq)))); c += 30
    pat = re.compile(r'\{\s*"n"\s*:\s*(\d+)\s*,\s*"scene"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}')
    for a, b in spans:
        chunk = uniq[a:b]; buf = ""; seen = set()
        for raw in _chat(prompt_for(meta, chunk, a), len(chunk), stream=True):
            try: buf += json.loads(raw).get("message", {}).get("content", "")
            except Exception: continue
            for m in pat.finditer(buf):
                n = int(m.group(1))
                if n in seen or not (a < n <= b): continue
                seen.add(n); s = clean(json.loads('"' + m.group(2) + '"'))
                if s: yield key(uniq[n - 1][1]), s
