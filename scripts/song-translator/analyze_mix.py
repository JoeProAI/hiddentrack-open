# same algorithm as realtime/frame_server.py analyze(), so section labels match what the frame server sees
import math, numpy as np, av
def load(path, sr=22050):
    rs=av.AudioResampler(format="flt",layout="mono",rate=sr); out=[]
    with av.open(path) as c:
        for p in c.demux(audio=0):
            for fr in p.decode():
                for r in rs.resample(fr): out.append(r.to_ndarray().reshape(-1))
    return np.concatenate(out).astype(np.float32)
def analyze(path):
    y=load(path); sr,hop,n=22050,512,2048
    frames=np.lib.stride_tricks.sliding_window_view(np.pad(y,n//2),n)[::hop]*np.hanning(n)
    S=np.abs(np.fft.rfft(frames,axis=1)).T; fq=np.fft.rfftfreq(n,1/sr); ft=np.arange(S.shape[1])*hop/sr
    L=np.log1p(S*10); flux=np.maximum(0,np.diff(L,axis=1,prepend=L[:,:1])).sum(0)
    bass=S[(fq>=20)&(fq<150)].mean(0); rms=np.sqrt((S**2).mean(0)); norm=lambda a:(a-a.min())/(np.ptp(a)+1e-9)
    o=flux-flux.mean(); ac=np.correlate(o,o,"full")[len(o)-1:]; fps=sr/hop
    lags=np.arange(int(fps*60/180),int(fps*60/70)); bpms=60*fps/lags
    score=ac[lags]*np.exp(-0.5*(np.log2(bpms/120)/0.6)**2); lag=lags[int(np.argmax(score))]; bpm=60*fps/lag
    dur=len(y)/sr; blk=8*4*60/bpm; secs=[]; q=np.quantile(rms,[.25,.5,.75])
    for k in range(int(math.ceil(dur/blk))):
        a,b=k*blk,min(dur,(k+1)*blk); m=rms[(ft>=a)&(ft<b)].mean() if b>a else 0
        lab="peak" if m>q[2] else "drive" if m>q[1] else "build" if m>q[0] else "intro_or_break"
        if secs and secs[-1]["label"]==lab: secs[-1]["end"]=round(b,2)
        else: secs.append({"index":len(secs),"start":round(a,2),"end":round(b,2),"label":lab})
    t1=np.arange(0,dur,1.0)
    return {"duration":round(dur,2),"bpm":round(float(bpm),2),"sections":secs,"energy_1s":np.round(np.interp(t1,ft,norm(rms)),2).tolist()}
