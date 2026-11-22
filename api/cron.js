import { PRODUCTS, route, safeEq, send } from "./_lib.js";
import { checkWeb, checkHeartbeat, checkNodes } from "./_monitor.js";
import { get, set } from "./_store.js";
// Dipicu cron-job.org: Authorization: Bearer <CRON_SECRET> (atau ?key=)
export default route(async (req, res) => {
  const sec = process.env.CRON_SECRET;
  if (!sec || sec.length < 16 || !process.env.SESSION_SECRET) return send(res, 503, { error: "CRON_SECRET belum dikonfigurasi" });
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const key = m ? m[1] : new URL(req.url, "http://x").searchParams.get("key") || "";
  if (!safeEq(key, sec)) return send(res, 401, { error: "Unauthorized" });
  const result = await Promise.all(PRODUCTS.map(async (p) => ({ id: p.id, ...(p.kind === "web" ? await checkWeb(p) : await checkHeartbeat(p)) })));
  const nodes = await checkNodes();
  // Statistik uptime: total, tren respons, dan bucket harian (WIB) untuk strip 14/30 hari
  const st = JSON.parse((await get("stats")) || "{}");
  const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  for (const r of result) {
    if (!r.status) continue;
    const s = (st[r.id] ||= { n: 0, ok: 0, ms: 0, since: Date.now() });
    s.n++;
    if (r.status === "online") { s.ok++; s.ms += r.ms; }
    s.h = [...(s.h || []), r.status === "online" ? Math.max(1, r.ms) : 0].slice(-12);
    s.d ||= {};
    s.d[day] ||= { n: 0, ok: 0 };
    s.d[day].n++;
    if (r.status === "online") s.d[day].ok++;
    for (const k of Object.keys(s.d).sort().slice(0, -45)) delete s.d[k];
  }
  st._cron = Date.now();
  await set("stats", JSON.stringify(st));
  send(res, 200, { ok: true, result, nodes });
});
