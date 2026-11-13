import difflib
from lyricparse import norm
def align(lines, words, duration):
    """lines from lyricparse.parse; words = [(word,start,end)] from ASR. Returns lines with start/end (s) and conf."""
    lt=[(li,wi,w) for li,l in enumerate(lines) for wi,w in enumerate(l["words"])]
    at=[(norm(w),s,e) for w,s,e in words]; at=[a for a in at if a[0]]
    sm=difflib.SequenceMatcher(None,[x[2] for x in lt],[a[0] for a in at],autojunk=False)
    hit={}
    for b in sm.get_matching_blocks():
        for k in range(b.size): hit[b.a+k]=at[b.b+k]
    starts=[None]*len(lines); ends=[None]*len(lines); conf=[0.0]*len(lines)
    for li,l in enumerate(lines):
        idx=[n for n,(L,_,_) in enumerate(lt) if L==li]; m=[n for n in idx if n in hit]
        conf[li]=len(m)/max(1,len(idx))
        if len(m)>=max(1,min(2,len(idx)//3)):
            first=m[0]; wi=lt[first][1]; starts[li]=max(0.0,hit[first][1]-0.33*wi)
            last=m[-1]; ends[li]=hit[last][2]+0.33*(len(idx)-1-lt[last][1])
    # enforce monotonic, then interpolate gaps by word count
    prev=-1
    for li in range(len(lines)):
        if starts[li] is not None:
            if starts[li]<prev: starts[li]=None; ends[li]=None
            else: prev=starts[li]
    known=[li for li in range(len(lines)) if starts[li] is not None]
    wc=[len(l["words"]) for l in lines]
    def fill(a,b,t0,t1):
        tot=sum(wc[a:b]) or 1; t=t0
        for li in range(a,b):
            d=(t1-t0)*wc[li]/tot; starts[li]=t; ends[li]=t+d*0.9; t+=d
    if not known:
        fill(0,len(lines),min(10.0,duration*0.06),duration*0.95)
    else:
        if known[0]>0: k=known[0]; fill(0,k,max(0.0,starts[k]-2.2*sum(wc[:k])/2.5),starts[k])
        for a,b in zip(known,known[1:]):
            if b-a>1: fill(a+1,b,ends[a] or starts[a]+1,starts[b])
        k=known[-1]
        if k<len(lines)-1: fill(k+1,len(lines),(ends[k] or starts[k]+2),min(duration-1,(ends[k] or starts[k])+0.45*sum(wc[k+1:])+2))
    for li in range(len(lines)):
        nxt=starts[li+1] if li+1<len(lines) else duration
        e=ends[li] if ends[li] is not None else nxt
        lines[li]["start"]=round(starts[li],2); lines[li]["end"]=round(max(starts[li]+0.6,min(e,nxt)),2); lines[li]["conf"]=round(conf[li],2)
    return lines
