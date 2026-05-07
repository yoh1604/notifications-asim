# Attendance Management Feature - Implementation Guide

## Overview

A unified attendance management page has been created to handle check-in and officer swapping operations for scheduled assignments.

## 📁 Files Created

### Frontend Components

- **`app/components/AttendanceManager.tsx`** - Main attendance management component with date/time picker, officer list, and swap modal
- **`app/attendance/page.tsx`** - Page wrapper for the attendance manager

### API Endpoints

- **`app/api/jadwal/check-in/route.ts`** - POST endpoint for marking attendance
- **`app/api/jadwal/swap/route.ts`** - POST endpoint for swapping officers (manual or automatic)
- **`app/api/jadwal/[id]/attendance/route.ts`** - GET endpoint to fetch attendance status for a specific schedule

### Database Migration

- **`db/migrations/011_add_attendance_status.sql`** - Adds attendance tracking and swap history tables

---

## 🚀 How to Use

### 1. Accessing the Page

Navigate to `/attendance` in your application to open the Attendance Management page.

### 2. Date & Time Selection

- Select a **Date** from the date picker
- Select a **Time** from the time picker
- The page automatically fetches and displays the schedule for that date/time

### 3. Officer Management

#### Check-in (Hadir)

- Click the **"✓ Hadir"** button next to an officer
- Once checked in, the button converts to a disabled badge showing **"✅ Attended"** with the check-in timestamp
- The check-in timestamp is recorded in `penugasan_petugas_attendance_history`

#### Officer Swap (Ganti)

- Click the **"🔄 Ganti"** button next to an officer
- A modal opens with two options:
  - **Manual**: Select a replacement from a dropdown of available officers
  - **Automatic**: System automatically finds a fair replacement using the Smart Randomizer logic
- Submit to confirm the swap
- The system records the swap in `jadwal_petugas_swap_history`

### 4. Immutability Lock

- Once a schedule date is marked as **"selesai"** (completed), all attendance and swap operations are **locked**
- Both "Check-in" and "Swap" buttons become disabled
- A warning banner displays: "⚠️ Jadwal ini sudah terkunci. Attendance status tidak dapat diubah."

---

## 🗄️ Database Schema

### New Tables

#### `penugasan_petugas_attendance_history`

Tracks all check-in actions with timestamps and notes.

```sql
- id (Primary Key)
- penugasan_petugas_id (Foreign Key to penugasan_petugas)
- action (e.g., 'checked_in')
- note (Optional notes)
- created_at (Timestamp)
```

#### `jadwal_petugas_swap_history`

Records all officer swaps with source/destination and mode information.

```sql
- id (Primary Key)
- jadwal_id (Foreign Key to jadwal)
- jadwal_petugas_id (Reference to the assignment)
- from_petugas_id (Original officer ID)
- to_petugas_id (Replacement officer ID)
- mode ('manual' or 'random')
- note (Optional notes)
- created_at (Timestamp)
```

### Modified Table: `penugasan_petugas`

Two new columns added:

```sql
- attendance_status text (DEFAULT 'pending', CHECK IN ('pending', 'attended'))
- attendance_checked_in_at timestamptz (NULL until check-in)
```

---

## 🔌 API Endpoints Reference

### POST `/api/jadwal/check-in`

Marks an officer as attended for a specific assignment.

**Request Body:**

```json
{
  "penugasan_id": 123,
  "note": "Optional check-in note"
}
```

**Response:**

```json
{
  "data": {
    "id": 123,
    "jadwal_id": 456,
    "petugas_id": 789,
    "attendance_status": "attended"
  }
}
```

**Validation:**

- Check-in only allowed on the actual schedule date (CURRENT_DATE must match `penugasan_petugas.tanggal`)
- Cannot check-in twice (immutable after first check-in)
- Only works for assignments with status 'terjadwal'

---

### POST `/api/jadwal/swap`

Swaps an officer with a replacement (manual or automatic).

**Request Body (Manual Mode):**

```json
{
  "jadwal_id": 456,
  "jadwal_petugas_id": 123,
  "mode": "manual",
  "petugas_pengganti_id": 999
}
```

