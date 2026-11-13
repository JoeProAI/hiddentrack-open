import { createHmac, timingSafeEqual } from "node:crypto";

// Optional PC heartbeat mirror. The session route prefers /health on the tunnel;
// this endpoint lets the tray app push a signed status the site can read for dashboards.
// Body: { busy, util, viewers, at, ... } + header X-Lantern-Sig = hex(hmac_sha256(body, LANTERN_SECRET))
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = { busy: boolean; util: number; viewers: number; at: number; note?: string };
declare global {
  var __lanternPc: Status | undefined;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const s = globalThis.__lanternPc;
  if (!s || Date.now() / 1000 - s.at > 45) return json({ ok: false, stale: true });
  return json({ ok: true, ...s });
}

export async function POST(req: Request) {
  const secret = process.env.LANTERN_SECRET;
  if (!secret) return json({ ok: false, reason: "off" }, 503);
  const raw = await req.text();
  const sig = req.headers.get("x-lantern-sig") || "";
  const expect = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
      return json({ ok: false, reason: "sig" }, 401);
    }
  } catch {
    return json({ ok: false, reason: "sig" }, 401);
  }
  let body: Partial<Status>;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, reason: "json" }, 400); }
  globalThis.__lanternPc = {
    busy: !!body.busy,
    util: Number(body.util) || 0,
    viewers: Number(body.viewers) || 0,
    at: Math.floor(Date.now() / 1000),
    note: typeof body.note === "string" ? body.note.slice(0, 120) : undefined,
  };
  return json({ ok: true });
}
