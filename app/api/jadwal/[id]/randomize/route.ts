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

type TargetRow = {
  id: number;
  tanggal: string;
  jam: string;
  jumlah_petugas: number;
};

type PetugasRow = {
  id: number;
  nama: string;
  no_hp: string | null;
  total_penugasan: number;
};

type KoordinatorRow = {
  id: number;
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
      const targetResult = await client.query<TargetRow>(
        `
          SELECT
            id::integer AS id,
            tanggal::text AS tanggal,
            to_char(jam, 'HH24:MI') AS jam,
            jumlah_petugas
          FROM jadwal
          WHERE id = $1
            AND status = 'draft'
          FOR UPDATE
        `,
        [jadwalId],
      );
      const target = targetResult.rows[0];
      if (!target) {
        throw new Error(
          "Jadwal tidak ditemukan, sudah dibatalkan, atau sudah tersimpan.",
        );
      }

      const petugasResult = await client.query<PetugasRow>(
        `
          SELECT
            p.id,
            p.nama,
            p.no_hp,
            pc.total_penugasan
          FROM petugas p
          LEFT JOIN LATERAL (
            SELECT count(*)::integer AS total_penugasan
            FROM penugasan_petugas pp
            WHERE pp.petugas_id = p.id
              AND pp.status <> 'batal'
              AND pp.jadwal_id <> $3::bigint
          ) pc ON true
          WHERE p.aktif = true
            AND can_assign_petugas(p.id, $1::date, $2::time, $3::bigint)
          ORDER BY pc.total_penugasan ASC, random()
          LIMIT $4
        `,
        [target.tanggal, target.jam, target.id, target.jumlah_petugas],
      );

      if (petugasResult.rows.length < target.jumlah_petugas) {
        throw new Error(
          "Jumlah petugas yang memenuhi aturan rotasi tidak cukup untuk jadwal ini.",
        );
      }

      const pickedPetugasIds = petugasResult.rows.map((item) => item.id);
      const coordinatorResult = await client.query<PetugasRow>(
        `
          SELECT
            p.id,
            p.nama,
            p.no_hp,
            pc.total_penugasan
          FROM petugas p
          LEFT JOIN LATERAL (
            SELECT count(*)::integer AS total_penugasan
            FROM penugasan_petugas pp
            WHERE pp.petugas_id = p.id
              AND pp.status <> 'batal'
              AND pp.jadwal_id <> $2::bigint
          ) pc ON true
          WHERE p.aktif = true
          ORDER BY CASE WHEN p.id = ANY($1::integer[]) THEN 1 ELSE 0 END,
                   pc.total_penugasan ASC,
                   random()
          LIMIT 1
        `,
        [pickedPetugasIds, target.id],
      );
      const coordinatorPetugas = coordinatorResult.rows[0];
      if (!coordinatorPetugas) {
        throw new Error("Belum ada petugas aktif untuk dijadikan koordinator.");
      }

      const koordinatorResult = await client.query<KoordinatorRow>(
        `
          INSERT INTO koordinator (petugas_id, nama, no_hp, aktif)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (upper(trim(nama))) DO UPDATE SET
            petugas_id = EXCLUDED.petugas_id,
            no_hp = EXCLUDED.no_hp,
            aktif = true,
            updated_at = now()
          RETURNING id
        `,
        [coordinatorPetugas.id, coordinatorPetugas.nama, coordinatorPetugas.no_hp],
      );
      const koordinatorId = koordinatorResult.rows[0].id;

      await client.query("DELETE FROM jadwal_petugas WHERE jadwal_id = $1", [
        jadwalId,
      ]);

      for (const [index, petugas] of petugasResult.rows.entries()) {
        await client.query(
          `
            INSERT INTO jadwal_petugas (jadwal_id, petugas_id, urutan)
            VALUES ($1, $2, $3)
          `,
          [jadwalId, petugas.id, index + 1],
        );
      }

      await client.query(
        `
          UPDATE jadwal
          SET
            koordinator_id = $2,
            status = 'terjadwal'
          WHERE id = $1
        `,
        [jadwalId, koordinatorId],
      );

      const updatedResult = await client.query<JadwalRow>(selectById, [
        jadwalId,
      ]);
      if (!updatedResult.rows[0]) {
        throw new Error("Jadwal tidak ditemukan setelah randomize.");
      }

      return updatedResult.rows[0];
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
