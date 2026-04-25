import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { transaction } from "@/lib/db";

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

type JadwalTargetRow = {
  id: number;
  jumlah_petugas: number;
  koordinator_id: number | null;
  assigned_count: number;
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
          'urutan', jp.urutan,
          'total_penugasan', COALESCE(pc.total_penugasan, 0)
        )
        ORDER BY jp.urutan ASC
      ) FILTER (WHERE jp.id IS NOT NULL),
      '[]'::jsonb
    ) AS petugas
  FROM jadwal j
  LEFT JOIN koordinator k ON k.id = j.koordinator_id
  LEFT JOIN jadwal_petugas jp ON jp.jadwal_id = j.id
  LEFT JOIN petugas p ON p.id = jp.petugas_id
  LEFT JOIN petugas_penugasan_count pc ON pc.petugas_id = p.id
  WHERE j.id = $1
  GROUP BY j.id, k.id
`;

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const jadwalId = Number(id);
    if (!jadwalId) return badRequest("ID jadwal tidak valid.");

    const data = await transaction(async (client) => {
      const targetResult = await client.query<JadwalTargetRow>(
        `
          WITH target AS (
            SELECT
              id,
              jumlah_petugas,
              koordinator_id
            FROM jadwal
            WHERE id = $1
              AND status = 'draft'
            FOR UPDATE
          )
          SELECT
            t.id::integer AS id,
            t.jumlah_petugas,
            t.koordinator_id,
            (
              SELECT count(*)::integer
              FROM jadwal_petugas jp
              WHERE jp.jadwal_id = t.id
            ) AS assigned_count
          FROM target t
        `,
        [jadwalId],
      );
      const target = targetResult.rows[0];

      if (!target) {
        throw new Error(
          "Jadwal tidak ditemukan, sudah dibatalkan, atau sudah tersimpan.",
        );
      }

      if (!target.koordinator_id) {
        throw new Error("Randomize dulu sebelum menyimpan jadwal.");
      }

      if (target.assigned_count !== target.jumlah_petugas) {
        throw new Error(
          "Jumlah petugas belum lengkap. Randomize dulu sebelum menyimpan jadwal.",
        );
      }

      await client.query(
        `
          UPDATE jadwal
          SET status = 'terjadwal'
          WHERE id = $1
        `,
        [jadwalId],
      );

      const updatedResult = await client.query<JadwalRow>(selectById, [
        jadwalId,
      ]);
      if (!updatedResult.rows[0]) {
        throw new Error("Jadwal tidak ditemukan setelah disimpan.");
      }

      return updatedResult.rows[0];
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
