# 🎯 Attendance Confirmation Feature - Complete Setup Guide

## Overview

The Attendance Confirmation feature enables the system to:
1. Send WhatsApp confirmation requests after schedule generation
2. Track responses (BISA = Confirmed, TIDAK = Declined)
3. Automatically find and assign replacements for declined slots
4. Display confirmation status on the admin dashboard with color indicators

---

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Admin Dashboard (Frontend)                                   │
│ - Schedule Grid with color indicators (Yellow/Green/Red)    │
│ - Replace Declined button triggers replacement flow         │
└──────────────────┬──────────────────────────────────────────┘
                   │
       ┌───────────┴────────────┬────────────────┐
       │                        │                │
       ▼                        ▼                ▼
┌─────────────┐    ┌──────────────────┐   ┌──────────────┐
│ Randomizer  │    │ Webhook Handler  │   │ Replacement  │
│ API Route   │    │ /webhook/fonnte/ │   │ Finder API   │
│ Sends msgs  │    │ confirm (POST)   │   │              │
└─────────────┘    │ Processes replies│   └──────────────┘
       │            └──────────────────┘
       │                     │
       ▼                     ▼
    Database: penugasan_petugas
    - confirmation_status (pending/confirmed/declined)
    - confirmation_sent_at
    - confirmation_received_at
    - confirmation_message
```

---

## 🗄️ Database Schema

### New Columns Added to `penugasan_petugas`:

```sql
ALTER TABLE penugasan_petugas ADD COLUMN (
  confirmation_status TEXT DEFAULT 'pending',           -- pending|confirmed|declined
  confirmation_sent_at TIMESTAMPTZ,                      -- When message was sent
  confirmation_received_at TIMESTAMPTZ,                  -- When reply received
  confirmation_message TEXT                              -- The reply content
);
```

### New Helper Functions:

1. **`mark_penugasan_confirmed(petugas_id, jadwal_id)`** - Mark as confirmed
2. **`mark_penugasan_declined(petugas_id, jadwal_id, reason)`** - Mark as declined
3. **`get_pending_confirmations(jadwal_id)`** - Get all pending confirmations

---

## 🔄 Implementation Flow

### Step 1: Run Database Migration

```bash
npm run migrate  # Run all migrations including 010_add_confirmation_status.sql
```

This adds the confirmation status columns and helper functions.

---

### Step 2: Send Confirmation Messages After Randomization

When the randomizer generates a schedule, send WhatsApp confirmation messages:

**File to Update:** `app/api/jadwal/[id]/randomize/route.ts`
4
Add after successful randomization:

```typescript
import { sendConfirmationMessage, formatTanggalIndonesia } from "@/lib/confirmation-messages";

// After successfully inserting jadwal_petugas...

// Send confirmation messages to all assigned officers
for (const petugas of petugasResult.rows) {
  if (petugas.no_hp) {
    const { hari, tanggal } = formatTanggalIndonesia(new Date(target.tanggal));
    
    await sendConfirmationMessage(
      petugas.no_hp,
      "request",  // Template type
      {
        petugas_nama: petugas.nama,
        tanggal,
        jam: target.jam,
        hari,
      }
    );

    // Update confirmation_sent_at in database
    await client.query(
      `UPDATE penugasan_petugas
       SET confirmation_sent_at = now()
       WHERE jadwal_id = $1 AND petugas_id = $2`,
      [jadwalId, petugas.id]
    );
  }
}
```

---

### Step 3: Configure Fonnte Webhook

1. **In Fonnte Dashboard:**
   - Go to Settings → Webhooks
   - Add webhook URL: `https://yourdomain.com/api/webhook/fonnte/confirm`
   - Set method: POST
   - Select: "Received Messages" event

2. **Webhook expects to receive:**
   ```json
   {
     "device_id": "123456",
     "sender": "6281234567890",
     "message": "BISA",
     "name": "John Doe",
     "timestamp": 1726518000000
   }
   ```

---

### Step 4: Test Webhook

