# PlacidWay — deploy manual ke Vercel + Supabase

Paket ini adalah adaptasi terpisah dari demo Cloudflare Workers/D1. Gunakan **paket ini**, bukan ZIP Cloudflare sebelumnya, untuk Vercel. Frontend React dan backend API Next.js berada dalam satu proyek. Database berjalan di Supabase PostgreSQL. Tidak ada server Python, proses FastAPI, atau LangGraph yang harus dinyalakan.

Panduan diperiksa pada **22 Oktober 2026**. Paket ini disiapkan untuk deployment manual ke akunmu; belum dipublikasikan atau diuji end-to-end di akun Vercel/Supabase milikmu.

## 1. Apakah gratis? Key apa yang dipakai?

| Komponen | Keterangan |
| --- | --- |
| Vercel Hobby | Paket gratis dengan kuota; ditujukan untuk penggunaan pribadi nonkomersial. Cek ketentuan sesuai penggunaanmu. |
| Supabase Free | Database 500 MB, maksimal dua proyek aktif, dan kuota lain. Proyek dapat dipause setelah satu minggu tidak aktif. |
| Mode ekstraksi | Tidak menggunakan LLM, jadi tidak ada biaya inference OpenAI. Inilah mode yang dipakai demo sebelumnya. |
| OpenAI API | Opsional dan ditagih menurut penggunaan model/token. Jangan mengandalkan kredit percobaan untuk menjalankan bot publik. |

**Aku tidak memakai API key OpenAI pada deployment demo sebelumnya.** Hostingnya memakai Sites/Cloudflare dan D1, bukan akun Vercel atau Supabase. Tidak ada key OpenAI dari deployment tersebut yang perlu disalin. Credential publishing hosting berbeda dari key LLM.

Menambahkan key hanya mengaktifkan adapter pemilih ID bukti untuk sebagian pertanyaan `general`. Harga, fallback, state percakapan, dan sebagian besar respons tetap ditentukan kode. Adapter tidak menjadikan implementasi ini chatbot LLM penuh; LangGraph juga belum dipakai.

## 2. Buat Supabase dan siapkan database

1. Buka https://supabase.com/dashboard dan buat organisasi/proyek dengan paket **Free**. Gunakan region yang dekat dengan lokasi hosting/pengguna. Simpan password database di password manager. Aplikasi ini tidak membutuhkan password tersebut karena memakai Data API lewat HTTPS.
2. Setelah proyek siap, buka **SQL Editor → New query**.
3. Buka file **`supabase/schema.sql`** dari paket ini. Salin seluruh isinya ke SQL Editor dan jalankan.
4. Ambil **Project URL** dari dialog **Connect** atau pengaturan **Data API**. Bentuknya `https://PROJECT_REF.supabase.co`.
5. Ambil **secret key** dari pengaturan **API Keys**. Gunakan key berawalan `sb_secret_...`. Jangan gunakan publishable key. Jika proyek lama hanya memiliki key `service_role`, nilai itu juga didukung dalam variabel yang sama.

SQL membuat tabel dalam schema `pw_private` dan fungsi RPC `public.pw_call`. Tabel tidak dibuka ke pengunjung. RLS aktif; akses RPC hanya diberikan kepada `service_role`, yaitu peran server yang digunakan secret key. Browser menghubungi API Next.js dan tidak menerima secret Supabase.

Pengaturan Data API Supabase harus mengaktifkan schema `public` (pengaturan standar), karena fungsi `pw_call` berada di sana. Jangan menambahkan `pw_private` sebagai exposed schema. Untuk melihat data secara manual, gunakan SQL Editor; schema tersebut tidak dipilih secara default di Table Editor.

Tidak perlu pgvector, Auth, Storage bucket, atau Supabase Edge Functions. Tujuh halaman pengetahuan sudah dibundel di `data/knowledge.json`. Pada database baru, backend membaca snapshot bundel; refresh berikutnya menyimpan snapshot aktif dalam Supabase. Data chat dari demo Cloudflare tidak dipindahkan.

