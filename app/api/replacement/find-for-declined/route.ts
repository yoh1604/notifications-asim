import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { findAndAssignReplacement } from "@/lib/replacement-finder";

export const runtime = "nodejs";

/**
 * API: Find and assign replacement for declined officer
 * POST /api/replacement/find-for-declined
 *
 * Body:
 * {
 *   jadwal_petugas_id: number,
 *   declined_petugas_id: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jadwal_petugas_id, declined_petugas_id } = body as {
      jadwal_petugas_id?: unknown;
      declined_petugas_id?: unknown;
    };

    if (!jadwal_petugas_id || !declined_petugas_id) {
      return badRequest(
        "jadwal_petugas_id dan declined_petugas_id wajib diisi",
      );
    }

    const replacement = await findAndAssignReplacement(
      Number(jadwal_petugas_id),
      Number(declined_petugas_id),
    );

    if (!replacement) {
      return NextResponse.json(
        {
          error: "Tidak ada petugas pengganti yang cocok",
          jadwal_petugas_id,
          declined_petugas_id,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        status: "success",
        message: "Pengganti berhasil ditugaskan",
        replacement: {
          petugas_id: replacement.petugas_id,
          petugas_nama: replacement.petugas_nama,
          petugas_no_hp: replacement.petugas_no_hp,
          tanggal: replacement.tanggal,
          jam: replacement.jam,
          confirmation_status: replacement.confirmation_status,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint untuk info
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ready",
      message: "Replacement finder API is running",
      endpoint: "/api/replacement/find-for-declined",
      method: "POST",
    },
    { status: 200 },
  );
}
