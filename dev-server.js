// Server API lokal (hanya untuk dev). Di Vercel, folder api/ dijalankan otomatis.
import http from "node:http";
const routes = ["login", "logout", "session", "products", "check", "heartbeat", "logs", "cron", "telegram", "agent", "nodes"];
http.createServer(async (req, res) => {
  const n = new URL(req.url, "http://x").pathname.replace(/^\/api\//, "");
  if (!routes.includes(n)) { res.statusCode = 404; return res.end("{}"); }
  (await import(`./api/${n}.js`)).default(req, res);
}).listen(3001, () => console.log("API dev di :3001"));
