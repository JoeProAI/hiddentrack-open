"""Build the web plate rigs for the Hidden Track visualizer.

Port of the Cathedral Engine V04 plate builder: a dark stable
base plus twenty luminous alpha plates cut from one master with feathered
polygon masks multiplied by the master's own luminance. Each plate carries
its V04 band, alpha/scale gains, idle oscillator and push axis, so the
browser engine can drive them from six smoothed frequency bands the same way
the native V04 state does.

Run: python3 scripts/build-plate-rigs.py
Writes public/rigs/<rig>/NN.webp and src/lib/plate-rigs.json.
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SIZE = (1024, 576)

# name, band, polys, alpha (base, gain), scale (base, gain), cycle (amp, freq, phase), push (axis, gain)
LAYERS = [
    ("crown_apex", "highmid", [[(.35, 0), (.65, 0), (.64, .19), (.50, .24), (.36, .19)]], (.34, .68), (.985, .17), (.018, .13, .05), ("y", .060)),
    ("crown_left", "mid", [[(.20, .10), (.50, .10), (.50, .31), (.39, .32), (.29, .55), (.20, .55)]], (.30, .66), (.975, .22), (.025, .11, .12), ("x", -.040)),
    ("crown_right", "mid", [[(.50, .10), (.80, .10), (.80, .55), (.71, .55), (.61, .32), (.50, .31)]], (.30, .66), (.975, .22), (.025, .11, .62), ("x", .040)),
    ("main_column_left", "bass", [[(.20, .18), (.40, .18), (.39, .86), (.20, .86)]], (.36, .70), (.965, .28), (.032, .095, .18), ("x", -.065)),
    ("main_column_right", "bass", [[(.60, .18), (.80, .18), (.80, .86), (.61, .86)]], (.36, .70), (.965, .28), (.032, .095, .68), ("x", .065)),
    ("outer_arch_left", "lowmid", [[(0, 0), (.31, 0), (.30, .78), (0, .78)]], (.26, .72), (.980, .20), (.022, .075, .08), ("x", -.080)),
    ("outer_arch_right", "lowmid", [[(.69, 0), (1, 0), (1, .78), (.70, .78)]], (.26, .72), (.980, .20), (.022, .075, .58), ("x", .080)),
    ("inner_rib_left", "mid", [[(.31, .24), (.50, .22), (.50, .72), (.32, .72)]], (.28, .78), (.955, .30), (.035, .14, .22), ("x", -.050)),
    ("inner_rib_right", "mid", [[(.50, .22), (.69, .24), (.68, .72), (.50, .72)]], (.28, .78), (.955, .30), (.035, .14, .72), ("x", .050)),
    ("portal_core", "sub", [[(.38, .27), (.62, .27), (.65, .72), (.35, .72)]], (.22, .86), (.925, .48), (.045, .07, .00), ("y", .025)),
    ("upper_ribs_left", "highmid", [[(.18, 0), (.46, 0), (.43, .34), (.22, .38)]], (.24, .74), (.980, .18), (.020, .17, .30), ("y", .055)),
    ("upper_ribs_right", "highmid", [[(.54, 0), (.82, 0), (.78, .38), (.57, .34)]], (.24, .74), (.980, .18), (.020, .17, .80), ("y", .055)),
    ("aisle_glow_left", "treble", [[(0, .30), (.28, .30), (.30, .78), (0, .82)]], (.18, .90), (.990, .14), (.016, .23, .10), ("x", -.085)),
    ("aisle_glow_right", "treble", [[(.72, .30), (1, .30), (1, .82), (.70, .78)]], (.18, .90), (.990, .14), (.016, .23, .60), ("x", .085)),
    ("root_left", "bass", [[(.15, .58), (.43, .56), (.43, .86), (.14, .86)]], (.28, .76), (.970, .30), (.028, .105, .36), ("x", -.060)),
    ("root_right", "bass", [[(.57, .56), (.85, .58), (.86, .86), (.57, .86)]], (.28, .76), (.970, .30), (.028, .105, .86), ("x", .060)),
    ("stairs", "lowmid", [[(.34, .66), (.66, .66), (.70, .90), (.30, .90)]], (.32, .70), (.965, .24), (.026, .12, .45), ("y", -.050)),
    ("floor_center", "sub", [[(.28, .78), (.72, .78), (.82, 1), (.18, 1)]], (.24, .82), (.950, .38), (.038, .08, .50), ("y", -.070)),
    ("floor_left", "treble", [[(0, .74), (.42, .74), (.40, 1), (0, 1)]], (.20, .88), (.985, .18), (.022, .19, .25), ("x", -.075)),
    ("floor_right", "treble", [[(.58, .74), (1, .74), (1, 1), (.60, 1)]], (.20, .88), (.985, .18), (.022, .19, .75), ("x", .075)),
]

RIGS = {
    "tower": ROOT / "source-art/plates/tower.webp",
    "desk": ROOT / "source-art/plates/desk.webp",
    "cathedral": ROOT / "source-art/plates/cathedral-v04.jpg",
}


def px(poly):
    return [(round(x * SIZE[0]), round(y * SIZE[1])) for x, y in poly]


def build(rig, source):
    out = ROOT / "public/rigs" / rig
    out.mkdir(parents=True, exist_ok=True)
    master = Image.open(source).convert("RGB").resize(SIZE, Image.Resampling.LANCZOS)
    base = ImageEnhance.Color(ImageEnhance.Brightness(master).enhance(.62)).enhance(.95)
    base.save(out / "00.webp", quality=70)
    luminous = ImageEnhance.Brightness(master).enhance(1.12)
    luminance = master.convert("L").point(lambda v: max(0, min(255, round((v - 7) * 1.65))))
    plates = []
    for i, (name, band, polys, alpha, scale, cycle, push) in enumerate(LAYERS, start=1):
        region = Image.new("L", SIZE, 0)
        d = ImageDraw.Draw(region)
        for poly in polys:
            d.polygon(px(poly), fill=255)
        region = region.filter(ImageFilter.GaussianBlur(7))
        a = ImageChops.multiply(region, luminance)
        bbox = a.getbbox()
        if bbox is None:
            continue  # an empty quarter of the frame (e.g. the tower plate's quiet field)
        if sum(a.crop(bbox).histogram()[24:]) < 400:
            continue
        pad = 10
        crop = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(SIZE[0], bbox[2] + pad), min(SIZE[1], bbox[3] + pad))
        cov = a.point(lambda v: 255 if v else 0)
        img = Image.composite(luminous, Image.new("RGB", SIZE, (0, 0, 0)), cov)
        img.putalpha(a)
        img.crop(crop).save(out / f"{i:02d}.webp", quality=62, method=4)
        plates.append({
            "file": f"{i:02d}.webp", "name": name, "band": band,
            "rect": [round(crop[0] / SIZE[0], 4), round(crop[1] / SIZE[1], 4), round((crop[2] - crop[0]) / SIZE[0], 4), round((crop[3] - crop[1]) / SIZE[1], 4)],
            "alpha": list(alpha), "scale": list(scale), "cycle": list(cycle), "push": list(push),
        })
    return {"base": "00.webp", "plates": plates}


manifest = {"size": list(SIZE), "rigs": {rig: build(rig, src) for rig, src in RIGS.items()}}
(ROOT / "src/lib/plate-rigs.json").write_text(json.dumps(manifest, indent=1) + "\n")
for rig, m in manifest["rigs"].items():
    print(rig, len(m["plates"]), "plates")
