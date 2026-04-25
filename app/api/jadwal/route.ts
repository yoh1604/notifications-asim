import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

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

const jadwalSelect = `
  SELECT
    j.id,
    j.tanggal::text AS tanggal,
    to_char(j.jam, 'HH24:MI') AS jam,
    j.petugas_id,
    p.nama AS nama_petugas,
    j.koordinator_id,
    k.nama AS nama_koordinator,
    j.status,
    j.catatan
  FROM jadwal j
  JOIN petugas p ON p.id = j.petugas_id
  LEFT JOIN koordinator k ON k.id = j.koordinator_id
`;

export async function GET() {
  try {
    const result = await query<JadwalRow>(`
      ${jadwalSelect}
      ORDER BY j.tanggal DESC, j.jam DESC, j.id DESC
      LIMIT 200
    `);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tanggal = String(body.tanggal || "").trim();
    const jam = String(body.jam || "").trim();
    const petugasId = Number(body.petugas_id);
    const koordinatorId = body.koordinator_id ? Number(body.koordinator_id) : null;
    const catatan = String(body.catatan || "").trim() || null;

    if (!tanggal) return badRequest("Tanggal jadwal wajib diisi.");
    if (!jam) return badRequest("Jam jadwal wajib diisi.");
    if (!petugasId) return badRequest("Petugas wajib dipilih.");

    const result = await query<JadwalRow>(
      `
        WITH inserted AS (
          INSERT INTO jadwal (tanggal, jam, petugas_id, koordinator_id, catatan)
          VALUES ($1::date, $2::time, $3, $4, $5)
          RETURNING *
        )
        SELECT
          i.id,
          i.tanggal::text AS tanggal,
          to_char(i.jam, 'HH24:MI') AS jam,
          i.petugas_id,
          p.nama AS nama_petugas,
          i.koordinator_id,
          k.nama AS nama_koordinator,
          i.status,
          i.catatan
        FROM inserted i
        JOIN petugas p ON p.id = i.petugas_id
        LEFT JOIN koordinator k ON k.id = i.koordinator_id
      `,
      [tanggal, jam, petugasId, koordinatorId, catatan],
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