**Request Body (Random Mode):**

```json
{
  "jadwal_id": 456,
  "jadwal_petugas_id": 123,
  "mode": "random"
}
```

**Response:**

```json
{
  "data": {
    "schedule": { ...updated jadwal data... },
    "swapped": {
      "from_petugas_id": 789,
      "to_petugas_id": 999,
      "mode": "manual"
    }
  }
}
```

**Validation:**

- Replacement officer must be active (`aktif = true`)
- Cannot swap to same officer
- Replacement cannot already be assigned to the same schedule
- Must pass Smart Randomizer rotation rules
- Cannot swap if schedule status is 'selesai' (completed)
- Cannot swap if the original officer has already checked in

---

### GET `/api/jadwal/[id]/attendance`

Fetches current attendance status for all officers in a specific schedule.

**Response:**

```json
{
  "data": [
    {
      "jadwal_petugas_id": 123,
      "penugasan_id": 456,
      "petugas_id": 789,
      "attendance_status": "pending",
      "attendance_checked_in_at": null
    },
    {
      "jadwal_petugas_id": 124,
      "penugasan_id": 457,
      "petugas_id": 790,
      "attendance_status": "attended",
      "attendance_checked_in_at": "2026-05-04T17:45:30.123Z"
    }
  ]
}
```

---

## 🎨 UI Features

### Loading States

- Spinner shown while fetching schedule
- Buttons disabled during API calls
- Toast notifications for success/error feedback

### Status Badges

- **⏳ Menunggu** (Pending) - Yellow badge for officers awaiting check-in
- **✅ Hadir** (Attended) - Green badge with check-in timestamp for confirmed attendance

### Toast Notifications

- Success: Green toast with ✅ icon
- Error: Red toast with error message
- Info: Blue toast for informational messages
- Auto-dismiss after 4 seconds

### Responsive Design

- Works on desktop, tablet, and mobile
- Tailwind CSS styling for consistent appearance
- Modal overlay for swap dialog with smooth transitions

---

## 🔐 Security Considerations

1. **Date Lock**: Once a schedule is marked 'selesai', no modifications are allowed
2. **Immutable Check-in**: Check-in cannot be undone or modified after confirmation
3. **Swap History**: All swaps are recorded with timestamps and user intent (manual/random)
4. **Rotation Enforcement**: Swaps respect the Smart Randomizer rules to prevent officer overload

---

## 🔄 Workflow Example

### Typical Day-of-Service Flow

1. **Admin opens** `/attendance` page
2. **Admin selects** the current date and service time
3. **System loads** the schedule with current attendance status
4. **For each officer:**
   - If officer is present: Click "✓ Hadir" → Check-in confirmed with timestamp
   - If officer is absent: Click "🔄 Ganti" → Select replacement → Confirm swap
5. **After all officers** processed, schedule status changes to 'selesai' (locked)
6. **Attendance history** and **swap history** fully documented for records

---

## 📋 Testing Checklist

- [ ] Navigate to `/attendance` page successfully
- [ ] Date/time picker works and filters schedules correctly
- [ ] Officers display with correct urutan (order) and total_penugasan count
- [ ] Check-in button works and creates history record
- [ ] Check-in is immutable (button disabled after first check-in)
- [ ] Swap modal opens with manual/random options
- [ ] Manual mode shows available officers dropdown
- [ ] Random mode shows confirmation message
- [ ] Swap updates both old and new officer assignments
- [ ] Swap history is recorded
- [ ] Schedule lock works after status = 'selesai'
- [ ] Toast notifications display for all actions
- [ ] Refresh on success shows updated data
- [ ] Error messages display for invalid operations

---

## 🚦 Next Steps (Optional)

1. **Add Admin Authentication** - Protect the attendance page with role-based access
2. **Batch Check-in** - Allow checking in multiple officers at once
3. **Export Report** - Generate attendance reports by date range
4. **WhatsApp Notifications** - Send swap notifications to affected officers via Fonnte
5. **Mobile App Integration** - Create mobile-friendly check-in interface