## 3. Isi environment lokal

Pasang **Node.js 22.13+** (Node 22/24 LTS), lalu buka terminal pada folder paket yang berisi `package.json`. Jangan menjalankan perintah di folder ZIP yang belum diekstrak.

Windows PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

macOS/Linux: ganti baris penyalinan dengan `cp .env.example .env.local`.

Edit `.env.local` menggunakan editor lokal:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=ISI_SECRET_KEY_SUPABASE_MILIKMU
ADMIN_REFRESH_TOKEN=ISI_TOKEN_ACAK_LOKAL

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

LIVE_BASE_URL=http://localhost:3000
```

Nilai `ISI_...` adalah placeholder, bukan key yang bisa dipakai. Buat `ADMIN_REFRESH_TOKEN` sendiri dengan perintah berikut, lalu salin hasilnya ke `.env.local`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Variabel | Diisi dari mana | Kapan diperlukan |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL Supabase | Wajib untuk backend. |
| `SUPABASE_SECRET_KEY` | API Keys → secret key (`sb_secret_...`) | Wajib untuk backend. Legacy `service_role` juga didukung. |
| `ADMIN_REFRESH_TOKEN` | Token acak hasil perintah di atas | Untuk refresh dan membaca content gaps; minimum 24 karakter. |
| `OPENAI_API_KEY` | Key proyek akun OpenAI API milikmu | Opsional. Kosongkan untuk menghindari panggilan/biaya LLM. |
| `OPENAI_MODEL` | ID model yang kompatibel dan tersedia di akun API | Hanya dipakai bila key LLM diisi. |
| `LIVE_BASE_URL` | URL target untuk skrip CLI | Lokal `http://localhost:3000`; setelah deploy ganti dengan URL HTTPS Vercel saat menjalankan skrip terhadap live. |

Semua secret adalah **server-only**. Jangan menambahkan awalan `NEXT_PUBLIC_` pada secret. Tidak perlu `NEXT_PUBLIC_SUPABASE_ANON_KEY` untuk arsitektur ini. `.env.local` diabaikan Git; `.env.example` hanya berisi template kosong.

## 4. Cara menjalankan backend dan frontend

```sh
npm run dev
```

Buka **http://localhost:3000** untuk UI. Backend langsung berjalan pada server yang sama:

| Method dan alamat | Fungsi |
| --- | --- |
| `GET /api/health` | Memeriksa koneksi/RPC database dan tujuh sumber. |
| `GET /api/sources` | Metadata sumber dan versi snapshot. |
| `POST /api/chat` | Pertanyaan, konteks sesi, retrieval, dan jawaban bersumber. |
| `GET /api/session` | Riwayat sesi berdasarkan cookie. |
| `DELETE /api/session` | Menghapus percakapan saat ini. |
| `POST /api/lead` | Menyimpan kontak dengan consent; tidak mengirim ke PlacidWay. |
| `POST /api/refresh` | Admin: crawl ulang tujuh URL yang diizinkan. |
| `GET /api/refresh` | Admin: membaca content gaps. |

Tidak perlu menjalankan dua terminal untuk frontend dan backend, mengatur CORS, atau menyalakan Uvicorn. Supabase yang hosted sudah menjalankan database di cloud; komputer lokalmu hanya menjalankan Next.js. Setelah mengubah environment, restart server dengan Ctrl+C lalu `npm run dev`.

Untuk menjalankan hasil build production di komputer sendiri:

```sh
npm run build
npm start
```

Pada deployment Vercel, route API menjadi Vercel Functions. Vercel yang menjalankannya; laptopmu tidak perlu tetap menyala dan tidak ada proses `npm start` manual di dashboard.

## 5. Pemeriksaan lokal

Setelah SQL dan `.env.local` siap, dengan server masih berjalan:

```sh
npm run check:deployment
npm run test:submission
```

