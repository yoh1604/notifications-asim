import { query } from "@/lib/db";

/**
 * Utility: Replacement Finder for Declined Officers
 *
 * Mencari dan menugaskan 1 petugas pengganti untuk slot yang ditolak.
 * Kriteria pengganti:
 * - Petugas aktif dan belum ditugaskan pada hari/jam yang sama
 * - Memenuhi aturan rotasi
 * - Dipilih secara acak dengan prioritas pada yang paling sedikit penugasan
 */

type ReplacementResult = {
  jadwal_id: number;
  jadwal_petugas_id: number;
  petugas_id: number;
  petugas_nama: string;
  petugas_no_hp: string | null;
  tanggal: string;
  jam: string;
  confirmation_status: string;
};

/**
 * Menemukan dan menugaskan 1 petugas pengganti untuk slot yang ditolak
 *
 * @param jadwalPetugasId - ID dari jadwal_petugas yang ditolak
 * @param declinedPetugasId - ID petugas yang menolak
 * @returns Informasi petugas pengganti yang berhasil ditugaskan, atau null jika tidak ada yang cocok
 */
export async function findAndAssignReplacement(
  jadwalPetugasId: number,
  declinedPetugasId: number,
): Promise<ReplacementResult | null> {
  try {
    // 1. Ambil informasi jadwal dari jadwal_petugas yang ditolak
    const jadwalInfoResult = await query<{
      jadwal_id: number;
      tanggal: string;
      jam: string;
      jumlah_petugas: number;
    }>(
      `
        SELECT
          jp.jadwal_id,
          j.tanggal::text,
          to_char(j.jam, 'HH24:MI') as jam,
          j.jumlah_petugas
        FROM jadwal_petugas jp
        JOIN jadwal j ON j.id = jp.jadwal_id
        WHERE jp.id = $1
      `,
      [jadwalPetugasId],
    );

    if (jadwalInfoResult.rows.length === 0) {
      console.error(
        `[Replacement] Jadwal petugas ${jadwalPetugasId} tidak ditemukan`,
      );
      return null;
    }

    const jadwalInfo = jadwalInfoResult.rows[0];
    const { jadwal_id, tanggal, jam } = jadwalInfo;

    // 2. Cari kandidat pengganti yang memenuhi kriteria
    // - Aktif, tidak ditugaskan hari ini, memenuhi rotasi, dipilih acak
    const candidateResult = await query<{
      id: number;
      nama: string;
      no_hp: string | null;
      total_penugasan: number;
    }>(
      `
        SELECT
          p.id,
          p.nama,
          p.no_hp,
          COALESCE(pc.total_penugasan, 0) as total_penugasan
        FROM petugas p
        LEFT JOIN LATERAL (
          SELECT count(*)::integer AS total_penugasan
          FROM penugasan_petugas pp
          WHERE pp.petugas_id = p.id
            AND pp.status <> 'batal'
            AND pp.jadwal_id <> $2::bigint
        ) pc ON true
        WHERE p.aktif = true
          AND p.id <> $3::integer -- Exclude yang ditolak
          AND NOT EXISTS (
            -- Pastikan tidak ada konflik jadwal (hari/jam sama)
            SELECT 1 FROM penugasan_petugas pp
            WHERE pp.petugas_id = p.id
              AND pp.tanggal = $4::date
              AND pp.jam = $5::time
              AND pp.status <> 'batal'
          )
          -- Pastikan memenuhi aturan rotasi
          AND petugas_boleh_jadwal(p.id, $2::bigint)
          -- Pastikan bisa ditugaskan pada jam ini
          AND can_assign_petugas(p.id, $4::date, $5::time, $2::bigint)
        ORDER BY pc.total_penugasan ASC, random()
        LIMIT 1
      `,
      [
        jadwalPetugasId,
        jadwal_id,
        declinedPetugasId,
        tanggal,
        jam,
      ],
    );

    if (candidateResult.rows.length === 0) {
      console.warn(
        `[Replacement] Tidak ada kandidat pengganti untuk jadwal ${jadwal_id}`,
      );
      return null;
    }

    const replacement = candidateResult.rows[0];

    // 3. Update jadwal_petugas dengan petugas pengganti
    const updateJadwalResult = await query<{ id: number }>(
      `
        UPDATE jadwal_petugas
        SET petugas_id = $1
        WHERE id = $2
        RETURNING id
      `,
      [replacement.id, jadwalPetugasId],
    );

    if (updateJadwalResult.rows.length === 0) {
      console.error(
        `[Replacement] Gagal mengupdate jadwal_petugas ${jadwalPetugasId}`,
      );
      return null;
    }

    // 4. Tambahkan penugasan_petugas baru untuk pengganti
    // (trigger akan otomatis membuat entry baru)
    const penugasanResult = await query<ReplacementResult>(
      `
        SELECT
          pp.jadwal_id,
          pp.jadwal_petugas_id,
          pp.petugas_id,
          p.nama as petugas_nama,
          p.no_hp as petugas_no_hp,
          pp.tanggal::text,
          to_char(pp.jam, 'HH24:MI') as jam,
          pp.confirmation_status
        FROM penugasan_petugas pp
        JOIN petugas p ON p.id = pp.petugas_id
        WHERE pp.jadwal_petugas_id = $1
          AND pp.petugas_id = $2
        LIMIT 1
      `,
      [jadwalPetugasId, replacement.id],
    );

    if (penugasanResult.rows.length === 0) {
      console.error(
        `[Replacement] Penugasan baru tidak ditemukan untuk jadwal ${jadwalPetugasId}`,
      );
      return null;
    }

    console.log(
      `[Replacement] Berhasil menugaskan ${replacement.nama} sebagai pengganti`,
    );
    return penugasanResult.rows[0];
  } catch (error) {
    console.error("[Replacement] Error:", error);
    return null;
  }
}

/**
 * API wrapper untuk endpoint replacement
 * POST /api/replacement/find-for-declined
 *
 * Body:
 * {
 *   jadwal_petugas_id: number,
 *   declined_petugas_id: number
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jadwal_petugas_id, declined_petugas_id } = body as {
      jadwal_petugas_id?: unknown;
      declined_petugas_id?: unknown;
    };

    if (!jadwal_petugas_id || !declined_petugas_id) {
      return new Response(
        JSON.stringify({
          error: "jadwal_petugas_id dan declined_petugas_id wajib diisi",
        }),
        { status: 400 },
      );
    }

    const replacement = await findAndAssignReplacement(
      Number(jadwal_petugas_id),
      Number(declined_petugas_id),
    );

    if (!replacement) {
      return new Response(
        JSON.stringify({
          error: "Tidak ada petugas pengganti yang cocok",
          jadwal_petugas_id,
          declined_petugas_id,
        }),
        { status: 404 },
      );
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Pengganti berhasil ditugaskan",
        replacement: {
          petugas_id: replacement.petugas_id,
          petugas_nama: replacement.petugas_nama,
          petugas_no_hp: replacement.petugas_no_hp,
          tanggal: replacement.tanggal,
          jam: replacement.jam,
          confirmation_status: replacement.confirmation_status,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Server error",
      }),
      { status: 500 },
    );
  }
}