```bash
curl -X POST http://localhost:3000/api/webhook/fonnte/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test",
    "sender": "081234567890",
    "message": "BISA",
    "name": "Petugas Test"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Konfirmasi kehadiran telah diproses",
  "petugas": "Petugas Test",
  "jadwal_date": "2026-05-15",
  "jadwal_time": "08:00",
  "confirmation_status": "confirmed"
}
```

---

### Step 5: Create Admin Dashboard Replacement Feature

**File:** `app/components/ConfirmationStatus.tsx` (Create new component)

```typescript
"use client";
import { ConfirmationStatus } from "@/lib/types";

interface ConfirmationStatusProps {
  status: ConfirmationStatus;
  sent_at?: string | null;
  received_at?: string | null;
}

export function ConfirmationStatusBadge({
  status,
  sent_at,
  received_at,
}: ConfirmationStatusProps) {
  const statusColors = {
    pending: "bg-yellow-200 text-yellow-800",    // Yellow - waiting
    confirmed: "bg-green-200 text-green-800",    // Green - confirmed
    declined: "bg-red-200 text-red-800",         // Red - declined
  };

  const statusLabels = {
    pending: "⏳ Menunggu",
    confirmed: "✅ Dikonfirmasi",
    declined: "❌ Ditolak",
  };

  return (
    <div className={`px-3 py-1 rounded text-sm font-semibold ${statusColors[status]}`}>
      {statusLabels[status]}
    </div>
  );
}
```

**In your schedule display component:**

```typescript
import { ConfirmationStatusBadge } from "@/components/ConfirmationStatus";
import { findAndAssignReplacement } from "@/lib/replacement-finder";

// In your schedule grid...
{petugas.map((officer) => (
  <div key={officer.id} className="border p-4 rounded">
    <p className="font-bold">{officer.nama}</p>
    
    {/* Confirmation Status Badge */}
    <div className="mt-2">
      <ConfirmationStatusBadge 
        status={officer.confirmation_status}
        sent_at={officer.confirmation_sent_at}
        received_at={officer.confirmation_received_at}
      />
    </div>

    {/* Replacement Button - Only show if declined */}
    {officer.confirmation_status === "declined" && (
      <button
        onClick={() => handleFindReplacement(officer.id, jadwal_id)}
        className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        🔄 Cari Pengganti
      </button>
    )}
  </div>
))}
```

**Handler function:**

```typescript
async function handleFindReplacement(jadwalPetugasId: number, jadwalId: number) {
  try {
    const response = await fetch("/api/replacement/find-for-declined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jadwal_petugas_id: jadwalPetugasId,
        declined_petugas_id: officer.id,
      }),
    });

    if (!response.ok) {
      alert("Tidak ada petugas pengganti yang cocok");
      return;
    }

    const result = await response.json();
    alert(`✅ ${result.replacement.petugas_nama} telah ditugaskan sebagai pengganti`);
    
    // Refresh schedule
    location.reload();
  } catch (error) {
    console.error("Error finding replacement:", error);
    alert("Gagal mencari pengganti");
  }
}
```

---

## 📊 Query Examples for Dashboard

### Get Schedule with Confirmation Status

```sql
SELECT
  j.id,
  j.tanggal,
  j.jam,
  p.nama,
  p.no_hp,
  pp.confirmation_status,
  pp.confirmation_sent_at,
  pp.confirmation_received_at
FROM jadwal j
JOIN jadwal_petugas jp ON jp.jadwal_id = j.id
JOIN petugas p ON p.id = jp.petugas_id
LEFT JOIN penugasan_petugas pp ON pp.jadwal_petugas_id = jp.id
WHERE j.tanggal >= CURRENT_DATE
ORDER BY j.tanggal DESC, j.jam DESC;
```

### Get Pending Confirmations

```sql
SELECT
  pp.id,
  p.nama,
  j.tanggal,
  j.jam,
  pp.confirmation_sent_at,
  EXTRACT(HOUR FROM (NOW() - pp.confirmation_sent_at)) as hours_waiting
FROM penugasan_petugas pp
JOIN petugas p ON p.id = pp.petugas_id
JOIN jadwal j ON j.id = pp.jadwal_id
WHERE pp.confirmation_status = 'pending'
  AND j.tanggal >= CURRENT_DATE
ORDER BY pp.confirmation_sent_at ASC;
```

