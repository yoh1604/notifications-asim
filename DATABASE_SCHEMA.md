# Database Schema Documentation

This document explains the core tables, relationships, indexes, constraints and notable triggers/functions used by the application. The authoritative SQL is under `db/migrations/`.

## Overview (conceptual)
- `petugas` — personnel (assistant imam) records
- `koordinator` — coordinator records (may reference a `petugas`)
- `jadwal` — schedule header (date, time, coordinator)
- `jadwal_petugas` — assignments per `jadwal` (ordered slots)
- `penugasan_petugas` — denormalized assignment rows used for messaging, confirmation, and attendance
- `penugasan_petugas_attendance_history` — attendance history events
- `jadwal_petugas_swap_history` — swap history for slot reassignments

Relationships
- A `jadwal` has many `jadwal_petugas` (1:N)
- Each `jadwal_petugas` references one `petugas` (N:1)
- `penugasan_petugas` syncs from `jadwal_petugas` and references both `jadwal` and `petugas`

---

## Tables

### `petugas`
- Purpose: store personnel metadata
- Columns:
  - `id` integer PK (IDENTITY)
  - `nama` text NOT NULL
  - `wilayah` text NOT NULL
  - `lingkungan` text
  - `no_hp` text
  - `aktif` boolean NOT NULL DEFAULT true
  - `created_at`, `updated_at` timestamptz
- Indexes/constraints:
  - Unique index on `upper(trim(nama))`
  - Index on `(wilayah, lingkungan)`

### `koordinator`
- Purpose: named coordinator for a `jadwal`
- Columns:
  - `id` integer PK
  - `petugas_id` integer FK -> `petugas(id)` ON DELETE SET NULL
  - `nama` text NOT NULL
  - `no_hp` text
  - `aktif` boolean
  - `created_at`, `updated_at`

### `jadwal`
- Purpose: schedule header
- Columns:
  - `id` bigint PK
  - `tanggal` date NOT NULL
  - `jam` time NOT NULL
  - `jumlah_petugas` integer NOT NULL DEFAULT 1
  - `koordinator_id` FK -> `koordinator(id)`
  - `status` text NOT NULL DEFAULT 'draft' (CHECK in ('draft','terjadwal','selesai','batal'))
  - `catatan` text
  - `created_at`, `updated_at`
- Indexes: index on `(tanggal, jam)`

### `jadwal_petugas`
- Purpose: mapping slots within a `jadwal` to a `petugas` and their order
- Columns:
  - `id` bigint PK
  - `jadwal_id` bigint FK -> `jadwal(id)` ON DELETE CASCADE
  - `petugas_id` integer FK -> `petugas(id)`
  - `urutan` integer NOT NULL (slot order)
  - `created_at`
- Constraints:
  - Unique (jadwal_id, petugas_id)
  - Unique (jadwal_id, urutan)
  - `urutan > 0`

### `penugasan_petugas`
- Purpose: denormalized row per assigned petugas used for messaging and attendance workflows
- Columns:
  - `id` bigint PK
  - `jadwal_id` bigint FK -> `jadwal(id)`
  - `jadwal_petugas_id` bigint FK -> `jadwal_petugas(id)`
  - `petugas_id` integer FK -> `petugas(id)`
  - `tanggal` date
  - `jam` time
  - `status` text NOT NULL DEFAULT 'terjadwal' (CHECK in ('terjadwal','batal'))
  - `assigned_at`, `updated_at` timestamptz
  - `confirmation_status` text NOT NULL DEFAULT 'pending' (CHECK in ('pending','confirmed','declined'))
  - `confirmation_sent_at`, `confirmation_received_at` timestamptz
  - `confirmation_message` text
  - `attendance_status` text NOT NULL DEFAULT 'pending' (CHECK in ('pending','attended'))
  - `attendance_checked_in_at` timestamptz
- Indexes: by `petugas_id`, by `(tanggal, jam)`, by `confirmation_status` and `attendance_status` for efficient filtering

### `penugasan_petugas_attendance_history`
- Purpose: keep a temporal record of attendance-related actions
- Columns: `id` PK, `penugasan_petugas_id` FK, `action` text, `note` text, `created_at`

### `jadwal_petugas_swap_history`
- Purpose: record manual/random swaps between petugas for a `jadwal` slot
- Columns: `id` PK, `jadwal_id` FK, `jadwal_petugas_id`, `from_petugas_id`, `to_petugas_id`, `mode` ('manual'|'random'), `note`, `created_at`

---

## Functions, Triggers and Business Rules
- `set_updated_at()` — updates `updated_at` on row updates (triggered for core tables)
- `can_assign_petugas(...)` — enforces rotation rules so a `petugas` is not assigned again until others have been used
- `enforce_jadwal_petugas_rotation()` — trigger function called before inserting/updating `jadwal_petugas`
- Sync triggers:
  - `jadwal_petugas_sync_penugasan` — after insert/update on `jadwal_petugas` to upsert `penugasan_petugas`
  - `jadwal_sync_penugasan` — sync changes from `jadwal` (date/time/status) to `penugasan_petugas`
- Confirmation helper functions:
  - `mark_penugasan_confirmed(...)`, `mark_penugasan_declined(...)`, `get_pending_confirmations(...)`

## Indexes and performance notes
- Indexes exist on frequent query fields: `petugas(wilayah, lingkungan)`, `jadwal(tanggal, jam)`, `penugasan_petugas(petugas_id)`, and partial indexes for pending confirmations.
- The rotation logic (`can_assign_petugas`) does comparative queries across `jadwal_petugas` and `jadwal` timestamps — ensure `jadwal.tanggal` + `jam` arithmetic performs well under load.

## Descriptive ERD (textual)
- `petugas` <1---N> `jadwal_petugas` <N---1> `jadwal`
- `jadwal` <1---N> `penugasan_petugas` <N---1> `petugas`
- `penugasan_petugas` <1---N> `penugasan_petugas_attendance_history`
- `jadwal_petugas` <1---N> `jadwal_petugas_swap_history`

---
For exact column definitions and constraints, see the SQL files under `db/migrations/` (start with `001_create_core_tables.sql` and follow sequential migrations).
