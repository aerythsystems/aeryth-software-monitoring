# Aeryth Software Monitor

Dashboard internal untuk memantau produk Aeryth Systems. Frontend React + TypeScript + Vite; backend Vercel Serverless Functions (folder `api/`). Free tier. Tanpa database; heartbeat dan log memakai Upstash Redis (free tier, opsional tapi disarankan).

## Lokal (Termux / laptop)
```bash
npm install
cp .env.example .env     # isi nilai sendiri
npm run dev              # API :3001 + Vite :5173
```
Buka http://localhost:5173. Cek build: `npm run build`.

## Environment variables
| Nama | Keterangan |
|---|---|
| `ADMIN_USERNAME` | username administrator |
| `ADMIN_PASSWORD` | password administrator |
| `SESSION_SECRET` | string acak ≥ 32 karakter (`openssl rand -base64 48`) |
| `HEARTBEAT_TOKEN` | token ≥ 16 karakter untuk aplikasi non-web |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | opsional; dari upstash.com (Redis, free tier) agar heartbeat & log permanen |

## Deploy ke Vercel (tanpa CLI)
1. Push folder ke repo GitHub (`.env` sudah di-ignore).
2. vercel.com → Add New → Project → pilih repo. Framework otomatis terdeteksi sebagai Vite.
3. Settings → Environment Variables: isi tiga variabel di atas, lalu Deploy.

## Catatan
- Klien hanya mengirim `id` produk; URL berasal dari daftar di `api/_lib.js` (tidak ada proxy terbuka). Tambah produk di file itu.
- Online = HTTP < 400, timeout 8 dtk (batas Hobby 10 dtk).
- Session: cookie HttpOnly, SameSite=Strict, Secure di HTTPS, HMAC-SHA256, 8 jam.
- Riwayat/uptime hanya di memori browser, tidak permanen; pemeriksaan hanya berjalan saat dashboard terbuka.
- Aeryth Prospector AI = Desktop Application, Not Connected sampai ada agent/heartbeat lokal.
- Tidak ada rate-limit login (tanpa penyimpanan).

## Heartbeat aplikasi non-web
Kirim tiap 30–60 detik; online bila heartbeat < 90 detik terakhir.
```bash
curl -X POST https://DOMAIN-ANDA/api/heartbeat \
  -H "Authorization: Bearer $HEARTBEAT_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"prospector-ai","version":"1.0.0"}'
```
Tanpa Upstash, data disimpan di memori fungsi Vercel dan bisa hilang kapan saja (di lokal tetap aman selama server hidup).

## Log
Level: INFO (login, pulih, terhubung), WARN (login gagal, lambat >3 dtk, HTTP 4xx, token heartbeat salah), ERROR (timeout, HTTP 5xx), FATAL (down 3x berturut-turut, error server). Maksimal 500 log terakhir. Pemeriksaan web hanya berjalan saat dashboard terbuka.

## Bot Telegram + pemeriksaan otomatis
Bot memakai tombol interaktif (menu, status, detail produk, filter log) dan 2 bahasa (Indonesia/English, ganti lewat `/lang`). Perintah: `/menu`, `/status`, `/check <nama>`, `/logs [level]`, `/lang`, `/help`. Hanya chat ID pemilik yang dilayani.
Alert otomatis: produk DOWN 3x berturut-turut, heartbeat berhenti, dan saat pulih.

1. Telegram → @BotFather → `/newbot` → simpan token (`TELEGRAM_BOT_TOKEN`).
2. Kirim "halo" ke bot Anda, lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates` dan ambil angka `chat.id` (`TELEGRAM_CHAT_ID`). Lakukan ini SEBELUM langkah 5.
3. Buat `TELEGRAM_WEBHOOK_SECRET` dan `CRON_SECRET` (huruf/angka/_/-): `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
4. Isi semua variabel di Vercel, lalu deploy.
5. Daftarkan webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://DOMAIN/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
6. (Opsional) BotFather → `/setcommands`: `menu - Menu utama`, `status - Status semua produk`, `check - Cek satu produk`, `logs - Log terbaru`, `lang - Bahasa / Language`, `help - Bantuan`.
7. cron-job.org (gratis): URL `https://DOMAIN/api/cron`, interval 5 menit, header `Authorization: Bearer <CRON_SECRET>`.

Bot butuh URL publik, jadi uji di Vercel (bukan localhost). Perhatikan kuota Upstash free tier; interval 5 menit aman.
