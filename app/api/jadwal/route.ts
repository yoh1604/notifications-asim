import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

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
  petugas: Array<{
    id: number;
    nama: string;
    asisten_imam: string;
    no_hp: string | null;
    urutan: number;
  }>;
};

const jadwalSelect = `
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
`;

const jadwalGroupOrder = `
  GROUP BY j.id, k.id
  ORDER BY j.tanggal DESC, j.jam DESC, j.id DESC
`;

export async function GET() {
  try {
    const result = await query<JadwalRow>(`
      ${jadwalSelect}
      ${jadwalGroupOrder}
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
    const jumlahPetugas = Number(body.jumlah_petugas || body.jumlah || 0);
    const catatan = String(body.catatan || "").trim() || null;

    if (!tanggal) return badRequest("Tanggal jadwal wajib diisi.");
    if (!jam) return badRequest("Jam jadwal wajib diisi.");
    if (!jumlahPetugas || jumlahPetugas < 1) {
      return badRequest("Jumlah petugas wajib lebih dari 0.");
    }

    const result = await query<JadwalRow>(
      `
        WITH inserted AS (
          INSERT INTO jadwal (tanggal, jam, jumlah_petugas, status, catatan)
          VALUES ($1::date, $2::time, $3::integer, 'draft', $4)
          RETURNING *
        )
        SELECT
          i.id::integer AS id,
          i.tanggal::text AS tanggal,
          to_char(i.jam, 'HH24:MI') AS jam,
          i.jumlah_petugas,
          0::integer AS assigned_count,
          i.koordinator_id,
          NULL::text AS nama_koordinator,
          i.status,
          i.catatan,
          '[]'::jsonb AS petugas
        FROM inserted i
      `,
      [tanggal, jam, jumlahPetugas, catatan],
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