### Get Declined & Ready for Replacement

```sql
SELECT
  jp.id as jadwal_petugas_id,
  p.nama as declined_petugas,
  j.tanggal,
  j.jam
FROM penugasan_petugas pp
JOIN jadwal_petugas jp ON jp.id = pp.jadwal_petugas_id
JOIN petugas p ON p.id = pp.petugas_id
JOIN jadwal j ON j.id = pp.jadwal_id
WHERE pp.confirmation_status = 'declined'
  AND j.status = 'draft'  -- Still in draft, can be replaced
ORDER BY j.tanggal DESC;
```

---

## 🚀 Workflow Summary

### For Officers:

1. **Randomizer creates schedule** → Status: `pending`
2. **WhatsApp message sent** → `confirmation_sent_at` set
3. **Officer replies with BISA/TIDAK** → Webhook processes
4. **Status updated** → `confirmed` or `declined` + `confirmation_received_at` set
5. **Auto-reply sent** to officer confirming their response

### For Admin:

1. **View dashboard** → See color-coded confirmations
2. **Click "Cari Pengganti"** on declined slot
3. **System finds random replacement** → Must meet rotation rules
4. **Replacement assigned** → New confirmation message sent to replacement
5. **Replacement replies** → Status updated again

---

## 🔐 Environment Variables

Ensure `.env.local` has:

```env
NEXT_PUBLIC_FONNTE_TOKEN=your_token_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

---

## 📱 Message Templates Summary

| Template | When Sent | Content |
|----------|-----------|---------|
| **Request** | After randomization | Initial confirmation request |
| **Reminder** | 1-2 hours before shift | Reminder for pending confirmations |
| **Replacement** | When finding replacement | Urgent replacement notification |
| **Confirmed** | Auto-reply | Acknowledgment of "BISA" |
| **Declined** | Auto-reply | Acknowledgment of "TIDAK" + replacement search notice |

---

## ⚠️ Error Handling & Edge Cases

### What if no replacement found?

The system:
1. Logs an error
2. Returns 404 status
3. Admin can manually reassign or retry

### What if officer replies with invalid message?

The system:
1. Sends auto-reply: "Mohon gunakan BISA atau TIDAK"
2. Doesn't change confirmation status
3. Officer can reply again

### What if same officer declines multiple times?

Each decline is tracked separately:
- Each confirmation request gets `confirmation_sent_at`
- Each reply updates `confirmation_received_at`
- Most recent status is kept

---

## 🧪 Testing Checklist

- [ ] Database migration runs successfully
- [ ] Confirmation status columns created
- [ ] Helper functions accessible
- [ ] Webhook accepts POST requests
- [ ] Message template formats correctly
- [ ] Phone number normalization works
- [ ] Replacement finder identifies eligible candidates
- [ ] Color indicators display on dashboard
- [ ] Replacement button triggers API call
- [ ] Decline notification auto-reply sends

---

## 📝 Files Created/Modified

### New Files:
- `db/migrations/010_add_confirmation_status.sql` - Database schema
- `app/api/webhook/fonnte/confirm/route.ts` - Webhook handler
- `app/api/replacement/find-for-declined/route.ts` - Replacement API
- `lib/replacement-finder.ts` - Replacement logic
- `lib/confirmation-messages.ts` - Message templates

### Modified Files:
- `lib/types.ts` - Added `ConfirmationStatus` and `PenugasanPetugas` types

### Files to Update (in your dashboard):
- `app/components/[your-schedule-component].tsx` - Add confirmation UI
- `app/api/jadwal/[id]/randomize/route.ts` - Send confirmation messages

---

## 🔗 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/webhook/fonnte/confirm` | Receive WhatsApp replies |
| `POST` | `/api/replacement/find-for-declined` | Find and assign replacement |
| `GET` | `/api/webhook/fonnte/confirm` | Health check |

---

## 📞 Support

For questions or issues:
1. Check webhook logs: `GET /api/webhook/fonnte/confirm`
2. Verify phone numbers in `petugas` table
3. Ensure Fonnte webhook is configured correctly
4. Check database migration applied successfully
