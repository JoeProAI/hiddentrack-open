import re
TAG=re.compile(r"^\s*\[([^\]]*)\]\s*$")
def norm(w): return re.sub(r"[^a-z0-9']","",w.lower().replace("’","'")).strip("'")
def parse(lyrics):
    """-> list of {i, text, section, words:[norm]} ; section = last [Tag] seen"""
    out=[]; sec="Intro"
    for raw in (lyrics or "").splitlines():
        l=raw.strip()
        if not l: continue
        m=TAG.match(l)
        if m: sec=m.group(1).split(":")[0].strip() or sec; continue
        l=re.sub(r"\[[^\]]*\]","",l).strip()
        if not l: continue
        ws=[norm(w) for w in re.split(r"[\s\-–]+",l)]; ws=[w for w in ws if w]
        if ws: out.append(dict(i=len(out),text=l,section=sec,words=ws))
    return out
