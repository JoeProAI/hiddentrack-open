"use client";

// Audio-reactive "Black Sun" visual shared by the site hero, the dock and the
// X card player. Scene grammar is borrowed from Signal Theater (the browser
// engine that sits beside VZX in Signal Vault): the Black Sun corona, the
// mirrored Neon Rift blades and frame-trail persistence, rebuilt here as one
// WebGL fragment shader with a Canvas 2D fallback.
//
// Performance rules: lazy init after mount, render scale under 1x on phones,
// DPR capped, loop paused offscreen and in hidden tabs, one static frame when
// the visitor prefers reduced motion, and WebGL context loss falls back to 2D.

import { useEffect, useRef } from "react";
import { BINS, SignalEngine, type Signal } from "@/lib/signal-engine";
import { finish, makeScene2D, type SceneId } from "@/lib/scenes";

type Props = {
  getAnalyser: () => AnalyserNode | null;
  playing: boolean;
  className?: string;
  /** sun position in 0..1 of the canvas, y measured from the top */
  center?: [number, number];
  /** sun position used on narrow (portrait phone) canvases */
  centerNarrow?: [number, number];
  /** sun radius multiplier */
  size?: number;
  /** internal resolution multiplier (lower = cheaper + grittier) */
  quality?: number;
  onFrame?: (s: Signal) => void;
  label?: string;
  /** channel; Black Sun runs on WebGL, everything else on Canvas 2D */
  scene?: SceneId;
};

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision mediump float;
uniform vec2 uRes;uniform vec2 uCenter;uniform float uTime,uBass,uLow,uHigh,uTreb,uEnergy,uTrans,uGlow,uSize;
uniform sampler2D uSpec;
const vec3 INK=vec3(.035,.031,.031);
const vec3 ACID=vec3(.957,.843,.094);
const vec3 HOT=vec3(.894,.239,.184);
const vec3 ICE=vec3(.247,.663,1.);
float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float spec(float m){return texture2D(uSpec,vec2(clamp(m,.005,.995),.5)).r;}
vec3 scene(vec2 uv){
  float r=length(uv);float a=atan(uv.y,uv.x);
  float m=abs(a)/3.14159;
  float sunR=(.15+uBass*.075)*uSize;
  float blades=72.;
  float bm=floor(m*blades)/blades;
  float s=spec(bm);
  float fa=fract(m*blades);
  float w=.22+.2*s;
  float blade=smoothstep(w,w-.12,abs(fa-.5));
  float L=sunR*1.08+(.04+s*s*.95*(.6+uEnergy*.9))*uSize;
  float along=clamp((r-sunR)/(L-sunR+1e-3),0.,1.);
  float ray=blade*step(sunR*1.04,r)*smoothstep(L,L-.025,r)*(1.-along*.55);
  vec3 rc=mix(ACID,HOT,smoothstep(.45,.95,s));
  rc=mix(rc,ICE,smoothstep(.62,.9,m)*uTreb*1.4);
  vec3 c=rc*ray*(.55+s*.9);
  float ring=exp(-abs(r-sunR)*(55.-uBass*25.))*(.35+uBass*1.4);
  c+=HOT*ring+ACID*ring*uTrans*.8;
  float sonar=smoothstep(.0,.9,sin(r*28.-uTime*5.))*exp(-r*1.4)*uGlow*.55*step(sunR,r);
  c+=mix(HOT,ACID,.4)*sonar*.35;
  float disk=smoothstep(sunR*.96,sunR*.9,r);
  c=mix(c,INK*.4+HOT*.04*uLow,disk);
  return c;
}
void main(){
  vec2 fc=gl_FragCoord.xy;
  float mn=min(uRes.x,uRes.y);
  vec2 uv=(fc-uCenter*uRes)/mn;
  float band=floor(fc.y/(uRes.y/36.));
  float tear=step(.9-uTrans*.45,h(vec2(band,floor(uTime*14.))));
  uv.x+=tear*(h(vec2(band*3.1,floor(uTime*21.)))-.5)*.16*uTrans;
  float ab=.004+uTrans*.018;
  vec3 c=vec3(scene(uv+vec2(ab,0.)).r,scene(uv).g,scene(uv-vec2(ab,0.)).b);
  float r=length(uv);
  vec3 bg=INK+HOT*.20*uBass*smoothstep(1.3,.0,r)+ACID*.035*uHigh*smoothstep(.2,1.4,r);
  c+=bg;
  c*=.84+.16*sin(fc.y*1.9);
  c+=(h(fc+fract(uTime)*91.)-.5)*.09;
  c*=1.-smoothstep(.55,1.6,length((fc/uRes-.5)*vec2(1.6,1.)))*.7;
  gl_FragColor=vec4(c,1.);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

type Renderer = { draw: (s: Signal, t: number) => void; resize: (w: number, h: number) => void; dispose: () => void };

function makeGL(canvas: HTMLCanvasElement, center: [number, number], size: number): Renderer | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
  } catch { gl = null; }
  if (!gl) return null;
  try {
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const bytes = new Uint8Array(BINS);
    const U = (n: string) => gl!.getUniformLocation(prog, n);
    const u = { res: U("uRes"), center: U("uCenter"), time: U("uTime"), bass: U("uBass"), low: U("uLow"), high: U("uHigh"), treb: U("uTreb"), energy: U("uEnergy"), trans: U("uTrans"), glow: U("uGlow"), size: U("uSize"), spec: U("uSpec") };
    gl.uniform1i(u.spec, 0);
    return {
      resize(w, h) { gl!.viewport(0, 0, w, h); gl!.uniform2f(u.res, w, h); gl!.uniform2f(u.center, center[0], 1 - center[1]); gl!.uniform1f(u.size, size); },
      draw(s, t) {
        const g = gl!;
        for (let i = 0; i < BINS; i++) bytes[i] = Math.min(255, s.spectrum[i] * 255);
        g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, BINS, 1, 0, g.LUMINANCE, g.UNSIGNED_BYTE, bytes);
        g.uniform1f(u.time, t); g.uniform1f(u.bass, s.bass); g.uniform1f(u.low, s.lowMid); g.uniform1f(u.high, s.highMid);
        g.uniform1f(u.treb, s.treble); g.uniform1f(u.energy, s.energy); g.uniform1f(u.trans, s.transient); g.uniform1f(u.glow, s.afterglow);
        g.drawArrays(g.TRIANGLES, 0, 3);
      },
      dispose() { gl!.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
  } catch {
    return null;
  }
}

