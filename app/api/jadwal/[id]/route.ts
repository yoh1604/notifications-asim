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
  jumlah_petugas: number;
  assigned_count: number;
  koordinator_id: number | null;
  nama_koordinator: string | null;
  status: "draft" | "terjadwal" | "selesai" | "batal";
  catatan: string | null;
  petugas: unknown[];
};

const selectById = `
  SELECT
    j.id::integer AS id,
    j.tanggal::text AS tanggal,
    to_char(j.jam, 'HH24:MI') AS jam,
    j.jumlah_petugas,
    count(jp.id)::integer AS assigned_count,
    j.koordinator_id,
    k.nama AS nama_koordinator,
    j.status,
    j.catatan,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nama', p.nama,
          'asisten_imam', p.nama,
          'no_hp', p.no_hp,
          'urutan', jp.urutan
        )
        ORDER BY jp.urutan ASC
      ) FILTER (WHERE jp.id IS NOT NULL),
      '[]'::jsonb
    ) AS petugas
  FROM jadwal j
  LEFT JOIN koordinator k ON k.id = j.koordinator_id
  LEFT JOIN jadwal_petugas jp ON jp.jadwal_id = j.id
  LEFT JOIN petugas p ON p.id = jp.petugas_id
  WHERE j.id = $1
  GROUP BY j.id, k.id
`;

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!Number(id)) return badRequest("ID jadwal tidak valid.");

    const tanggal = body.tanggal ? String(body.tanggal).trim() : null;
    const jam = body.jam ? String(body.jam).trim() : null;
    const jumlahPetugas =
      body.jumlah_petugas === undefined ? null : Number(body.jumlah_petugas);
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

    if (
      jumlahPetugas !== null &&
      (!Number.isFinite(jumlahPetugas) || jumlahPetugas < 1)
    ) {
      return badRequest("Jumlah petugas wajib lebih dari 0.");
    }

    await query(
      `
        UPDATE jadwal
        SET
          tanggal = COALESCE($2::date, tanggal),
          jam = COALESCE($3::time, jam),
          jumlah_petugas = COALESCE($4::integer, jumlah_petugas),
          koordinator_id = CASE WHEN $5::boolean THEN $6 ELSE koordinator_id END,
          status = COALESCE($7, status),
          catatan = CASE WHEN $8::boolean THEN $9 ELSE catatan END
        WHERE id = $1
      `,
      [
        Number(id),
        tanggal,
        jam,
        jumlahPetugas,
        koordinatorId !== undefined,
        koordinatorId ?? null,
        status,
        catatan !== undefined,
        catatan ?? null,
      ],
    );

    const result = await query<JadwalRow>(selectById, [Number(id)]);
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

    await query(
      `
        UPDATE jadwal
        SET status = 'batal'
        WHERE id = $1
      `,
      [Number(id)],
    );

    const result = await query<JadwalRow>(selectById, [Number(id)]);
    if (!result.rows[0]) return badRequest("Jadwal tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
