import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type JadwalRow = {
  id: number;
  tanggal: string;
  jam: string;
  petugas_id: number;
  nama_petugas: string;
  koordinator_id: number | null;
  nama_koordinator: string | null;
  status: "draft" | "terjadwal" | "selesai" | "batal";
  catatan: string | null;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!Number(id)) return badRequest("ID jadwal tidak valid.");

    const tanggal = body.tanggal ? String(body.tanggal).trim() : null;
    const jam = body.jam ? String(body.jam).trim() : null;
    const petugasId = body.petugas_id ? Number(body.petugas_id) : null;
    const koordinatorId =
      body.koordinator_id === undefined
        ? undefined
        : body.koordinator_id
          ? Number(body.koordinator_id)
          : null;
    const status = body.status ? String(body.status).trim() : null;
    const catatan =
      body.catatan === undefined
        ? undefined
        : String(body.catatan || "").trim() || null;

    const result = await query<JadwalRow>(
      `
        WITH updated AS (
          UPDATE jadwal
          SET
            tanggal = COALESCE($2::date, tanggal),
            jam = COALESCE($3::time, jam),
            petugas_id = COALESCE($4, petugas_id),
            koordinator_id = CASE WHEN $5::boolean THEN $6 ELSE koordinator_id END,
            status = COALESCE($7, status),
            catatan = CASE WHEN $8::boolean THEN $9 ELSE catatan END
          WHERE id = $1
          RETURNING *
        )
        SELECT
          u.id,
          u.tanggal::text AS tanggal,
          to_char(u.jam, 'HH24:MI') AS jam,
          u.petugas_id,
          p.nama AS nama_petugas,
          u.koordinator_id,
          k.nama AS nama_koordinator,
          u.status,
          u.catatan
        FROM updated u
        JOIN petugas p ON p.id = u.petugas_id
        LEFT JOIN koordinator k ON k.id = u.koordinator_id
      `,
      [
        Number(id),
        tanggal,
        jam,
        petugasId,
        koordinatorId !== undefined,
        koordinatorId ?? null,
        status,
        catatan !== undefined,
        catatan ?? null,
      ],
    );

    if (!result.rows[0]) return badRequest("Jadwal tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!Number(id)) return badRequest("ID jadwal tidak valid.");

    const result = await query<JadwalRow>(
      `
        WITH updated AS (
          UPDATE jadwal
          SET status = 'batal'
          WHERE id = $1
          RETURNING *
        )
        SELECT
          u.id,
          u.tanggal::text AS tanggal,
          to_char(u.jam, 'HH24:MI') AS jam,
          u.petugas_id,
          p.nama AS nama_petugas,
          u.koordinator_id,
          k.nama AS nama_koordinator,
          u.status,
          u.catatan
        FROM updated u
        JOIN petugas p ON p.id = u.petugas_id
        LEFT JOIN koordinator k ON k.id = u.koordinator_id
      `,
      [Number(id)],
    );

    if (!result.rows[0]) return badRequest("Jadwal tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
