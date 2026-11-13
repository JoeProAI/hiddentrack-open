"""Scene pass for the whole catalog on the local GPU machine: local Ollama on CPU (ST_NUM_GPU=0) so the 5080 stays free for live frames.
Writes scenes/<id>.json = {model, scenes{key: scene}, secs}."""
import os, sys, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene_lib, subprocess, urllib.request
REST = float(os.environ.get("ST_REST", "4"))
def busy():
    """Pause while a Lantern Slide viewer is connected, or when the 5080 has under 3.5 GB free (live frames come first)."""
    for port in (8790, 8791):  # live server and the v2 test server: any connected viewer means hands off the GPU
        try:
            h = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2))
            if h.get("free", 1) < h.get("max", 1): return f"viewer on {port}"
        except Exception: pass
    try:
        free = int(subprocess.check_output(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"], text=True).split()[0])
        try:  # our own resident model does not count against the headroom
            free += sum(m.get("size_vram", 0) for m in json.load(urllib.request.urlopen(scene_lib.ollama_url() + "/api/ps", timeout=2)).get("models", [])) // (1 << 20)
        except Exception: pass
        if free < 3500 and not os.environ.get("ST_NUM_GPU"): return f"vram {free} MiB free"
    except Exception: pass
    return None
def wait_idle():
    n = 0
    while True:
        b = busy()
        if not b: return
        if n % 30 == 0: print(time.strftime("%H:%M:%S"), "pausing:", b, flush=True)
        n += 1; time.sleep(2)
OUT = os.path.join(HERE, "scenes"); os.makedirs(OUT, exist_ok=True)
order = [l.strip() for l in open(os.path.join(HERE, "lyrics", "_order.txt")) if l.strip()]
if len(sys.argv) > 1: order = [i for i in order if i in sys.argv[1:]]
for n, i in enumerate(order):
    of = os.path.join(OUT, i + ".json")
    ly = json.load(open(os.path.join(HERE, "lyrics", i + ".json"), encoding="utf-8"))
    if os.path.exists(of):
        try:
            if len(json.load(open(of, encoding="utf-8"))["scenes"]) >= 0.8 * len(scene_lib.unique_lines(ly.get("lyrics"))): continue
        except Exception: pass
    wait_idle(); r = scene_lib.scenes_for(ly)
    if not r["scenes"]: print("EMPTY", i, flush=True); continue
    json.dump(dict(id=i, model=r["model"], scenes=r["scenes"], secs=r["total_s"]), open(of, "w", encoding="utf-8"), ensure_ascii=False)
    print(time.strftime("%H:%M:%S"), f"{n + 1}/{len(order)}", i[:8], ly.get("title"), f"{len(r['scenes'])} scenes {r['total_s']}s", flush=True)
    time.sleep(REST)
print("scenes done", flush=True)
