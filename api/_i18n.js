const T = {
  id: {
    tag: "Pantau semua produk Aeryth Systems langsung dari Telegram.", pick: "Pilih menu di bawah ⬇️",
    status: "Status Produk", logs: "Log Terbaru", online: "Online", offline: "Offline", nc: "Belum Terhubung",
    resp: "Respons", hb: "Heartbeat", nohb: "belum ada heartbeat", ver: "Versi", type: "Tipe", typeWeb: "Website", typeDesk: "Aplikasi Desktop",
    empty: "Belum ada log.", all: "Semua", agoS: "dtk lalu", agoM: "mnt lalu",
    bStatus: "Status", bLogs: "Log", bWeb: "Dashboard", bLang: "Bahasa", bRefresh: "Segarkan", bMenu: "Menu", bBack: "Kembali", bRecheck: "Cek Ulang",
    notfound: "Produk tidak ditemukan. Contoh: /check trebee", unknown: "Perintah tidak dikenal. Ketik /help", badlvl: "Level: info, warn, error, atau fatal",
    langSet: "Bahasa diatur ke Indonesia 🇮🇩", chooseLang: "Pilih bahasa / Choose language", helpTitle: "Bantuan",
    help: [["/status", "Status semua produk"], ["/check <nama>", "Cek satu produk"], ["/logs [level]", "Log terbaru"], ["/lang", "Ganti bahasa"], ["/menu", "Menu utama"]],
    alertDown: "DOWN", alertUp: "PULIH", hbLost: "HEARTBEAT HILANG", hbBack: "HEARTBEAT KEMBALI",
    failed3: "Gagal 3x pemeriksaan berturut-turut", reason: "Penyebab", noHb: "Tidak ada heartbeat selama lebih dari {s} dtk", recovered: "Kembali normal",
  },
  en: {
    tag: "Monitor all Aeryth Systems products right from Telegram.", pick: "Choose an option below ⬇️",
    status: "Product Status", logs: "Recent Logs", online: "Online", offline: "Offline", nc: "Not Connected",
    resp: "Response", hb: "Heartbeat", nohb: "no heartbeat yet", ver: "Version", type: "Type", typeWeb: "Website", typeDesk: "Desktop App",
    empty: "No logs yet.", all: "All", agoS: "s ago", agoM: "min ago",
    bStatus: "Status", bLogs: "Logs", bWeb: "Dashboard", bLang: "Language", bRefresh: "Refresh", bMenu: "Menu", bBack: "Back", bRecheck: "Re-check",
    notfound: "Product not found. Example: /check trebee", unknown: "Unknown command. Type /help", badlvl: "Level: info, warn, error or fatal",
    langSet: "Language set to English 🇬🇧", chooseLang: "Choose language / Pilih bahasa", helpTitle: "Help",
    help: [["/status", "Status of all products"], ["/check <name>", "Check one product"], ["/logs [level]", "Recent logs"], ["/lang", "Change language"], ["/menu", "Main menu"]],
    alertDown: "DOWN", alertUp: "RECOVERED", hbLost: "HEARTBEAT LOST", hbBack: "HEARTBEAT BACK",
    failed3: "Failed 3 checks in a row", reason: "Reason", noHb: "No heartbeat for over {s} s", recovered: "Back to normal",
  },
};
export const getT = (lang) => T[lang] || T.id;
export const LANGS = Object.keys(T);
