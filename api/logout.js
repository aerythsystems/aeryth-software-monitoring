import { cookie, send, route } from "./_lib.js";
export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  send(res, 200, { ok: true }, { "set-cookie": cookie(req, "", 0) });
});
