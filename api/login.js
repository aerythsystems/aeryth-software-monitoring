import { guard, readBody, safeEq, signSession, cookie, send, route, ip, SESSION_TTL } from "./_lib.js";
import { log } from "./_store.js";
export default route(async (req, res) => {
  if (!guard(req, res, "POST")) return;
  const b = await readBody(req);
  if (!b || typeof b.username !== "string" || typeof b.password !== "string" || b.username.length > 200 || b.password.length > 200)
    return send(res, 400, { error: "Input tidak valid" });
  const u = safeEq(b.username, process.env.ADMIN_USERNAME);
  const p = safeEq(b.password, process.env.ADMIN_PASSWORD);
  if (!(u && p)) { await log("WARN", "auth", "Login gagal", { ip: ip(req) }); return send(res, 401, { error: "Username atau password salah" }); }
  await log("INFO", "auth", `Login berhasil: ${process.env.ADMIN_USERNAME}`, { ip: ip(req) });
  send(res, 200, { user: process.env.ADMIN_USERNAME }, { "set-cookie": cookie(req, signSession(process.env.ADMIN_USERNAME), SESSION_TTL) });
});
