import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query, transaction } from "@/lib/db";

export const runtime = "nodejs";

type CheckInRequestBody = {
  penugasan_id?: number;
  note?: string;
};

type PenugasanRow = {
  id: number;
  jadwal_id: number;
  petugas_id: number;
  tanggal: string;
  jam: string;
  status: string;
  attendance_status: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckInRequestBody;
    const penugasanId = Number(body.penugasan_id ?? 0);
    const note = body.note ? String(body.note).trim() : null;

    if (!penugasanId) {
      return badRequest("ID penugasan wajib diisi.");
    }

    const data = await transaction(async (client) => {
      const penugasanResult = await client.query<PenugasanRow>(
        `
          SELECT
            pp.id::integer AS id,
            pp.jadwal_id::integer AS jadwal_id,
            pp.petugas_id::integer AS petugas_id,
            pp.tanggal::text AS tanggal,
            to_char(pp.jam, 'HH24:MI') AS jam,
            pp.status,
            pp.attendance_status
          FROM penugasan_petugas pp
          WHERE pp.id = $1
          FOR UPDATE
        `,
        [penugasanId],
      );

      const penugasan = penugasanResult.rows[0];
      if (!penugasan) {
        throw new Error("Penugasan tidak ditemukan.");
      }

      if (penugasan.status !== "terjadwal") {
        throw new Error(
          "Hanya penugasan yang berstatus terjadwal dapat dicheck-in.",
        );
      }

      if (
        penugasan.attendance_status &&
        penugasan.attendance_status !== "pending"
      ) {
        throw new Error("Kehadiran sudah dicatat dan tidak bisa diubah lagi.");
      }

      const currentDateResult = await client.query<{ today: string }>(
        `SELECT CURRENT_DATE::text AS today`,
      );
      const currentDate = currentDateResult.rows[0]?.today;
      if (!currentDate || currentDate < penugasan.tanggal) {
        throw new Error(
          "Check-in tidak dapat dilakukan sebelum hari penugasan. Check-in hanya bisa dilakukan pada hari H atau setelahnya.",
        );
      }

      const updatedResult = await client.query<PenugasanRow>(
        `
          UPDATE penugasan_petugas
          SET
            attendance_status = 'attended',
            attendance_checked_in_at = now()
          WHERE id = $1
            AND attendance_status = 'pending'
          RETURNING
            id::integer AS id,
            jadwal_id::integer AS jadwal_id,
            petugas_id::integer AS petugas_id,
            tanggal::text AS tanggal,
            to_char(jam, 'HH24:MI') AS jam,
            status,
            attendance_status
        `,
        [penugasanId],
      );

      if (!updatedResult.rows[0]) {
        throw new Error(
          "Check-in gagal diproses. Pastikan penugasan dalam keadaan pending.",
        );
      }

      await client.query(
        `
          INSERT INTO penugasan_petugas_attendance_history (
            penugasan_petugas_id,
            action,
            note
          ) VALUES ($1, 'checked_in', $2)
        `,
        [penugasanId, note],
      );

      return updatedResult.rows[0];
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
