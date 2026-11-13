// Cathedral Live stage: one WebGL2 canvas that
//  1) shows the GPU-dreamed frames as stained glass behind the Astral Cathedral (Signal Vault CUTLIGHT layers),
//     clearer through the central portal, with lead lines and a bass glow,
//  2) blends between server frames at display rate (crossfade + continued push-in), so ~12-15 generated fps
//     reads as smooth 60 fps motion,
//  3) moves the 12 cathedral layers with the music (port of CUTLIGHT's band -> motion choreography),
//  4) flat stage (default, no cathedral): CUTLIGHT moves the live frames themselves: band-driven sway, depth parallax,
//     cut kicks (alternating side push + RGB split + flash) and a hue jump on big cuts that eases back.
// Before the first AI frame the background is transparent, so whatever is behind the canvas shows in the windows.

export type Bands = { bass: number; lowMid: number; highMid: number; treble: number; energy: number; kick: number };

type LayerDef = { id: string; band: keyof Bands; center: [number, number]; motion: number; phase: number; file: string; rect: [number, number, number, number]; motionType: string };
type Manifest = { aspect: number; layers: LayerDef[] };
type Layer = LayerDef & { tex: WebGLTexture | null; level: number; ready: boolean };

const BG_VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p * .5 + .5; v.y = 1. - v.y; gl_Position = vec4(p, 0., 1.); }`;
const BG_FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D uA, uB; uniform float uT, uZA, uZB, uTime, uBass, uKick, uHas, uGlass; uniform vec2 uRes, uPortal;
// CUTLIGHT on the flat stage: band-driven sway/parallax, a directional kick + RGB split on cuts, a hue jump that eases back
uniform float uFlat, uCut, uHueJ, uRot, uSplit; uniform vec2 uPar;
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec2 cover(vec2 uv){ vec2 q = uv - .5; float ar = uRes.x / uRes.y; if (ar > 1.) q.y /= ar; else q.x *= ar; return q; }
vec3 at(vec2 q){
  vec3 a = texture(uA, clamp(q / uZA + .5, 0., 1.)).rgb, b = texture(uB, clamp(q / uZB + .5, 0., 1.)).rgb;
  return mix(a, b, smoothstep(0., 1., uT));
}
vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }
vec3 dream(vec2 uv){
  vec2 q = cover(uv);
  if (uFlat < .5) return at(q);
  float cr = cos(uRot), sr = sin(uRot);
  q = mat2(cr, -sr, sr, cr) * q * (1. - .02 * uCut) + uPar;
  // depth parallax: bright (near) detail drifts further than dark (far) detail
  float l = dot(at(q), vec3(.299, .587, .114));
  q += uPar * (l - .45) * 1.4;
  vec2 sp = vec2(uSplit, uSplit * .35);
  vec3 c = vec3(at(q + sp).r, at(q).g, at(q - sp).b);
  return hueRot(c, uHueJ);
}
void main(){
  vec2 px = v * uRes; float cell = max(9., uRes.x / 26.); vec2 g = px / cell, ip = floor(g), fp = fract(g);
  float d1 = 9., d2 = 9.; vec2 best = ip;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 nb = vec2(float(i), float(j)); vec2 h = hash2(ip + nb); h = .5 + .4 * sin(uTime * .3 + 6.2831 * h);
    vec2 r = nb + h - fp; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; best = ip + nb + h; } else if (d < d2) d2 = d;
  }
  vec2 pv = (v - uPortal) / vec2(.115, .30); float portal = 1. - smoothstep(.75, 1.15, length(pv));
  float glass = uGlass * mix(1., .22, portal);
  vec3 raw = dream(v), pane = uGlass > 0. ? dream(best * cell / uRes) : raw;
  vec3 col = mix(raw, pane * 1.08 + .02, glass);
  float lum = dot(col, vec3(.299, .587, .114)); col = mix(col, mix(vec3(lum), col, .82) * .72, glass * (1. - portal));
  float edge = sqrt(d2) - sqrt(d1); float lead = 1. - smoothstep(.035, .09, edge);
  col *= 1. - lead * glass * .82;
  col += (1. - lead) * glass * (.05 + .12 * uBass) * vec3(1., .92, .82);
  col += portal * (.10 * uBass + .22 * uKick) * vec3(1., .95, 1.);
  if (uFlat > .5) {
    col *= 1. + uCut * .16 + uBass * .05;
    col *= mix(1., smoothstep(1.2, .3, length((v - .5) * vec2(1.1, 1.3))), .5);
  }
  o = vec4(col * uHas, uHas);
}`;
const L_VS = `#version 300 es
in vec2 p; out vec2 v; uniform mat3 uM; void main(){ v = p; vec3 c = uM * vec3(p, 1.); gl_Position = vec4(c.xy, 0., 1.); }`;
const L_FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o; uniform sampler2D uTex; uniform float uAlpha, uBright, uSat, uHue; uniform vec3 uTint;
vec3 hue(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }
void main(){
  vec4 t = texture(uTex, v); if (t.a < .003) discard;
  vec3 c = t.rgb / max(t.a, 1e-4); c = hue(c, uHue); float l = dot(c, vec3(.299, .587, .114));
  c = mix(vec3(l), c, uSat) * uBright; c = mix(c, c * uTint * 1.6, .16);
  float a = (1. - pow(1. - t.a, 1.7)) * uAlpha; o = vec4(c * a, a);
}`;

function shader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!; gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  return p;
}
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export class CathedralStage {
  private gl: WebGL2RenderingContext;
  private bg: WebGLProgram; private lp: WebGLProgram;
  private quad: WebGLBuffer; private unit: WebGLBuffer;
  private texA: WebGLTexture; private texB: WebGLTexture;
  private layers: Layer[] = []; private aspect = 1672 / 941;
  private has = 0; private tB = 0; private interval = 80; private lastPush = 0;
  private cut = 0; private hueDeg = 0; private prevE = 0;
  private cutDir = 1; private hueJ = 0; private hueKick = 0; private lm = 0.3; private hm = 0.3; private en = 0.4;
  private tint: [number, number, number] = [1, 1, 1];
  private t0 = performance.now();
  frames = 0; drawn = 0; showCathedral = true; scale = 1;
  onRendered: ((c: HTMLCanvasElement) => void) | null = null; // same-task hook (WebGL buffer still valid), used by the clip recorder
  private slow = 0; private lastR = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};

  /** cathedral=false (the default stage): live frames fill the card, blended at display rate, with no cathedral layers, glass or portal. */
  static create(canvas: HTMLCanvasElement, base = "/lantern/cathedral", cathedral = true): CathedralStage | null {
    try {
      const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
      return gl ? new CathedralStage(gl, base, cathedral) : null;
    } catch { return null; }
  }

  private constructor(gl: WebGL2RenderingContext, base: string, cathedral = true) {
    this.gl = gl; this.showCathedral = cathedral;
    this.bg = program(gl, BG_VS, BG_FS); this.lp = program(gl, L_VS, L_FS);
    for (const n of ["uA", "uB", "uT", "uZA", "uZB", "uTime", "uBass", "uKick", "uHas", "uGlass", "uRes", "uPortal", "uFlat", "uCut", "uHueJ", "uRot", "uSplit", "uPar"]) this.u["bg." + n] = gl.getUniformLocation(this.bg, n);
    for (const n of ["uM", "uTex", "uAlpha", "uBright", "uSat", "uHue", "uTint"]) this.u["l." + n] = gl.getUniformLocation(this.lp, n);
    this.quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.unit = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.unit); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.texA = this.makeTex(); this.texB = this.makeTex();
    if (cathedral) void this.load(base);
  }

  private makeTex() {
    const gl = this.gl; const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return t;
  }

  private async load(base: string) {
    try {
      const m = (await (await fetch(`${base}/manifest.json`)).json()) as Manifest;
      this.aspect = m.aspect;
      this.layers = m.layers.map((d) => ({ ...d, tex: null, level: 0, ready: false }));
      await Promise.all(this.layers.map(async (L) => {
        const img = new Image(); img.decoding = "async"; img.src = `${base}/${L.file}`;
        await img.decode();
        const gl = this.gl; L.tex = this.makeTex(); gl.bindTexture(gl.TEXTURE_2D, L.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        L.ready = true;
      }));
    } catch { /* stage still shows the dream frames */ }
  }

  /** A new server frame arrived. */
  push(bmp: ImageBitmap | HTMLImageElement | HTMLCanvasElement) {
    const gl = this.gl, now = performance.now();
    const t = this.texA; this.texA = this.texB; this.texB = t;
    gl.bindTexture(gl.TEXTURE_2D, this.texB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    if (this.lastPush) this.interval = clamp(0.8 * this.interval + 0.2 * (now - this.lastPush), 35, 260);
    this.lastPush = now; this.tB = now; this.frames++;
    this.has = this.frames > 1 ? 1 : this.has;
    // average colour of the dream tints the cathedral glass (tiny readback-free estimate via a 1x1 canvas)
    if (this.frames % 4 === 1) try {
      const c = (this._avg ??= new OffscreenCanvas(1, 1)); const g = c.getContext("2d");
      if (g) { g.drawImage(bmp as CanvasImageSource, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; this.tint = [0.55 + d[0] / 510, 0.55 + d[1] / 510, 0.55 + d[2] / 510]; }
    } catch { /* ignore */ }
  }
  private _avg?: OffscreenCanvas;

  clearDream() { this.has = 0; this.frames = 0; this.lastPush = 0; }

  render(s: Bands) {
    const gl = this.gl, c = gl.canvas as HTMLCanvasElement, now = performance.now(), time = (now - this.t0) / 1000;
    // adaptive resolution: if the display rate sags (weak GPU, software GL), render fewer pixels
    if (this.lastR) { const dt = now - this.lastR; this.slow = dt > 24 ? this.slow + 1 : Math.max(0, this.slow - 1); if (this.slow > 45 && this.scale > 0.5) { this.scale = Math.max(0.5, this.scale * 0.75); this.slow = 0; } }
    this.lastR = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.scale;
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // cut detection (CUTLIGHT): sudden change -> short directional kick + hue jump
    const change = Math.abs(s.energy - this.prevE) * 1.25 + s.kick * 0.6;
    if (change > 0.12 && this.cut < 0.4) { this.cut = 1; this.hueDeg = (this.hueDeg + 47 + Math.round(s.treble * 90)) % 360; }
    // flat stage: only the bigger cuts swing the hue; every cut kicks the frame sideways (alternating)
    if (this.cut === 1) { this.cutDir = -this.cutDir; if (change > 0.3 && this.hueKick < 0.3) { this.hueKick = 1; this.hueJ = (this.cutDir * (25 + s.treble * 40) * Math.PI) / 180; } }
    this.cut *= 0.88; this.hueKick *= 0.965; this.prevE = s.energy;
    this.lm += (s.lowMid - this.lm) * 0.06; this.hm += (s.highMid - this.hm) * 0.06; this.en += (s.energy - this.en) * 0.05;

    // cathedral space -> canvas (cover)
    const car = w / h; let cw = 2, ch = 2;
    if (car > this.aspect) ch = 2 * (car / this.aspect); else cw = 2 * (this.aspect / car);
    const portal = { x: 0.5, y: 0.5 + (0.56 - 0.5) * (ch / 2) };

    if (this.has) {
      const k = clamp((now - this.tB) / this.interval, 0, 1.6);
      gl.useProgram(this.bg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA); gl.uniform1i(this.u["bg.uA"], 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texB); gl.uniform1i(this.u["bg.uB"], 1);
      const flat = !this.showCathedral;
      const push = 0.018 + 0.03 * s.kick + (flat ? 0.02 * this.cut : 0), margin = flat ? 1.09 : 1; // flat: overscan so sway never shows an edge
      gl.uniform1f(this.u["bg.uT"], Math.min(1, k)); gl.uniform1f(this.u["bg.uZA"], margin * (1 + push * (1 + k))); gl.uniform1f(this.u["bg.uZB"], margin * (1 + push * k));
      gl.uniform1f(this.u["bg.uFlat"], flat ? 1 : 0); gl.uniform1f(this.u["bg.uCut"], this.cut);
      gl.uniform1f(this.u["bg.uHueJ"], this.hueJ * this.hueKick); gl.uniform1f(this.u["bg.uSplit"], flat ? this.cut * 0.011 + s.kick * 0.002 : 0);
      gl.uniform1f(this.u["bg.uRot"], flat ? Math.sin(time * 0.23) * (0.005 + 0.014 * this.en) + this.cutDir * this.cut * 0.018 : 0);
      gl.uniform2f(this.u["bg.uPar"], flat ? Math.sin(time * 0.37) * (0.006 + 0.024 * this.lm) + this.cutDir * this.cut * 0.028 : 0, flat ? Math.cos(time * 0.29) * (0.005 + 0.02 * this.hm) - s.bass * 0.008 : 0);
      gl.uniform1f(this.u["bg.uTime"], time); gl.uniform1f(this.u["bg.uBass"], s.bass); gl.uniform1f(this.u["bg.uKick"], s.kick);
      gl.uniform1f(this.u["bg.uHas"], 1); gl.uniform1f(this.u["bg.uGlass"], this.showCathedral ? 0.72 : 0.0);
      gl.uniform2f(this.u["bg.uRes"], w, h); gl.uniform2f(this.u["bg.uPortal"], this.showCathedral ? portal.x : -10, this.showCathedral ? portal.y : -10);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (this.showCathedral && this.layers.length) {
      gl.useProgram(this.lp); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.u["l.uTex"], 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.unit); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const pxW = (cw / 2) * w, pxH = (ch / 2) * h; // cathedral size in device px
      for (const L of this.layers) {
        if (!L.ready || !L.tex) continue;
        const target = clamp((s[L.band] ?? s.energy) * (L.band === "bass" ? 1.15 : 1));
        L.level += (target - L.level) * (target > L.level ? 0.13 : 0.042);
        const r = L.level * 1.25 * L.motion, cut = this.cut;
        const side = L.center[0] < 0.48 ? -1 : L.center[0] > 0.52 ? 1 : 0;
        const drift = Math.sin(time * (0.38 + L.phase * 0.006) + L.phase), cdrift = Math.cos(time * (0.29 + L.phase * 0.004) + L.phase * 0.7);
        let tx = drift * 1.1 * dpr, ty = cdrift * 0.8 * dpr, sx = 1, sy = 1, rot = drift * 0.0012;
        switch (L.motionType) {
          case "open": ty -= r * pxH * 0.018 + cut * pxH * 0.006; sx += r * 0.055 + cut * 0.012; sy -= r * 0.008; break;
          case "lean": tx += side * (r * pxW * 0.014 + cut * pxW * 0.004); ty -= r * pxH * 0.007; rot -= side * (r * 0.02 + cut * 0.006); break;
          case "sweep": tx += side * (r * pxW * 0.032 + cut * pxW * 0.008); ty += drift * r * pxH * 0.008; rot += side * (r * 0.018 + cut * 0.008); break;
          case "lift": tx += drift * r * pxW * 0.006; ty -= r * pxH * 0.034 + cut * pxH * 0.01; sy += r * 0.018; break;
          case "float": tx += cdrift * r * pxW * 0.004; ty -= r * pxH * 0.018 + drift * 2.4 * dpr; rot += drift * 0.004; break;
          case "rise": ty -= r * pxH * 0.04 + cut * pxH * 0.012; sy += r * 0.02; break;
          case "shift": tx += side * (r * pxW * 0.026 + cut * pxW * 0.007); ty += r * pxH * 0.007; rot += side * r * 0.008; break;
          case "depth": tx += side * (r * pxW * 0.042 + cut * pxW * 0.012); ty += r * pxH * 0.026; sx += r * 0.016; sy += r * 0.035; break;
        }
        // unit quad -> layer rect in cathedral space (px, y down) -> rotate/scale about the layer centre -> clip space
        const [rx, ry, rw, rh] = L.rect;
        const ox = (w - pxW) / 2, oy = (h - pxH) / 2;
        const x0 = ox + rx * pxW, y0 = oy + ry * pxH, W = rw * pxW, H = rh * pxH;
        const cx = ox + L.center[0] * pxW + tx, cy = oy + L.center[1] * pxH + ty;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        // p_px = C + R*S*(x0 + p*W - Cx0, ...) where Cx0 is the untranslated centre
        const ux = cx - tx, uy = cy - ty;
        const a = cs * sx * W, b = sn * sx * W, cc = -sn * sy * H, d = cs * sy * H;
        const ex = cx + cs * sx * (x0 - ux) - sn * sy * (y0 - uy), ey = cy + sn * sx * (x0 - ux) + cs * sy * (y0 - uy);
        const m = new Float32Array([a * 2 / w, -b * 2 / h, 0, cc * 2 / w, -d * 2 / h, 0, ex * 2 / w - 1, 1 - ey * 2 / h, 1]);
        gl.uniformMatrix3fv(this.u["l.uM"], false, m);
        gl.bindTexture(gl.TEXTURE_2D, L.tex);
        gl.uniform1f(this.u["l.uAlpha"], clamp(0.86 + r * 0.14)); gl.uniform1f(this.u["l.uBright"], 0.94 + r * 0.22 + cut * 0.1);
        gl.uniform1f(this.u["l.uSat"], 1.04 + r * 0.38); gl.uniform1f(this.u["l.uHue"], ((this.hueDeg + time * 4 + L.phase * 2.1) * Math.PI) / 180);
        gl.uniform3f(this.u["l.uTint"], this.tint[0], this.tint[1], this.tint[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    this.drawn++;
    if (this.onRendered) try { this.onRendered(c); } catch { /* ignore */ }
  }

  dispose() {
    const gl = this.gl;
    for (const L of this.layers) if (L.tex) gl.deleteTexture(L.tex);
    gl.deleteTexture(this.texA); gl.deleteTexture(this.texB);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** Bands for the stage: real analyser when the Web Audio graph is live, else server frame hints, else a gentle synthetic pulse. */
export function bandsFrom(analyser: AnalyserNode | null, buf: { data: Uint8Array<ArrayBuffer> }, hint: { e: number; b: number; k: number; at: number }, now: number): Bands {
  if (analyser) {
    if (buf.data.length !== analyser.frequencyBinCount) buf.data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf.data);
    const n = buf.data.length, avg = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += buf.data[i]; return s / Math.max(1, b - a) / 255; };
    const bass = avg(0, Math.ceil(n * 0.12)), lowMid = avg(Math.ceil(n * 0.12), Math.ceil(n * 0.32)), highMid = avg(Math.ceil(n * 0.32), Math.ceil(n * 0.62)), treble = avg(Math.ceil(n * 0.62), n);
    if (bass + lowMid + highMid > 0.02) {
      const energy = clamp((bass * 1.45 + lowMid + highMid * 0.8 + treble * 0.55) / 3.3);
      const kick = clamp(Math.max(hint.k * Math.exp(-(now - hint.at) / 300), (bass - 0.55) * 2.2));
      return { bass, lowMid, highMid, treble, energy, kick };
    }
  }
  const t = now / 1000, age = (now - hint.at) / 1000, fresh = hint.at && age < 1.5;
  const e = fresh ? hint.e : 0.45 + 0.2 * Math.sin(t * 0.4), b = fresh ? hint.b : Math.pow(Math.max(0, Math.sin(t * 2.15)), 7);
  const kick = fresh ? hint.k * Math.exp(-age * 5) : b * 0.6;
  return { bass: clamp(b * 0.85 + kick * 0.3), lowMid: clamp(0.3 + e * 0.5), highMid: clamp(0.25 + e * 0.45 + 0.1 * Math.sin(t * 0.73)), treble: clamp(0.2 + e * 0.4 + 0.1 * Math.sin(t * 4.6)), energy: e, kick };
}
