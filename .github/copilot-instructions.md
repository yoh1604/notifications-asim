# Workspace Instructions: Asisten Imam Schedule Management App

## Project Overview

**Jadwal Asisten Imam** is a Next.js application for managing imam assistant schedules and sending WhatsApp notifications. It enables batch scheduling, data management, and automated WhatsApp messaging through the Fonnte API.

- **Language**: TypeScript + React 19
- **Framework**: Next.js 16.1.6 with App Router
- **Database**: Supabase
- **Styling**: Tailwind CSS v4
- **Target Users**: Indonesian organization (all text/comments in Indonesian)

## Tech Stack & Key Dependencies

| Purpose      | Package                    | Version   |
| ------------ | -------------------------- | --------- |
| Backend      | Next.js                    | 16.1.6    |
| UI Framework | React                      | 19.2.3    |
| Database     | @supabase/supabase-js      | 2.97.0    |
| CSV Parsing  | papaparse                  | 5.5.3     |
| Excel I/O    | xlsx                       | 0.18.5    |
| Styling      | @tailwindcss/postcss       | 4         |
| Linting      | eslint, eslint-config-next | 9, 16.1.6 |

## Project Structure

```
app/
├── page.tsx           # Main dashboard with 2 tabs: "Batch Jadwal" & "Converter Link WA"
├── layout.tsx         # Root layout (Poppins font, metadata)
├── globals.css        # Global styles
└── components/
    ├── List.tsx       # Displays asisten_imam from Supabase
    └── Uploader.tsx   # Uploads petugas data (Excel/CSV) to Supabase

lib/
└── supabase.ts        # Supabase client initialization

public/
└── data/
    └── asisten_imam.csv  # Local reference CSV data
```

## Environment Configuration

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_FONNTE_TOKEN=your_fonnte_whatsapp_token
```

**Note**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

## Common Development Tasks

### Setup & Installation

```bash
npm install                # Install dependencies
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
```

### Project Conventions

#### Code Style

- **Language**: Indonesian for comments, variable names, and UI text
- **Type Safety**: All components use TypeScript with type annotations
- **Client Components**: Use `"use client"` directive for interactive components
- **State Management**: React hooks (useState, useEffect)
- **Database**: Supabase queries via `supabase.from().select().order()`

#### Component Patterns

- **List.tsx**: Fetches data in useEffect, maps to card grid layout
- **Uploader.tsx**: File input with XLSX/CSV parsing, inserts to Supabase table
- **page.tsx**: Main dashboard component with tab navigation (state: `activeTab`):
  1. **Batch Jadwal Tab** - Admin panel for bulk schedule broadcast:
     - CSV file parsing (PapaParse) for bulk import
     - Data grouping by region (wilayah)
     - Admin authentication (password: "GEREJA123")
     - Batch WhatsApp sending via Fonnte API with delays
     - Excel template download
     - Activity logging to `logs` state array
  2. **Converter Link WA Tab** - Quick link & message generator:
     - CSV file import (same format: HARI/TANGGAL, JAM, NAMA PETUGAS, KOORDINATOR)
     - Generate wa.me links with pre-composed messages
     - Card display for each recipient with:
       - Recipient name, date, time, coordinator
       - "📋 Salin Link" button - copies wa.me link to clipboard
       - "📱 Kirim WA" button - opens wa.me link in new tab
     - "📊 Export Excel" button - exports all generated WA links to Excel file

#### Key Data Structures

**Asisten Imam (from CSV/Supabase)**:

```typescript
{
  Tanggal: string;        // Date (YYYY-MM-DD)
  Jam: string;            // Time (HH:mm)
  Nama_Petugas: string;   // Officer name
  Nama_Koordinator: string; // Coordinator name
  wilayah?: string;       // Region/area
}
```

**Petugas (Officer data in Supabase)**:

```typescript
{
  id: UUID;
  asisten_imam: string;
  no_hp: string; // Phone number
  wilayah: string; // Region
  lingkungan: string; // Environment/sub-area
}
```

### WhatsApp Integration (Fonnte API)

- **Endpoint**: `https://api.fonnte.com/send`
- **Auth**: Bearer token in header
- **Phone Format**: Converts to international format (62xxxx) automatically
- **Helper Function**: `sendWA(number: string, message: string)` in page.tsx
- **Batch Mode**: Implements delays between sends (120-180 seconds random, 3-minute pause every 10 messages)
- **Converter Mode**: Direct send with wa.me links (no batch delay)
- See: [page.tsx](app/page.tsx#L8-L26)

### Data Import/Export

- **CSV Loading**: Local CSV via PapaParse (`/data/asisten_imam.csv`)
- **Excel Export**: XLSX library for template download and converter results
- **Upload**: File → XLSX → Supabase table insertion
- **Converter Export**: Generated WA links exported to Excel with timestamp filename

## Debugging & Development Patterns

### Common Issues

1. **Supabase connection fails**: Check `.env.local` has correct URL/key, restart dev server
2. **WhatsApp sending fails**: Verify phone format and token validity
3. **CSV parsing fails**: Ensure CSV has required headers (Tanggal, Jam, Nama_Petugas, Nama_Koordinator)

### Logging Patterns

- Activity logged to `logs` state array
- Use `setLogs(prev => [...prev, "✅ Message"])` for UI feedback
- Console errors available in browser DevTools

## Architecture Decisions

1. **CSV-First Data Loading**: Initial data loaded from local CSV, can be persisted to Supabase
2. **Admin Gate**: Optional password authentication for batch operations
3. **Client-Side Processing**: Data grouping/filtering happens in React (useState/useEffect)
4. **API Integration**: Fonnte for WhatsApp, Supabase for persistence
5. **Tailwind v4 PostCSS**: Modern CSS with Tailwind features

## Common Development Workflows

### Add New Data Field

1. Update CSV structure in `public/data/asisten_imam.csv`
2. Add field to type definition in component
3. Update Supabase schema if persisting
4. Reflect in display templates (List.tsx or page.tsx)

### Modify WhatsApp Message

Edit the message template in `page.tsx` in the WhatsApp sending function.

### Export Converter Results

1. Upload CSV file in "Converter Link WA" tab
2. Click "📊 Export Excel" button after data is processed
3. Excel file will contain: Hari/Tanggal, Jam, Nama Petugas, Koordinator, No HP, Link WhatsApp, Status
4. File is saved with timestamp: `Link_WA_Converter_YYYY-MM-DDTHH-MM-SS.xlsx`

### Style Changes

Use Tailwind classes (className attribute). See `tailwind.config.ts` for customization.

## Testing & Validation

- **Type Checking**: `tsc --noEmit` (included in ESLint config)
- **Linting**: `npm run lint`
- **Manual Testing**: Use admin password to test batch operations

## Useful References

- [Next.js 16 Docs](https://nextjs.org/docs)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript)
- [Tailwind CSS v4](https://tailwindcss.com/docs/installation)
- [PapaParse CSV Parser](https://www.papaparse.com/)
- [Fonnte WhatsApp API](https://fonnte.com/)
