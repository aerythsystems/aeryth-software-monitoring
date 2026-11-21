import { PRODUCTS, route, safeEq, send } from "./_lib.js";
import { checkWeb, checkHeartbeat } from "./_monitor.js";
// Dipicu cron-job.org: Authorization: Bearer <CRON_SECRET> (atau ?key=)
export default route(async (req, res) => {
  const sec = process.env.CRON_SECRET;
  if (!sec || sec.length < 16 || !process.env.SESSION_SECRET) return send(res, 503, { error: "CRON_SECRET belum dikonfigurasi" });
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const key = m ? m[1] : new URL(req.url, "http://x").searchParams.get("key") || "";
  if (!safeEq(key, sec)) return send(res, 401, { error: "Unauthorized" });
  const result = await Promise.all(PRODUCTS.map(async (p) => ({ id: p.id, ...(p.kind === "web" ? await checkWeb(p) : await checkHeartbeat(p)) })));
  send(res, 200, { ok: true, result });
});
