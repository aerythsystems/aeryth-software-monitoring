import { guard, auth, send, route, readBody } from "./_lib.js";
import { range, del, log } from "./_store.js";
export default route(async (req, res) => {
  if (!guard(req, res, req.method === "POST" ? "POST" : "GET") || !auth(req, res)) return;
  if (req.method === "POST") {
    const b = await readBody(req);
    if (b?.action !== "clear") return send(res, 400, { error: "Aksi tidak valid" });
    await del("logs");
    await log("INFO", "system", "Log dibersihkan oleh administrator");
    return send(res, 200, { ok: true });
  }
  const limit = Math.min(Math.max(Number(new URL(req.url, "http://x").searchParams.get("limit")) || 100, 1), 500);
  send(res, 200, { logs: (await range("logs", limit)).map((x) => JSON.parse(x)) });
});
