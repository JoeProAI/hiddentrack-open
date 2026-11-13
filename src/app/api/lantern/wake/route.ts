import { after } from "next/server";
import { isLanternAdmin } from "@/lib/lantern-admin";

// Lantern Slide LIVE: early wake. Boots a scaled-to-zero Modal GPU before anyone presses play. Answers right away; the
// /health probe that wakes Modal keeps running after the response. No tickets, no state change.
// Admin only (LANTERN_ADMIN_TOKEN header). Public pings get wake:"skip"; visitor sessions still wake Modal on demand
// through /api/lantern/session when the 5080 is busy, and the client keeps retrying while it warms.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROBE_MS = 1500;
const CLOUD_WAKE_MS = 25000; // a cold start can take 10-40 s; holding the probe open makes sure Modal finishes booting
const QUICK_MS = 700; // if Modal is already warm, say so in the response
const WARM_TTL_MS = 30_000; // Modal answered recently: skip new probes on this instance
const hits = new Map<string, number[]>();

type Health = { ok?: boolean; free?: number; busy?: boolean };
type WakeState = { inflight: Promise<boolean> | null; warmAt: number };
declare global {
  var __lanternWake: WakeState | undefined;
}
const state: WakeState = (globalThis.__lanternWake ??= { inflight: null, warmAt: 0 });

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6;
}

async function probe(wsBase: string, ms: number): Promise<Health | null> {
  try {
    const r = await fetch(`${wsBase.replace(/^wss/, "https")}/health`, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return (await r.json()) as Health;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const mode = (process.env.LANTERN_BACKEND || "auto").toLowerCase();
  const ws = process.env.LANTERN_CLOUD_WS_URL?.replace(/\/+$/, "");
  const cloudOn = process.env.LANTERN_CLOUD_ENABLED === "1" && !!ws && /^wss:\/\//.test(ws) && !!process.env.LANTERN_CLOUD_SECRET;
  if (mode === "off" || mode === "5080" || !cloudOn || !isLanternAdmin(req)) return json({ ok: true, wake: "skip" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (limited(ip)) return json({ ok: false, wake: "rate" }, 429);

  if (Date.now() - state.warmAt < WARM_TTL_MS) return json({ ok: true, wake: "warm" });
  if (state.inflight) return json({ ok: true, wake: "waking" });

  const run = (async () => {
    // AUTO: if the 5080 is up and free, sessions go there, so don't spin up Modal for nothing.
    if (mode === "auto") {
      const pcWs = process.env.LANTERN_WS_URL?.replace(/\/+$/, "");
      if (pcWs && /^wss:\/\//.test(pcWs)) {
        const pc = await probe(pcWs, PROBE_MS);
        if (pc?.ok && !pc.busy && pc.free) return true;
      }
    }
    const h = await probe(ws!, CLOUD_WAKE_MS);
    if (h?.ok) state.warmAt = Date.now();
    return !!h?.ok;
  })().finally(() => { state.inflight = null; });
  state.inflight = run;

  const quick = await Promise.race([run, new Promise<null>((res) => setTimeout(() => res(null), QUICK_MS))]);
  if (quick === null) after(() => run.then(() => undefined));
  return json({ ok: true, wake: quick ? "warm" : "waking" });
}
