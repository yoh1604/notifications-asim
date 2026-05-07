import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AttendanceRow = {
  jadwal_petugas_id: number;
  penugasan_id: number;
  petugas_id: number;
  attendance_status: string;
  attendance_checked_in_at: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const jadwalId = Number(id);

    if (!jadwalId) return badRequest("ID jadwal tidak valid.");

    await query(
      `
        INSERT INTO penugasan_petugas (
          jadwal_id,
          jadwal_petugas_id,
          petugas_id,
          tanggal,
          jam,
          status
        )
        SELECT
          j.id,
          jp.id,
          jp.petugas_id,
          j.tanggal,
          j.jam,
          CASE WHEN j.status = 'batal' THEN 'batal' ELSE 'terjadwal' END
        FROM jadwal_petugas jp
        JOIN jadwal j ON j.id = jp.jadwal_id
        WHERE jp.jadwal_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM penugasan_petugas pp
            WHERE pp.jadwal_petugas_id = jp.id
          )
      `,
      [jadwalId],
    );

    const result = await query<AttendanceRow>(
      `
        SELECT
          jp.id::integer AS jadwal_petugas_id,
          pp.id::integer AS penugasan_id,
          pp.petugas_id,
          pp.attendance_status,
          pp.attendance_checked_in_at
        FROM jadwal_petugas jp
        JOIN penugasan_petugas pp ON pp.jadwal_petugas_id = jp.id
        WHERE jp.jadwal_id = $1
        ORDER BY jp.urutan ASC
      `,
      [jadwalId],
    );

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
