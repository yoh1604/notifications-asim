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
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const nama = body.nama ? String(body.nama).trim().toUpperCase() : null;
    const wilayah = body.wilayah ? String(body.wilayah).trim() : null;
    const lingkungan =
      body.lingkungan === undefined
        ? undefined
        : String(body.lingkungan || "").trim() || null;
    const noHp =
      body.no_hp === undefined
        ? undefined
        : String(body.no_hp || "").replace(/[^0-9]/g, "") || null;
    const aktif =
      body.aktif === undefined ? undefined : Boolean(body.aktif);

    if (!Number(id)) return badRequest("ID petugas tidak valid.");

    const result = await query<PetugasRow>(
      `
        UPDATE petugas
        SET
          nama = COALESCE($2, nama),
          wilayah = COALESCE($3, wilayah),
          lingkungan = CASE WHEN $4::boolean THEN $5 ELSE lingkungan END,
          no_hp = CASE WHEN $6::boolean THEN $7 ELSE no_hp END,
          aktif = COALESCE($8, aktif)
        WHERE id = $1
        RETURNING
          id,
          nama,
          nama AS asisten_imam,
          wilayah,
          lingkungan,
          no_hp,
          aktif
      `,
      [
        Number(id),
        nama,
        wilayah,
        lingkungan !== undefined,
        lingkungan ?? null,
        noHp !== undefined,
        noHp ?? null,
        aktif,
      ],
    );

    if (!result.rows[0]) return badRequest("Petugas tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!Number(id)) return badRequest("ID petugas tidak valid.");

    const result = await query<PetugasRow>(
      `
        UPDATE petugas
        SET aktif = false
        WHERE id = $1
        RETURNING
          id,
          nama,
          nama AS asisten_imam,
          wilayah,
          lingkungan,
          no_hp,
          aktif
      `,
      [Number(id)],
    );

    if (!result.rows[0]) return badRequest("Petugas tidak ditemukan.");
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
