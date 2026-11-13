"""Song translator catalog batch for the local GPU machine (ComfyUI embedded python, extra libs in ./pylib).
Per song: Suno audio -> section/energy analysis -> demucs vocals (5080, small) -> faster-whisper small.en word times (CPU)
-> align the Suno lyric sheet -> local Ollama scene pass -> out/<id>.json.
Polite: pauses whenever a Lantern Slide LIVE viewer is connected (frame server /health) and rests between songs. $0, no cloud."""
import sys, os, json, time, re, urllib.request, traceback
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, "pylib")); sys.path.insert(0, HERE)
import numpy as np, torch
from lyricparse import parse
from align import align
from analyze_mix import analyze
REST = float(os.environ.get("ST_REST", "3"))
OUT = os.path.join(HERE, "align"); AUD = os.path.join(HERE, "audio"); os.makedirs(OUT, exist_ok=True); os.makedirs(AUD, exist_ok=True)
def busy():
    for port in (8790, 8791):
        try:
            h = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2))
            if h.get("free", 1) < h.get("max", 1): return True
        except Exception: pass
    return False
def wait_idle():
    n = 0
    while busy():
        if n % 30 == 0: print(time.strftime("%H:%M:%S"), "live viewer connected, pausing", flush=True)
        n += 1; time.sleep(2)
torch.cuda.set_per_process_memory_fraction(0.25)
from demucs.pretrained import get_model
from demucs.apply import apply_model
from faster_whisper import WhisperModel
import av
dm = get_model("htdemucs").eval()
asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=8)
def load44(path):
    rs = av.AudioResampler(format="flt", layout="stereo", rate=44100); out = []
    with av.open(path) as c:
        for p in c.demux(audio=0):
            for fr in p.decode():
                for r in rs.resample(fr): out.append(r.to_ndarray().reshape(-1, 2))
    return np.concatenate(out).T.astype(np.float32)
order = [l.strip() for l in open(os.path.join(HERE, "lyrics", "_order.txt")) if l.strip()]
if len(sys.argv) > 1: order = [i for i in order if i in sys.argv[1:]]
done = 0
for n, i in enumerate(order):
    of = os.path.join(OUT, i + ".json")
    if os.path.exists(of): continue
    wait_idle(); t0 = time.time()
    try:
        ly = json.load(open(os.path.join(HERE, "lyrics", i + ".json"), encoding="utf-8")); lines = parse(ly["lyrics"])
        ap = os.path.join(AUD, i + ".mp4")
        if not os.path.exists(ap): urllib.request.urlretrieve(f"https://cdn1.suno.ai/{i}.mp4", ap)
        an = analyze(ap); t1 = time.time()
        x = torch.from_numpy(load44(ap)); ref = x.mean(0); mu, sd = ref.mean(), ref.std(); x = ((x - mu) / sd).cuda()
        dm.cuda()
        with torch.no_grad(): st = apply_model(dm, x[None], device="cuda", shifts=0, split=True, overlap=0.1, progress=False)[0]
        v = (st[dm.sources.index("vocals")] * sd.cuda() + mu.cuda()).mean(0)
        v16 = torch.nn.functional.interpolate(v[None, None], scale_factor=16000 / 44100, mode="linear")[0, 0].float().cpu().numpy()
        del x, st, v; dm.cpu(); torch.cuda.empty_cache(); t2 = time.time()
        segs, _ = asr.transcribe(v16, word_timestamps=True, vad_filter=True, language="en", beam_size=1)
        words = [(w.word, w.start, w.end) for sg in segs for w in sg.words]; t3 = time.time()
        lines = align(lines, words, an["duration"])
        t4 = time.time()
        json.dump(dict(id=i, title=ly.get("title"), tags=ly.get("tags"), analysis=an, 
                       lines=[{k: l[k] for k in ("i", "text", "section", "start", "end", "conf")} for l in lines],
                       asr_words=len(words), secs={"analyze": round(t1 - t0, 1), "sep_gpu": round(t2 - t1, 1), "asr_cpu": round(t3 - t2, 1)}),
                  open(of, "w", encoding="utf-8"), ensure_ascii=False)
        done += 1
        try: os.remove(ap)
        except OSError: pass
        cf = np.mean([l["conf"] for l in lines]) if lines else 0
        print(time.strftime("%H:%M:%S"), f"{n + 1}/{len(order)}", i[:8], ly.get("title"), f"{time.time() - t0:.0f}s sep={t2 - t1:.1f} asr={t3 - t2:.1f} conf={cf:.2f}", flush=True)
    except Exception as e:
        print("FAIL", i, repr(e)[:300], flush=True); traceback.print_exc()
    time.sleep(REST)
print("batch done", done, flush=True)
