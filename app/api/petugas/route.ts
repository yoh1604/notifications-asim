import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type PetugasRow = {
  id: number;
  nama: string;
  asisten_imam: string;
  wilayah: string;
  lingkungan: string | null;
  no_hp: string | null;
  aktif: boolean;
  eligible?: boolean;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tanggal = url.searchParams.get("eligible_tanggal");
    const jam = url.searchParams.get("eligible_jam") || "00:00";

    if (tanggal) {
      const result = await query<PetugasRow>(
        `
          SELECT
            id,
            nama,
            nama AS asisten_imam,
            wilayah,
            lingkungan,
            no_hp,
            aktif,
            can_assign_petugas(id, $1::date, $2::time) AS eligible
          FROM petugas
          WHERE aktif = true
          ORDER BY wilayah ASC, lingkungan ASC NULLS LAST, nama ASC
        `,
        [tanggal, jam],
      );

      return NextResponse.json({ data: result.rows });
    }

    const result = await query<PetugasRow>(`
      SELECT
        id,
        nama,
        nama AS asisten_imam,
        wilayah,
        lingkungan,
        no_hp,
        aktif
      FROM petugas
      ORDER BY wilayah ASC, lingkungan ASC NULLS LAST, nama ASC
    `);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nama = String(body.nama || body.asisten_imam || "").trim();
    const wilayah = String(body.wilayah || "Tanpa Wilayah").trim();
    const lingkungan = String(body.lingkungan || "").trim() || null;
    const noHp = String(body.no_hp || "").replace(/[^0-9]/g, "") || null;

    if (!nama) return badRequest("Nama petugas wajib diisi.");

    const result = await query<PetugasRow>(
      `
        INSERT INTO petugas (nama, wilayah, lingkungan, no_hp, aktif)
        VALUES ($1, $2, $3, $4, true)
        RETURNING
          id,
          nama,
          nama AS asisten_imam,
          wilayah,
          lingkungan,
          no_hp,
          aktif
      `,
      [nama.toUpperCase(), wilayah || "Tanpa Wilayah", lingkungan, noHp],
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
