import { createHash, timingSafeEqual } from "node:crypto";

// Server-only gate for Lantern hooks that can spend paid cloud GPU time on demand.
// Callers send the token in the x-lantern-admin-token header. With LANTERN_ADMIN_TOKEN unset, the hooks stay off.
export const LANTERN_ADMIN_HEADER = "x-lantern-admin-token";

const digest = (v: string) => createHash("sha256").update(v).digest();

export function isLanternAdmin(req: Request): boolean {
  const want = process.env.LANTERN_ADMIN_TOKEN;
  const got = req.headers.get(LANTERN_ADMIN_HEADER);
  if (!want || !got) return false;
  return timingSafeEqual(digest(got), digest(want));
}
