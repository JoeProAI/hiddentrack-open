import { createHmac, randomUUID } from "node:crypto";
import { tracks, songId } from "@/lib/fresh-cuts";
import { isLanternAdmin } from "@/lib/lantern-admin";

// Lantern Slide LIVE: mint a short-lived signed ticket for the GPU frame server.
// AUTO (default): 5080 when free, Modal when the 5080 is busy, back to the 5080 if Modal is capped or down.
// Live frames always run. The client shader is only a crash guard when BOTH backends are unreachable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TOKEN_TTL_S = 90;
const PROBE_MS = 1500;
// Modal A10 scales to zero; a cold start (snapshot restore + queue) can take 10-40 s. The /health probe wakes it.
// We wait up to CLOUD_PROBE_MS, and if it is still warming we answer reason:"warming" so the client retries
// (it never parks on the shader for a cold start).
const CLOUD_PROBE_MS = 22000;
const hits = new Map<string, number[]>();

type Backend = "auto" | "5080" | "cloud" | "off";
type Health = { ok?: boolean; free?: number; busy?: boolean; util?: number; viewers?: number; reason?: string };

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 12;
}

function backend(): Backend {
  const v = (process.env.LANTERN_BACKEND || "auto").toLowerCase();
  if (v === "5080" || v === "cloud" || v === "off" || v === "auto") return v;
  return "auto";
}

function cloudCfg() {
  const enabled = process.env.LANTERN_CLOUD_ENABLED === "1";
  const ws = process.env.LANTERN_CLOUD_WS_URL?.replace(/\/+$/, "");
  const secret = process.env.LANTERN_CLOUD_SECRET;
  if (!enabled || !ws || !secret || !/^wss:\/\//.test(ws)) return null;
  return { ws, secret };
}

async function probe(wsBase: string, ms = PROBE_MS): Promise<Health | null> {
  try {
    const r = await fetch(`${wsBase.replace(/^wss/, "https")}/health`, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return (await r.json()) as Health;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const mode = backend();
  if (mode === "off") return json({ live: false, reason: "off" });

  const wsBase = process.env.LANTERN_WS_URL?.replace(/\/+$/, "");
  const secret = process.env.LANTERN_SECRET;
  const pcReady = !!(wsBase && secret && /^wss:\/\//.test(wsBase));
  const cloud = cloudCfg();

  const q = new URL(req.url).searchParams;
  const local = q.get("mode") === "local";
  const id = local ? "local" : q.get("song") ?? "";
  const track = local ? { title: "", lane: "", hook: "" } : tracks.find((t) => songId(t.href) === id);
  if (!track) return json({ live: false, reason: "unknown" }, 404);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (limited(ip)) return json({ live: false, reason: "rate" }, 429);

  // force=busy is an admin smoke hook: pretend the 5080 is busy so AUTO routes to Modal (prod check).
  // It only applies with a valid LANTERN_ADMIN_TOKEN header; public callers get normal AUTO routing.
  const forceBusy = q.get("force") === "busy" && isLanternAdmin(req);

  const mint = (base: string, key: string, via: "5080" | "cloud") => {
    const payload = {
      sid: randomUUID(),
      song: id,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
      title: track.title.slice(0, 80),
      lane: track.lane.slice(0, 60),
      hook: track.hook.slice(0, 400),
    };
    const body = b64(JSON.stringify(payload));
    const sig = createHmac("sha256", key).update(body).digest("base64url");
    return json({ live: true, ws: `${base}/ws?token=${body}.${sig}`, exp: payload.exp, via, cloud: via === "cloud" || undefined });
  };

  const tryPc = async (evenIfBusy: boolean) => {
    if (!pcReady) return null;
    const h = await probe(wsBase!);
    if (!h?.ok) return null;
    const busy = forceBusy || !!h.busy;
    if (busy && !evenIfBusy) return { busy: true as const, health: h };
    if (!h.free && !evenIfBusy) return { busy: true as const, health: h };
    // evenIfBusy: still need a free slot, or the client gets "busy" from the socket
    if (!h.free) return { busy: true as const, health: h };
    return { ticket: mint(wsBase!, secret!, "5080"), health: h };
  };

  let cloudWake: Promise<Health | null> | null = null;
  const wakeCloud = () => (cloudWake ??= cloud ? probe(cloud.ws, CLOUD_PROBE_MS) : Promise.resolve(null));
  const warming = () => json({ live: false, reason: "warming", retryMs: 2500 });

  const tryCloud = async () => {
    if (!cloud) return null;
    const h = await wakeCloud();
    if (!h?.ok) return null;
    // free===0 means capped or full; treat as unavailable so AUTO falls back to the 5080
    if (!h.free) return null;
    return mint(cloud.ws, cloud.secret, "cloud");
  };

  if (mode === "5080") {
    const r = await tryPc(true);
    if (r && "ticket" in r && r.ticket) return r.ticket;
    return json({ live: false, reason: "down" }); // crash guard only
  }

  if (mode === "cloud") {
    const t = await tryCloud();
    if (t) return t;
    // never-down: fall back to the 5080 even if busy
    const r = await tryPc(true);
    if (r && "ticket" in r && r.ticket) return r.ticket;
    return cloud ? warming() : json({ live: false, reason: "down" });
  }

  // AUTO: free 5080 first, then Modal, then busy 5080. Modal is woken in parallel so a cold start overlaps the PC probe.
  wakeCloud();
  const pc = await tryPc(false);
  if (pc && "ticket" in pc && pc.ticket) return pc.ticket;
  const cloudTicket = await tryCloud();
  if (cloudTicket) return cloudTicket;
  const forced = await tryPc(true);
  if (forced && "ticket" in forced && forced.ticket) return forced.ticket;
  return cloud ? warming() : json({ live: false, reason: "down" });
}