// Canvas 2D path: every non-WebGL channel, and the Black Sun fallback.
function make2D(canvas: HTMLCanvasElement, scene: SceneId, center: [number, number], size: number, onReady: () => void): Renderer | null {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const sc = makeScene2D(scene, center, size);
  const cache: { grain?: HTMLCanvasElement } = {};
  let W = 1, H = 1;
  let waiting = !!sc.ready && !sc.ready();
  return {
    resize(w, h) { W = w; H = h; ctx.fillStyle = "#090808"; ctx.fillRect(0, 0, w, h); },
    draw(s, t) {
      sc.draw(ctx, W, H, s, t);
      finish(ctx, W, H, s, t, cache);
      // plate rigs: images decode after boot, so make sure a still frame repaints once they land
      if (waiting && sc.ready?.()) { waiting = false; onReady(); }
      else if (waiting) setTimeout(onReady, 120);
    },
    dispose() { sc.dispose?.(); },
  };
}

export default function SignalCanvas({ scene = "black-sun", ...rest }: Props) {
  // a canvas that ever held a WebGL context can never draw 2D, so each channel gets a fresh element
  return <SceneCanvas key={scene} scene={scene} {...rest} />;
}

function SceneCanvas({ getAnalyser, playing, className, center: centerWide = [0.5, 0.5], centerNarrow, size = 1, quality = 1, onFrame, label, scene }: Props & { scene: SceneId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ getAnalyser, playing, onFrame });
  const kickRef = useRef<() => void>(() => {});
  useEffect(() => { live.current = { getAnalyser, playing, onFrame }; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const engine = new SignalEngine();
    let renderer: Renderer | null = null;
    let raf = 0;
    let visible = true;
    let disposed = false;
    const t0 = performance.now();
    const center: [number, number] = centerNarrow && canvas.clientWidth < 600 ? centerNarrow : centerWide;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const sizeIt = () => {
      if (!renderer) return;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
      const scale = dpr * quality * (coarse ? 0.7 : 1);
      const w = Math.max(2, Math.round(canvas.clientWidth * scale));
      const h = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      renderer.resize(w, h);
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !renderer) return;
      const s = engine.sample(live.current.getAnalyser(), live.current.playing, reduce ? 4200 : now);
      if (reduce) { s.transient = 0; s.afterglow = 0; }
      renderer.draw(s, reduce ? 4.2 : (now - t0) / 1000);
      live.current.onFrame?.(s);
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && !disposed) raf = requestAnimationFrame(frame); };
    kickRef.current = kick;

    const boot = () => {
      if (disposed) return;
      // Probe WebGL on a throwaway canvas so a failed compile never locks the real one out of 2D.
      const forced = new URLSearchParams(window.location.search).get("viz");
      const wantGL = scene === "black-sun" && forced !== "2d";
      const probe = wantGL ? makeGL(document.createElement("canvas"), center, size) : null;
      probe?.dispose();
      renderer = probe ? makeGL(canvas, center, size) : null;
      canvas.dataset.engine = renderer ? "webgl" : "2d";
      canvas.dataset.scene = scene;
      if (!renderer) renderer = make2D(canvas, scene, center, size, () => kick());
      if (!renderer) canvas.dataset.engine = "none";
      sizeIt();
      kick();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      // swap to a fresh canvas-free 2D path on the same element is not allowed once a GL context exists,
      // so stop drawing and let CSS show the static poster underneath.
      renderer = null;
      canvas.dataset.engine = "lost";
    };
    canvas.addEventListener("webglcontextlost", onLost);
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
    const bootHandle = idle ? idle(boot, { timeout: 600 }) : window.setTimeout(boot, 60);

    const ro = new ResizeObserver(() => { sizeIt(); kick(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
    io.observe(canvas);
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (!idle) window.clearTimeout(bootHandle);
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      renderer?.dispose();
    };
    // center/size/quality are mount-time settings
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reduced motion draws one frame; redraw it when play state flips
  useEffect(() => { kickRef.current(); }, [playing]);

  return <canvas ref={ref} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