Health yang benar memuat `status: "ok"`, `sources: 7`, dan `knowledgeVersion`. `engine: "extractive"` berarti tidak ada key LLM. `openai-configured-not-verified` berarti key dikonfigurasi, **belum membuktikan panggilan provider berhasil**.

`test:submission` menggunakan `LIVE_BASE_URL` bila diisi, mengirim delapan pertanyaan ke API target dan menyimpan respons aktual di `docs/live-test-results.md` serta `.json`. Tanpa variabel itu, tes menggunakan engine lokal dan menulis `docs/test-results.*`. Karena template `.env.local` mengisi localhost, server harus sudah berjalan untuk tes HTTP.

Tes yang tidak membutuhkan akun Supabase atau key OpenAI:

```sh
npm test
npm run build
npm run typecheck
npm run test:api
```

`test:api` harus dijalankan sesudah build. Ia menyalakan Next.js production sementara dan menggunakan PostgreSQL lokal berbasis PGlite melalui jembatan HTTP khusus tes. Ini menguji route nyata dan SQL, tetapi tidak menguji konfigurasi gateway/auth pada akun Supabase hosted. Script tersebut tidak digunakan dalam aplikasi production dan tidak boleh dideploy sebagai service.

## 6. Deploy manual ke Vercel

1. Buat repository GitHub baru. Upload **isi folder paket ini** sehingga `package.json`, `package-lock.json`, `app`, `lib`, dan `supabase` ada di root. Jangan upload `.env.local`, `node_modules`, atau `.next`. File tersembunyi `.gitignore` harus ikut; jika web uploader menyembunyikan `.env.example`, tambahkan template secara manual atau lewat Git.
2. Buka https://vercel.com/new → **Import Git Repository** → pilih repo tersebut. Gunakan akun/paket sesuai ketentuan penggunaanmu.
3. Pilih **Framework Preset: Next.js**. **Root Directory:** folder yang berisi `package.json` (root jika mengikuti langkah 1). **Install Command:** `npm ci`. **Build Command:** `npm run build`. Biarkan output directory default Next.js; jangan pilih `dist`.
4. Pilih runtime **Node.js 22.x atau 24.x**, sesuai versi yang sudah kamu uji. Tidak perlu Cloudflare binding `DB`, Wrangler, Vite, atau Vinext.
5. Sebelum deploy, masukkan variabel server dari `.env.local` ke **Environment Variables**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_REFRESH_TOKEN`. Tambahkan `OPENAI_MODEL` dan `OPENAI_API_KEY` hanya jika ingin memakai adapter LLM. **Untuk mode tanpa biaya LLM, hapus/kosongkan `OPENAI_API_KEY`.** Pilih environment **Production**; isi Preview juga jika ingin backend bekerja pada preview deployment.
6. Klik **Deploy**. Vercel membangun UI dan route API bersama-sama. Jika mengubah environment setelah deployment, jalankan **Redeploy**; deployment lama tidak otomatis memakai nilai baru.
7. Buka URL production HTTPS hasil Vercel. Pastikan production deployment dapat dibuka tanpa login. Jika deployment protection meminta login reviewer, sesuaikan konfigurasi proteksi deployment **proyek Vercel milikmu** untuk URL yang dikirim. Jangan mengubah akses demo Sites sebelumnya.
8. Di `.env.local` komputer lokal, ubah `LIVE_BASE_URL` menjadi URL production Vercel, lalu jalankan `npm run check:deployment` dan `npm run test:submission`. UI tidak memakai variabel ini, jadi tidak perlu menaruhnya di Vercel jika hanya dipakai dari terminal lokal.
9. Uji chat, follow-up, reload riwayat, dan New conversation di browser. Coba URL di incognito untuk memastikan reviewer tidak memerlukan login. Simpan hasil tes dan live link sebagai bagian submission.

Supabase hanya menyimpan data; **backend chat berjalan di Vercel**, bukan di Supabase. Jangan mengunggah folder API sebagai SQL atau menjalankan `next dev` di Supabase.

## 7. OpenAI: cara mendapatkan key dan batas implementasinya

1. Buka https://platform.openai.com/api-keys dan pilih proyek akun API milikmu. Buat secret key untuk aplikasi ini. Jangan memakai token sesi ChatGPT/browser sebagai key aplikasi.
2. Periksa https://platform.openai.com/settings/organization/billing/overview dan https://platform.openai.com/usage. Konfigurasikan billing/credit serta notifikasi penggunaan sesuai anggaranmu. API key sendiri tidak berarti inference gratis.
3. Isi `OPENAI_API_KEY` hanya dalam `.env.local`/environment Vercel. Jangan kirim key melalui chat publik, commit Git, atau file submission.
4. Default adapter yang dipertahankan dari kode sebelumnya adalah `gpt-4.1-mini`. Per 22 Oktober 2026, model ini deprecated dan dijadwalkan dihapus pada **14 Januari 2027**. Ia menggunakan Chat Completions, structured JSON schema, dan `temperature=0`. Sebelum mengganti model, periksa dukungan parameter tersebut di `lib/model.ts`, bukan hanya mengganti nama.
5. Untuk mengecek integrasi, gunakan pertanyaan yang benar-benar menghasilkan `intent: "general"` dan `status: "answered"`. Periksa response chat: `engine: "openai-evidence-selection"` membuktikan jalur seleksi model dipakai; `extractive-fallback` menunjukkan provider gagal. Harga paket dan delapan tes asesmen tidak otomatis membuktikan pemakaian model.

Tarif `gpt-4.1-mini` yang diverifikasi: input USD 0,40 dan output USD 1,60 per sejuta token. Ilustrasi 2.000 token input + 100 output = USD 0,00096 per panggilan. Ini ilustrasi, bukan pengukuran aplikasi atau jaminan biaya bulanan. Biaya hanya terjadi pada panggilan adapter yang benar-benar dijalankan; pertanyaan lain tidak otomatis memanggil OpenAI. Ketersediaan model dan kredit tergantung akun.

Paket ini tidak mengubah adapter menjadi RAG generatif penuh, menambahkan embedding, atau mengimplementasikan LangGraph. Ini adaptasi hosting/storage dari implementasi yang sudah ada. Persyaratan demonstrasi grounding LLM aktif masih memerlukan uji provider nyata dan penjelasan batas tersebut dalam submission.

## 8. Refresh konten, tanpa mencampur versi deployment

Tidak perlu refresh untuk pertama kali menjalankan aplikasi. Gunakan snapshot tujuh sumber yang sudah ada. Jika memang ingin memperbarui konten setelah memeriksa akses crawling:

```sh
npm run refresh
```

Skrip mengambil `LIVE_BASE_URL` dan `ADMIN_REFRESH_TOKEN` dari `.env.local`, mengirim request admin, dan hanya mengganti snapshot aktif setelah ketujuh sumber lolos. Refresh mengikuti allowlist, robots, User-Agent jelas, jeda 1,1 detik dan menolak redirect. Jika gagal, snapshot lama tetap dipakai. Endpoint memiliki cooldown lima menit. Proses dapat berjalan lama; route refresh memiliki `maxDuration=300` detik, tetapi waktu aktual tetap mengikuti paket/konfigurasi Vercel.

Deploy ulang `data/knowledge.json` tidak mengganti row `knowledge/active` yang sudah ada pada Supabase. Jangan menghapus database untuk memperbaiki snapshot. Refresh dan deploy kode adalah operasi terpisah. Harga snapshot bukan quote real-time, dan validitas usia harga belum memiliki TTL otomatis.

## 9. Jika terjadi error

| Gejala | Langkah konkret |
| --- | --- |
| Halaman muncul, chat/health HTTP 503 | Periksa `SUPABASE_URL`, secret key, status proyek Supabase dan apakah `schema.sql` sudah dijalankan; redeploy setelah memperbaiki env. |
| SQL/RPC tidak ditemukan | Jalankan seluruh `supabase/schema.sql` dalam proyek yang sama dengan URL/env. Query terakhir meminta PostgREST me-reload schema. |
| Secret key ditolak | Gunakan key dari proyek yang sama. `sb_publishable_...`/`anon` tidak boleh mengakses RPC server ini. Untuk modern secret, kode mengirim header `apikey`, bukan memperlakukannya sebagai JWT. |
| Supabase paused | Buka dashboard proyek dan lakukan restore/resume, lalu ulangi health check. Free plan tidak menjamin uptime terus-menerus. |
| HTTP 401 pada refresh | Isi token acak minimum 24 karakter pada server dan CLI. Nilainya harus sama. |
| HTTP 409 pada chat/refresh | Tunggu jawaban yang sedang diproses atau cooldown refresh; retry chat dengan requestId yang sama memakai hasil tersimpan. |
| LLM `extractive-fallback` | Periksa billing, akses model, model ID, timeout dan parameter adapter. Jawaban ekstraksi dapat tetap bekerja; ini bukan bukti LLM berhasil. |
| Review link meminta login | Gunakan URL production; periksa deployment protection Vercel lalu tes incognito tanpa bypass token. |
| Build mencari Cloudflare/Vinext | Pastikan repo berasal dari paket Vercel ini, bukan ZIP lama. Script build harus `next build --webpack`. |

Selama minimal tujuh hari sesudah submission, pertahankan proyek, database, env dan kuota tetap tersedia. Supabase Free dapat dipause karena tidak aktif dan Vercel Hobby memiliki batas penggunaan; cek dashboard serta hasil health, bukan menganggap paket gratis menjamin SLA.

## 10. Peta kode dan perubahan dari demo sebelumnya

| File | Tanggung jawab |
| --- | --- |
| `app/page.tsx` | UI chat, cookie sesi melalui request same-origin, retry, sumber, lead form. |
| `app/api/*/route.ts` | Backend API Next.js di Vercel Functions. |
| `lib/server.ts` | Cookie, sesi, guard origin/admin dan rate limit. Environment dari `process.env`. |
| `lib/storage.ts` | HTTPS Supabase PostgREST RPC dengan secret server-only. |
| `supabase/schema.sql` | Tabel PostgreSQL, akses role dan transaksi operasi backend. |
| `lib/conversation.ts` | State machine untuk treatment, negara, intent, koreksi dan klarifikasi. |
| `lib/core.ts`, `lib/retrieval.ts` | Retrieval dan jawaban ekstraksi yang dibatasi bukti. |
| `lib/model.ts` | Adapter OpenAI opsional, memilih ID bukti saja. |
| `lib/ingestion.ts`, `scripts/ingest.py` | Refresh server dan ingestion CLI. Python hanya diperlukan jika menjalankan CLI. |
| `data/knowledge.json` | Snapshot tujuh sumber yang sudah dikumpulkan; tidak dicrawl ulang saat install/build. |

Perubahan utama: Vinext/Worker → Next.js Node.js; D1/SQLite → Supabase/PostgreSQL; binding Cloudflare → environment server. Commit jawaban, pembaruan state, serta pencatatan gap berada dalam satu transaksi PostgreSQL. Lock sesi memakai token dan lease, hasil request tersimpan untuk retry. Browser tidak mengakses database langsung.

## Rujukan resmi

- Next.js di Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Environment Vercel: https://vercel.com/docs/environment-variables
- Batas Hobby: https://vercel.com/docs/plans/hobby
- Harga Supabase: https://supabase.com/pricing
- API keys Supabase: https://supabase.com/docs/guides/getting-started/api-keys
- Database functions: https://supabase.com/docs/guides/database/functions
- OpenAI key/setup: https://developers.openai.com/api/docs/quickstart
- Model dan tarif: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- Deprecations: https://developers.openai.com/api/docs/deprecations

Rujukan paket dan ketersediaan model dapat berubah. Tidak ada secret atau API key nyata dalam paket ini.
