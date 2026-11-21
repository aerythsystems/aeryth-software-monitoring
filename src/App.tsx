import { useCallback, useEffect, useState } from "react";

type HB = { state: "online" | "offline" | "not_connected"; at: number | null; ageMs: number | null; version?: string };
type Product = { id: string; name: string; kind: "web" | "desktop"; url?: string; hb?: HB };
type Check = { status: "online" | "offline"; code: number | null; ms: number; at: number; error?: string };
type Hist = Record<string, Check[]>;
type Status = "online" | "offline" | "unknown" | "not_connected";
const LEVELS = ["INFO", "WARN", "ERROR", "FATAL"] as const;
type Level = (typeof LEVELS)[number];
type Log = { t: number; level: Level; source: string; message: string; ip?: string };

const LABEL: Record<Status, string> = { online: "Online", offline: "Offline", unknown: "Unknown", not_connected: "Not Connected" };
const INTERVAL = 60_000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  return data as T;
}
const fmtTime = (t?: number | null) => (t ? new Date(t).toLocaleTimeString("id-ID") : "—");
const fmtDate = (t: number) => new Date(t).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" });
const fmtAge = (ms?: number | null) => (ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)} dtk lalu` : `${Math.round(ms / 60_000)} mnt lalu`);

function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "/");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return h;
}

const Badge = ({ s }: { s: Status }) => <span className={`badge ${s}`}><i />{LABEL[s]}</span>;
const Lvl = ({ l }: { l: Level }) => <span className={`lvl ${l}`}>{l}</span>;

function Login({ onLogin }: { onLogin: (u: string) => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { onLogin((await api<{ user: string }>("/api/login", { username: u, password: p })).user); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <span className="logo big">A</span>
        <h1>Aeryth Software Monitor</h1>
        <p className="mute">Masuk sebagai administrator.</p>
        <label>Username<input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button>
      </form>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [persistent, setPersistent] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [lf, setLf] = useState<Level | "ALL">("ALL");
  const [hist, setHist] = useState<Hist>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);

  const unauth = (e: unknown) => { if ((e as Error).message === "Unauthorized") setUser(null); };
  useEffect(() => { api<{ user: string }>("/api/session").then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);

  const loadProducts = useCallback(async (): Promise<Product[]> => {
    try {
      const r = await api<{ products: Product[]; persistent: boolean }>("/api/products");
      setProducts(r.products); setPersistent(r.persistent);
      return r.products;
    } catch (e) { unauth(e); return []; }
  }, []);
  const loadLogs = useCallback(async () => {
    try { setLogs((await api<{ logs: Log[] }>("/api/logs?limit=200")).logs); } catch (e) { unauth(e); }
  }, []);
  const checkOne = useCallback(async (id: string) => {
    setBusy((b) => new Set(b).add(id));
    try {
      const c = await api<Check>("/api/check", { id });
      setHist((h) => ({ ...h, [id]: [c, ...(h[id] || [])].slice(0, 50) }));
    } catch (e) { unauth(e); }
    setBusy((b) => { const n = new Set(b); n.delete(id); return n; });
  }, []);
  const cycle = useCallback(async () => {
    setLoading(true);
    const list = await loadProducts();
    await Promise.all(list.filter((p) => p.kind === "web").map((p) => checkOne(p.id)));
    await loadLogs();
    setLoading(false);
  }, [loadProducts, checkOne, loadLogs]);

  useEffect(() => {
    if (!user) return;
    if (!auto) { loadProducts(); loadLogs(); return; }
    cycle();
    const t = setInterval(cycle, INTERVAL);
    return () => clearInterval(t);
  }, [user, auto, cycle, loadProducts, loadLogs]);

  if (user === undefined) return <div className="center mute">Memuat…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const statusOf = (p: Product): Status => (p.kind === "desktop" ? p.hb?.state ?? "not_connected" : hist[p.id]?.[0]?.status ?? "unknown");
  const lastAt = (p: Product) => (p.kind === "desktop" ? p.hb?.at : hist[p.id]?.[0]?.at);
  const online = products.filter((p) => statusOf(p) === "online").length;
  const offline = products.filter((p) => statusOf(p) === "offline").length;
  const all = products.flatMap((p) => (p.kind === "web" ? hist[p.id] || [] : []));
  const uptime = all.length ? ((all.filter((c) => c.status === "online").length / all.length) * 100).toFixed(1) + "%" : "—";
  const logout = async () => { await api("/api/logout", {}).catch(() => {}); setUser(null); setHist({}); };

  const table = (compact?: boolean) => (
    <div className="scroll"><table>
      <thead><tr><th>Produk</th><th>Tipe</th><th>Status</th><th>Respons</th><th>Terakhir</th>{!compact && <th />}</tr></thead>
      <tbody>{products.map((p) => (
        <tr key={p.id}>
          <td data-label="Produk"><a href={`#/product/${p.id}`}>{p.name}</a></td>
          <td data-label="Tipe" className="mute">{p.kind === "web" ? "Website" : "Desktop (heartbeat)"}</td>
          <td data-label="Status"><Badge s={statusOf(p)} /></td>
          <td data-label="Respons" className="num">{p.kind === "web" && hist[p.id]?.[0] ? `${hist[p.id][0].ms} ms` : "—"}</td>
          <td data-label="Terakhir" className="num">{fmtTime(lastAt(p))}</td>
          {!compact && <td className="act">{p.kind === "web" && <button disabled={busy.has(p.id)} onClick={() => checkOne(p.id).then(loadLogs)}>{busy.has(p.id) ? "…" : "Periksa"}</button>}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  );
  const logTable = (rows: Log[]) => (
    <div className="scroll"><table>
      <thead><tr><th>Waktu</th><th>Level</th><th>Sumber</th><th>Pesan</th></tr></thead>
      <tbody>{rows.length ? rows.map((l, i) => (
        <tr key={i}>
          <td data-label="Waktu" className="num">{fmtDate(l.t)}</td>
          <td data-label="Level"><Lvl l={l.level} /></td>
          <td data-label="Sumber" className="mute">{l.source}</td>
          <td data-label="Pesan" className="msg">{l.message}{l.ip ? <span className="mute"> · {l.ip}</span> : null}</td>
        </tr>
      )) : <tr><td colSpan={4} className="mute">Belum ada log.</td></tr>}</tbody>
    </table></div>
  );
  const refresh = <button className="primary" disabled={loading} onClick={cycle}>{loading ? "Memeriksa…" : "Periksa semua"}</button>;
  const nav = (to: string, label: string) => (
    <a href={`#${to}`} className={route === to || (to === "/monitoring" && route.startsWith("/product/")) ? "active" : ""}>{label}</a>
  );

  let page;
  if (route === "/monitoring") {
    page = <><div className="head"><h2>Software Monitoring</h2>{refresh}</div>{table()}</>;
  } else if (route === "/logs") {
    const rows = lf === "ALL" ? logs : logs.filter((l) => l.level === lf);
    page = (
      <>
        <div className="head"><h2>Log</h2><div className="row"><button onClick={loadLogs}>Muat ulang</button><button onClick={async () => { await api("/api/logs", { action: "clear" }); loadLogs(); }}>Hapus log</button></div></div>
        <div className="chips">{(["ALL", ...LEVELS] as const).map((x) => <button key={x} className={lf === x ? "on" : ""} onClick={() => setLf(x)}>{x === "ALL" ? "Semua" : x}</button>)}</div>
        {logTable(rows)}
        <p className="note">INFO: kejadian normal · WARN: perlu perhatian (login gagal, lambat, HTTP 4xx) · ERROR: gagal (timeout, HTTP 5xx) · FATAL: down 3x berturut-turut atau error server. Maksimal 500 log terakhir.</p>
      </>
    );
  } else if (route.startsWith("/product/")) {
    const p = products.find((x) => x.id === route.slice(9));
    const h = p ? hist[p.id] || [] : [];
    page = !p ? <p className="mute">Produk tidak ditemukan.</p> : (
      <>
        <div className="head"><h2>{p.name}</h2>{p.kind === "web" && <button className="primary" disabled={busy.has(p.id)} onClick={() => checkOne(p.id).then(loadLogs)}>Periksa sekarang</button>}</div>
        <dl>
          <dt>Status</dt><dd><Badge s={statusOf(p)} /></dd>
          <dt>Tipe</dt><dd>{p.kind === "web" ? "Website" : "Desktop Application (heartbeat)"}</dd>
          {p.url && <><dt>URL</dt><dd><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></dd></>}
          {p.kind === "web" ? <>
            <dt>HTTP</dt><dd className="num">{h[0]?.code ?? "—"}</dd>
            <dt>Respons</dt><dd className="num">{h[0] ? `${h[0].ms} ms` : "—"}</dd>
            <dt>Terakhir</dt><dd className="num">{fmtTime(h[0]?.at)}</dd>
          </> : <>
            <dt>Heartbeat</dt><dd className="num">{fmtTime(p.hb?.at)} ({fmtAge(p.hb?.ageMs)})</dd>
            <dt>Versi</dt><dd>{p.hb?.version ?? "—"}</dd>
            <dt>ID</dt><dd><code>{p.id}</code></dd>
          </>}
        </dl>
        {p.kind === "desktop" ? (
          <p className="note">Online jika heartbeat diterima dalam 90 detik terakhir. Kirim POST ke <code>/api/heartbeat</code> secara berkala (lihat Settings untuk contoh).</p>
        ) : (
          <>
            <h3>Riwayat sesi ini ({h.length})</h3>
            <div className="scroll"><table><thead><tr><th>Waktu</th><th>Status</th><th>HTTP</th><th>Respons</th><th>Catatan</th></tr></thead>
              <tbody>{h.length ? h.map((c, i) => <tr key={i}><td data-label="Waktu" className="num">{fmtTime(c.at)}</td><td data-label="Status"><Badge s={c.status} /></td><td data-label="HTTP" className="num">{c.code ?? "—"}</td><td data-label="Respons" className="num">{c.ms} ms</td><td data-label="Catatan" className="mute">{c.error ?? "—"}</td></tr>) : <tr><td colSpan={5} className="mute">Belum ada pemeriksaan.</td></tr>}</tbody></table></div>
          </>
        )}
      </>
    );
  } else if (route === "/settings") {
    page = (
      <>
        <div className="head"><h2>Settings</h2></div>
        <dl>
          <dt>Administrator</dt><dd>{user}</dd>
          <dt>Auto-check</dt><dd><label className="inline"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Setiap 60 detik selama dashboard terbuka</label></dd>
          <dt>Penyimpanan</dt><dd>{persistent ? <span className="ok">Upstash Redis (permanen)</span> : <span className="warn">Memori server (sementara; heartbeat & log bisa hilang)</span>}</dd>
          <dt>Riwayat sesi</dt><dd><button onClick={() => setHist({})}>Hapus riwayat sesi</button></dd>
          <dt>Sesi</dt><dd><button onClick={logout}>Keluar</button></dd>
        </dl>
        <h3>Heartbeat untuk aplikasi non-web</h3>
        <pre className="code">{`curl -X POST ${location.origin}/api/heartbeat \\
  -H "Authorization: Bearer <HEARTBEAT_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"prospector-ai","version":"1.0.0"}'`}</pre>
        <p className="note">Kirim tiap 30–60 detik. Riwayat uptime web hanya di memori browser dan hilang saat halaman ditutup; pemeriksaan web berjalan hanya ketika dashboard terbuka, sedangkan heartbeat dan log tersimpan di server.</p>
      </>
    );
  } else {
    page = (
      <>
        <div className="head"><h2>Overview</h2>{refresh}</div>
        <div className="stats">
          <div><span>Total produk</span><b>{products.length}</b></div>
          <div><span>Online</span><b className="ok">{online}</b></div>
          <div><span>Offline</span><b className="bad">{offline}</b></div>
          <div><span>Uptime sesi (web)</span><b>{uptime}</b></div>
        </div>
        {table(true)}
        <h3>Aktivitas terbaru</h3>
        {logTable(logs.slice(0, 5))}
        <p className="note">Uptime dihitung dari {all.length} pemeriksaan web pada sesi ini; tidak permanen.</p>
      </>
    );
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand"><span className="logo">A</span><div>Aeryth<small>Software Monitor</small></div></div>
        <nav>{nav("/", "Overview")}{nav("/monitoring", "Monitoring")}{nav("/logs", "Log")}{nav("/settings", "Settings")}</nav>
      </aside>
      <main>{page}</main>
    </div>
  );
}
