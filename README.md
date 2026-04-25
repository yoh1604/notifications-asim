# Asisten Imam App

Aplikasi Next.js untuk manajemen petugas, koordinator, jadwal pelayanan, dan
notifikasi WhatsApp. Backend data lokal memakai PostgreSQL, bukan Supabase.

## Fitur Utama

- Master data `petugas`, `koordinator`, dan `jadwal`.
- Input manual melalui tab `Data Master`.
- Form `Isi Jadwal` cukup memasukkan tanggal, jam, dan jumlah petugas.
- Satu jadwal menyimpan satu tanggal, satu jam, jumlah petugas, satu
  koordinator, dan daftar petugas yang bertugas.
- Jadwal bisa diacak otomatis untuk memilih daftar petugas dan satu
  koordinator.
- Setiap petugas yang tersimpan dari randomize dicatat di `penugasan_petugas`
  agar total penugasan bisa dihitung dan pembagian tetap merata.
- Detail petugas bisa menyimpan pilihan hari dan jam. Jika pilihan ini kosong,
  petugas bebas masuk semua jadwal; jika diisi, randomize hanya boleh memilih
  petugas tersebut pada jadwal dengan hari dan jam yang cocok.
- Export jadwal ke Excel dengan nama `Template_Jadwal_AI.xlsx`.
- Setiap baris `Jadwal Terbaru` punya export Excel sendiri.
- Seeder petugas dari `public/data/asisten_imam.csv`.
- Aturan rotasi jadwal di level database: petugas yang sudah mendapat jadwal
  tidak bisa ditugaskan lagi sebelum semua petugas aktif mendapat giliran.
- Docker production-like dengan Next.js standalone server dan PostgreSQL.

## Struktur Penting

- `app/page.tsx` berisi UI utama.
- `app/api/` berisi API route untuk `petugas`, `koordinator`, dan `jadwal`.
- `app/api/jadwal/[id]/randomize` memilih daftar petugas dan satu koordinator
  secara acak.
- `app/components/DataManager.tsx` berisi form input manual data master.
- `lib/db.ts` berisi koneksi pool PostgreSQL.
- `db/migrations/001_create_core_tables.sql` berisi schema dan trigger rotasi.
- `db/seeds/001_seed_petugas_from_csv.sql` dipakai Docker init untuk seed CSV.
- `scripts/migrate.mjs` menjalankan migration dari host.
- `scripts/seed-petugas.mjs` menjalankan seed petugas dari host.

## Environment

Buat `.env.local` dari template:

```bash
cp .env.example .env.local
```

Nilai default lokal:

```env
APP_PORT=3000
POSTGRES_PORT=5432
POSTGRES_DB=notifications_asim
POSTGRES_USER=notifications_asim
POSTGRES_PASSWORD=notifications_asim
DATABASE_URL=postgresql://notifications_asim:notifications_asim@localhost:5432/notifications_asim
NEXT_PUBLIC_FONNTE_TOKEN=
```

Jangan commit `.env.local`.

## Menjalankan Dengan Docker

Jalankan stack production-like:

```bash
docker compose --env-file .env.local up --build
```

Buka:

```text
http://localhost:3000
```

Jika port `3000` sudah dipakai:

```bash
APP_PORT=3001 docker compose --env-file .env.local up --build
```

Pada volume PostgreSQL kosong, Docker otomatis menjalankan migration dan seed
petugas dari `public/data/asisten_imam.csv`.

Reset database lokal Docker dari awal:

```bash
docker compose down -v
docker compose --env-file .env.local up --build
```

## Development Lokal

Install dependency:

```bash
npm install
```

Jalankan PostgreSQL saja:

```bash
docker compose --env-file .env.local up -d db
```

Jalankan migration dan seed dari host:

```bash
npm run db:setup
```

Jalankan Next.js development server:

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Database

Tabel utama:

- `petugas`: data personel Asisten Imam.
- `koordinator`: data koordinator, opsional terhubung ke `petugas`.
- `jadwal`: header jadwal berisi `tanggal`, `jam`, `jumlah_petugas`, satu
  `koordinator`, status, dan catatan.
- `jadwal_petugas`: detail daftar petugas untuk satu jadwal.
- `penugasan_petugas`: histori petugas yang sudah tersimpan sebagai penugasan.
- `petugas_penugasan_count`: view count penugasan aktif per petugas.
- `petugas_jadwal_waktu_pilihan`: batasan opsional hari dan jam randomize
  untuk petugas tertentu.

Migration:

```bash
npm run db:migrate
```

Seed ulang petugas dari CSV:

```bash
npm run db:seed:petugas
```

Aturan rotasi ada di trigger `jadwal_petugas_enforce_rotation`. Penyimpanan
histori/count ada di trigger `jadwal_petugas_sync_penugasan` dan
`jadwal_sync_penugasan`. Jika petugas A sudah bertugas pada jadwal X, petugas A
tidak bisa masuk lagi pada jadwal Y sebelum semua petugas aktif lain mendapat
giliran. Randomize juga memprioritaskan petugas dengan `total_penugasan`
paling kecil. Randomize hanya mengisi petugas/koordinator pada jadwal `draft`.
Tombol `Simpan` mengunci jadwal menjadi `terjadwal` dan baru saat itu
penugasan masuk ke count. Setelah tersimpan sebagai `terjadwal`, randomize
ulang ditolak.
Pembatasan jadwal per petugas disimpan di `petugas_jadwal_waktu_pilihan`
berdasarkan nama hari dan jam. Jika petugas tidak punya baris pilihan, petugas
boleh masuk ke jadwal mana pun yang lolos rotasi. Jika ada pilihan, API
randomize dan trigger database hanya mengizinkan petugas masuk ke jadwal dengan
hari dan jam yang cocok.

Flow jadwal di UI:

1. Buka tab `Data Master`.
2. Isi `Tanggal`, `Jam`, dan `Jumlah petugas`.
3. Klik `Buat Jadwal`.
4. Pada `Jadwal Terbaru`, klik `Randomize` untuk mengacak petugas dan
   koordinator.
5. Klik `Simpan` untuk mengunci hasil randomize dan menghitung penugasan.
6. Jadwal yang sudah tersimpan akan menampilkan aksi `Tersimpan`, bukan tombol
   randomize.
7. Klik `Excel` per jadwal atau `Download Excel` untuk semua jadwal.

## Verification

```bash
npm run lint
npm run build
```

`npm run lint` saat ini pass dengan beberapa warning non-blocking dari kode UI
lama.
