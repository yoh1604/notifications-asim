import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type KoordinatorRow = {
  id: number;
  petugas_id: number | null;
  nama: string;
  no_hp: string | null;
  aktif: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const petugasId =
      body.petugas_id === undefined
        ? undefined
        : body.petugas_id
          ? Number(body.petugas_id)
          : null;
    const nama = body.nama ? String(body.nama).trim().toUpperCase() : null;
    const noHp =
      body.no_hp === undefined
        ? undefined
        : String(body.no_hp || "").replace(/[^0-9]/g, "") || null;
    const aktif =
      body.aktif === undefined ? undefined : Boolean(body.aktif);

    if (!Number(id)) return badRequest("ID koordinator tidak valid.");

    const result = await query<KoordinatorRow>(
      `
        UPDATE koordinator
        SET
          petugas_id = CASE WHEN $2::boolean THEN $3 ELSE petugas_id END,
          nama = COALESCE($4, nama),
          no_hp = CASE WHEN $5::boolean THEN $6 ELSE no_hp END,
          aktif = COALESCE($7, aktif)
        WHERE id = $1
        RETURNING id, petugas_id, nama, no_hp, aktif
      `,
      [
        Number(id),
        petugasId !== undefined,
        petugasId ?? null,
        nama,
        noHp !== undefined,
        noHp ?? null,
        aktif,
      ],
    );

    if (!result.rows[0]) return badRequest("Koordinator tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!Number(id)) return badRequest("ID koordinator tidak valid.");

    const result = await query<KoordinatorRow>(
      `
        UPDATE koordinator
        SET aktif = false
        WHERE id = $1
        RETURNING id, petugas_id, nama, no_hp, aktif
      `,
      [Number(id)],
    );

    if (!result.rows[0]) return badRequest("Koordinator tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
