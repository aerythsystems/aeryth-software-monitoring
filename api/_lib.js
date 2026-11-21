import { createHmac, timingSafeEqual } from "node:crypto";
import { log } from "./_store.js";

export const PRODUCTS = [
  { id: "nmc-academy", name: "NMC Academy", kind: "web", url: "https://nmcacademy.vercel.app/" },
  { id: "trebee", name: "Trebee", kind: "web", url: "https://trebee.vercel.app/" },
  { id: "aeryth-prompt", name: "Aeryth Prompt", kind: "web", url: "https://aerythprompt.vercel.app/" },
  { id: "aeryth-systems", name: "Aeryth Systems", kind: "web", url: "https://aerythsystems.vercel.app/" },
  { id: "absensi", name: "Absensi Aeryth Systems", kind: "web", url: "https://absensiaerythsystems.vercel.app/" },
  { id: "prospector-ai", name: "Aeryth Prospector AI", kind: "desktop" },
];

const TTL = 8 * 3600;
const mac = (v) => createHmac("sha256", process.env.SESSION_SECRET).update(v).digest();

export const send = (res, status, data, headers = {}) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
};
export const safeEq = (a, b) => timingSafeEqual(mac(a), mac(b));
export const signSession = (user) => {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + TTL })).toString("base64url");
  return body + "." + mac(body).toString("base64url");
};
export function readSession(req) {
  const m = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  try {
    const a = Buffer.from(sig, "base64url"), b = mac(body);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof p.u === "string" && p.exp > Date.now() / 1000 ? p.u : null;
  } catch { return null; }
}
export const cookie = (req, v, maxAge) =>
  `session=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}` + (req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "");
export const SESSION_TTL = TTL;

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
    return req.body;
  }
  let s = "";
  for await (const c of req) s += c;
  try { return JSON.parse(s); } catch { return null; }
}
export function guard(req, res, method) {
  if (req.method !== method) { send(res, 405, { error: "Method not allowed" }); return false; }
  const { ADMIN_USERNAME: u, ADMIN_PASSWORD: p, SESSION_SECRET: s } = process.env;
  if (!u || !p || !s || s.length < 32) { send(res, 500, { error: "Server belum dikonfigurasi: isi environment variables" }); return false; }
  const o = req.headers.origin;
  if (method !== "GET" && o && process.env.VERCEL) {
    let ok = false;
    try { ok = new URL(o).host === req.headers.host; } catch { /* abaikan */ }
    if (!ok) { send(res, 403, { error: "Forbidden" }); return false; }
  }
  return true;
}
export function auth(req, res) {
  const u = readSession(req);
  if (!u) send(res, 401, { error: "Unauthorized" });
  return u;
}

export const HB_TTL = 90_000; // heartbeat dianggap online jika < 90 detik
export const ip = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "-";
export const route = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    await log("FATAL", "api", `Unhandled error di ${req.url}: ${e?.message || e}`);
    if (!res.writableEnded) send(res, 500, { error: "Internal server error" });
  }
};
