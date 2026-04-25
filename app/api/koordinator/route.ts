import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type KoordinatorRow = {
  id: number;
  petugas_id: number | null;
  nama: string;
  no_hp: string | null;
  aktif: boolean;
};

export async function GET() {
  try {
    const result = await query<KoordinatorRow>(`
      SELECT id, petugas_id, nama, no_hp, aktif
      FROM koordinator
      ORDER BY nama ASC
    `);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const petugasId = body.petugas_id ? Number(body.petugas_id) : null;
    const nama = String(body.nama || "").trim();
    const noHp = String(body.no_hp || "").replace(/[^0-9]/g, "") || null;

    if (!nama) return badRequest("Nama koordinator wajib diisi.");

    const result = await query<KoordinatorRow>(
      `
        INSERT INTO koordinator (petugas_id, nama, no_hp, aktif)
        VALUES ($1, $2, $3, true)
        RETURNING id, petugas_id, nama, no_hp, aktif
      `,
      [petugasId, nama.toUpperCase(), noHp],
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
