// Web Audio helpers for Fresh Cuts players.
// createMediaElementSource permanently disconnects an <audio> element from the
// speakers. Inside cross-origin iframes (X player cards) AudioContext often
// starts suspended, which yields silent playback with a moving scrubber.
// Only wire MediaElementSource after the context is running; otherwise leave
// the element on its default output and use a fake visualizer.

export type GraphRefs = {
  ctxRef: { current: AudioContext | null };
  analyserRef: { current: AnalyserNode | null };
  wiredRef: { current: boolean };
};

function AudioCtx(): typeof AudioContext {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  );
}

/** Unmute and restore volume so element playback is always audible. */
export function ensureAudible(audio: HTMLAudioElement) {
  audio.muted = false;
  if (audio.volume < 0.05) audio.volume = 1;
}

/**
 * On a user gesture: resume (or create) AudioContext, and only then route the
 * element through an analyser. Returns true when live analyser data is available.
 * Returns false when the element should play directly (fake viz).
 */
export async function ensureRunningGraph(
  audio: HTMLAudioElement,
  refs: GraphRefs,
): Promise<boolean> {
  ensureAudible(audio);

  try {
    let ctx = refs.ctxRef.current;
    if (!ctx) {
      ctx = new (AudioCtx())();
      refs.ctxRef.current = ctx;
    }

    // Kick resume in the gesture turn before any further await work.
    const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    await resume;

    if (ctx.state !== "running") {
      // Do not call createMediaElementSource while suspended.
      return false;
    }

    if (!refs.wiredRef.current) {
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      refs.analyserRef.current = analyser;
      refs.wiredRef.current = true;
    }

    return true;
  } catch {
    // CORS or graph failure: keep default element output.
    refs.analyserRef.current = null;
    return false;
  }
}

/** True only when analyser bins reflect real playback audio. */
export function graphIsLive(
  ctx: AudioContext | null,
  analyser: AnalyserNode | null,
): boolean {
  return !!analyser && !!ctx && ctx.state === "running";
}
