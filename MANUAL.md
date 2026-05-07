# Manual Book — Jadwal Asisten Imam (Technical Guide)

This manual provides a technical reference for administrators and users of the Jadwal Asisten Imam application. It covers architecture, operation, administration tasks, API endpoints, and deployment guidance.

## 1. Overview
The application is a Next.js TypeScript app that stores personnel (`petugas`) and schedule (`jadwal`) data in PostgreSQL. It provides:
- A UI for bulk scheduling and conversion of schedule entries into WhatsApp links
- Background batch messaging using Fonnte API
- Confirmation and attendance workflows tracked in the database

## 2. Architecture
- Frontend / API: `app/` — Next.js app routes and API handlers (App Router)
- Data layer: PostgreSQL with SQL migrations in `db/migrations/`
- Helpers: `lib/` — database client and business logic modules

Key flows:
- Upload CSV → parse (papaparse/xlsx) → persist to `petugas` / `jadwal` tables
- Create `jadwal_petugas` entries → triggers create or sync `penugasan_petugas` rows
- Send WhatsApp notifications via Fonnte; update `penugasan_petugas.confirmation_status` on responses

## 3. Installation

Development (native)

1. Install Node.js 18+ and npm
2. Copy `.env.example` to `.env.local` and set values
3. `npm install`
4. `npm run dev`

Docker Compose

```bash
docker compose up --build
```

The included compose file brings up the Postgres DB and the Next.js application. Adminer (`:8080`) and pgAdmin (`:5050`) may be available for convenience.

## 4. Configuration
- `NEXT_PUBLIC_FONNTE_TOKEN` — Bearer token used to authenticate with the Fonnte WhatsApp API
- `POSTGRES_*` or `DATABASE_URL` — database connection details

Place secrets in environment files and never commit tokens into source control.

## 5. User workflows

Batch Jadwal (Admin)
- Upload an Excel/CSV file with columns: `Tanggal` (YYYY-MM-DD), `Jam` (HH:mm), `Nama_Petugas`, `Nama_Koordinator`, `wilayah` (optional)
- Use the batch tooling to group and schedule by `wilayah` (region)
- Send messages in controlled batches (delays implemented in UI)

Converter Link WA (User/Admin)
- Upload the same CSV; the converter generates `wa.me` links with a prefilled message
- Copy or open links to send messages via WhatsApp Web/phone directly

Attendance Management
- Admins can mark attendance; the system records `attendance_checked_in_at` and writes entries to `penugasan_petugas_attendance_history`.

## 6. Admin operations

Manage `petugas` (personnel)
- Add or edit a `petugas` using the UI or import CSV via `Uploader.tsx`.
- `no_hp` should be stored in national format (e.g., starting with `08`) — the client code converts to `62` for international format when sending via Fonnte.

Resyncing assignments and migrations
- Migrations are under `db/migrations/`. The compose file initializes Postgres with these migration SQL files when the container is first created.

Manual migration (one-off)
- Use the `scripts/migrate.mjs` or run SQL directly via Adminer/psql.

## 7. API Reference (selected routes)
- `POST /api/petugas` — Manage petugas records. See [app/api/petugas/route.ts](app/api/petugas/route.ts).
- `GET /api/koordinator` — List coordinators. See [app/api/koordinator/route.ts](app/api/koordinator/route.ts).
- `POST /api/jadwal/save` — Save randomized schedule slots. See [app/api/jadwal/save/route.ts](app/api/jadwal/save/route.ts).
- `POST /api/webhook/fonnte/confirm` — Webhook endpoint to receive confirmations from Fonnte. See [app/api/webhook/fonnte/confirm/route.ts](app/api/webhook/fonnte/confirm/route.ts).

For full route listing, inspect `app/api/`.

## 8. Troubleshooting
- Database connection errors: verify `DATABASE_URL` or `POSTGRES_*` env vars and ensure the DB container is healthy.
- WhatsApp sending failures: check `NEXT_PUBLIC_FONNTE_TOKEN` and that numbers are normalized correctly.
- CSV parsing problems: ensure header names match expected columns.

## 9. Maintenance
- Back up the Postgres volume (`postgres_data`) regularly.
- Archive old `jadwal` and `penugasan_petugas` records if retention is needed.
