import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PetugasRow = {
  id: number;
  nama: string;
  asisten_imam: string;
  wilayah: string;
  lingkungan: string | null;
  no_hp: string | null;
  aktif: boolean;
  total_penugasan: number;
};

type PenugasanRow = {
  id: number;
  jadwal_id: number;
  tanggal: string;
  jam: string;
  status: string;
  nama_koordinator: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const petugasId = Number(id);
    if (!petugasId) return badRequest("ID petugas tidak valid.");

    const petugasResult = await query<PetugasRow>(
      `
        SELECT
          p.id,
          p.nama,
          p.nama AS asisten_imam,
          p.wilayah,
          p.lingkungan,
          p.no_hp,
          p.aktif,
          COALESCE(pc.total_penugasan, 0)::integer AS total_penugasan
        FROM petugas p
        LEFT JOIN petugas_penugasan_count pc ON pc.petugas_id = p.id
        WHERE p.id = $1
      `,
      [petugasId],
    );

    if (!petugasResult.rows[0]) return badRequest("Petugas tidak ditemukan.");

    const penugasanResult = await query<PenugasanRow>(
      `
        SELECT
          pp.id::integer AS id,
          pp.jadwal_id::integer AS jadwal_id,
          pp.tanggal::text AS tanggal,
          to_char(pp.jam, 'HH24:MI') AS jam,
          pp.status,
          k.nama AS nama_koordinator
        FROM penugasan_petugas pp
        JOIN jadwal j ON j.id = pp.jadwal_id
        LEFT JOIN koordinator k ON k.id = j.koordinator_id
        WHERE pp.petugas_id = $1
          AND pp.status <> 'batal'
        ORDER BY pp.tanggal DESC, pp.jam DESC, pp.id DESC
      `,
      [petugasId],
    );

    return NextResponse.json({
      data: {
        petugas: petugasResult.rows[0],
        penugasan: penugasanResult.rows,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
