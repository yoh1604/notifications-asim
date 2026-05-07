import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query, transaction } from "@/lib/db";

export const runtime = "nodejs";

type SwapRequestBody = {
  jadwal_id?: number;
  jadwal_petugas_id?: number;
  mode?: "manual" | "random";
  petugas_pengganti_id?: number;
};

type SwapTargetRow = {
  id: number;
  jadwal_id: number;
  current_petugas_id: number;
  urutan: number;
  tanggal: string;
  jam: string;
  status: string;
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

const selectJadwalById = `
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SwapRequestBody;
    const jadwalId = Number(body.jadwal_id ?? 0);
    const jadwalPetugasId = Number(body.jadwal_petugas_id ?? 0);
    const mode = String(body.mode || "")
      .trim()
      .toLowerCase();
    const petugasPenggantiId = Number(body.petugas_pengganti_id ?? 0);

    if (!jadwalId || !jadwalPetugasId) {
      return badRequest("ID jadwal dan ID penugasan wajib diisi.");
    }

    if (mode !== "manual" && mode !== "random") {
      return badRequest("Mode harus 'manual' atau 'random'.");
    }

    if (mode === "manual" && !petugasPenggantiId) {
      return badRequest("petugas_pengganti_id wajib untuk mode manual.");
    }

    const data = await transaction(async (client) => {
      const targetResult = await client.query<SwapTargetRow>(
        `
          SELECT
            jp.id::integer AS id,
            jp.jadwal_id::integer AS jadwal_id,
            jp.petugas_id::integer AS current_petugas_id,
            jp.urutan::integer AS urutan,
            j.tanggal::text AS tanggal,
            to_char(j.jam, 'HH24:MI') AS jam,
            j.status
          FROM jadwal_petugas jp
          JOIN jadwal j ON j.id = jp.jadwal_id
          WHERE jp.id = $1
            AND jp.jadwal_id = $2
            AND j.status <> 'batal'
          FOR UPDATE
        `,
        [jadwalPetugasId, jadwalId],
      );

      const target = targetResult.rows[0];
      if (!target) {
        throw new Error(
          "Penugasan jadwal tidak ditemukan atau jadwal sudah batal.",
        );
      }

      if (target.status === "selesai") {
        throw new Error("Jadwal sudah selesai dan tidak dapat diganti.");
      }

      let replacementPetugasId = 0;
      if (mode === "manual") {
        const replacementResult = await client.query<{ id: number }>(
          `
            SELECT p.id
            FROM petugas p
            WHERE p.id = $1
              AND p.aktif = true
              AND p.id <> $2
              AND NOT EXISTS (
                SELECT 1 FROM jadwal_petugas jp2
                WHERE jp2.jadwal_id = $3
                  AND jp2.petugas_id = p.id
              )
              AND petugas_boleh_jadwal(p.id, $3::bigint)
              AND can_assign_petugas(p.id, $4::date, $5::time, $3::bigint)
          `,
          [
            petugasPenggantiId,
            target.current_petugas_id,
            target.jadwal_id,
            target.tanggal,
            target.jam,
          ],
        );

        if (!replacementResult.rows[0]) {
          throw new Error(
            "Petugas pengganti tidak valid, tidak aktif, atau tidak dapat ditugaskan pada jadwal ini.",
          );
        }

        replacementPetugasId = replacementResult.rows[0].id;
      } else {
        const candidateResult = await client.query<{ id: number }>(
          `
            SELECT p.id
            FROM petugas p
            LEFT JOIN petugas_penugasan_count pc ON pc.petugas_id = p.id
            WHERE p.aktif = true
              AND p.id <> $1
              AND NOT EXISTS (
                SELECT 1 FROM jadwal_petugas jp2
                WHERE jp2.jadwal_id = $2
                  AND jp2.petugas_id = p.id
              )
              AND petugas_boleh_jadwal(p.id, $2::bigint)
              AND can_assign_petugas(p.id, $3::date, $4::time, $2::bigint)
            ORDER BY COALESCE(pc.total_penugasan, 0) ASC, random()
            LIMIT 1
          `,
          [
            target.current_petugas_id,
            target.jadwal_id,
            target.tanggal,
            target.jam,
          ],
        );

        if (!candidateResult.rows[0]) {
          throw new Error(
            "Tidak ditemukan petugas pengganti yang memenuhi kriteria.",
          );
        }

        replacementPetugasId = candidateResult.rows[0].id;
      }

      await client.query(
        `
          UPDATE jadwal_petugas
          SET petugas_id = $1
          WHERE id = $2
        `,
        [replacementPetugasId, target.id],
      );

      await client.query(
        `
          INSERT INTO jadwal_petugas_swap_history (
            jadwal_id,
            jadwal_petugas_id,
            from_petugas_id,
            to_petugas_id,
            mode
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          target.jadwal_id,
          target.id,
          target.current_petugas_id,
          replacementPetugasId,
          mode,
        ],
      );

      const updatedResult = await client.query<JadwalRow>(selectJadwalById, [
        target.jadwal_id,
      ]);
      if (!updatedResult.rows[0]) {
        throw new Error("Gagal mengambil data jadwal setelah penggantian.");
      }

      return {
        schedule: updatedResult.rows[0],
        swapped: {
          from_petugas_id: target.current_petugas_id,
          to_petugas_id: replacementPetugasId,
          mode,
        },
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
