import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query, transaction } from "@/lib/db";

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

type WaktuPilihanRow = {
  id: number;
  hari: number;
  jam: string;
};

type WaktuPilihanInput = {
  hari: number;
  jam: string;
};

const jamPattern = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function normalizeJam(value: unknown) {
  if (typeof value !== "string") return null;

  const match = value.trim().match(jamPattern);
  if (!match) return null;

  return `${match[1]}:${match[2]}`;
}

function parseWaktuPilihan(value: unknown) {
  const rawItems = Array.isArray(value) ? value : [];
  const picked = new Map<string, WaktuPilihanInput>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") return null;

    const rawItem = item as { hari?: unknown; jam?: unknown };
    const hari = Number(rawItem.hari);
    const jam = normalizeJam(rawItem.jam);

    if (!Number.isInteger(hari) || hari < 0 || hari > 6 || !jam) {
      return null;
    }

    picked.set(`${hari}-${jam}`, { hari, jam });
  }

  return [...picked.values()];
}

async function loadPetugasDetail(petugasId: number) {
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

  if (!petugasResult.rows[0]) return null;

  const [penugasanResult, waktuPilihanResult] = await Promise.all([
    query<PenugasanRow>(
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
    ),
    query<WaktuPilihanRow>(
      `
        SELECT
          id::integer AS id,
          hari::integer AS hari,
          to_char(jam, 'HH24:MI') AS jam
        FROM petugas_jadwal_waktu_pilihan
        WHERE petugas_id = $1
        ORDER BY hari ASC, jam ASC, id ASC
      `,
      [petugasId],
    ),
  ]);

  return {
    petugas: petugasResult.rows[0],
    penugasan: penugasanResult.rows,
    waktu_pilihan: waktuPilihanResult.rows,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const petugasId = Number(id);
    if (!petugasId) return badRequest("ID petugas tidak valid.");

    const detail = await loadPetugasDetail(petugasId);
    if (!detail) return badRequest("Petugas tidak ditemukan.");

    return NextResponse.json({ data: detail });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const petugasId = Number(id);
    if (!petugasId) return badRequest("ID petugas tidak valid.");

    const body = (await request.json()) as
      | { waktu_pilihan?: unknown }
      | null;
    const waktuPilihan = parseWaktuPilihan(body?.waktu_pilihan);

    if (!waktuPilihan) {
      return badRequest("Pilihan hari dan jam tidak valid.");
    }

    await transaction(async (client) => {
      const petugasResult = await client.query(
        "SELECT 1 FROM petugas WHERE id = $1",
        [petugasId],
      );
      if (!petugasResult.rowCount) {
        throw new Error("Petugas tidak ditemukan.");
      }

      await client.query(
        "DELETE FROM petugas_jadwal_pilihan WHERE petugas_id = $1",
        [petugasId],
      );

      await client.query(
        "DELETE FROM petugas_jadwal_waktu_pilihan WHERE petugas_id = $1",
        [petugasId],
      );

      for (const item of waktuPilihan) {
        await client.query(
          `
            INSERT INTO petugas_jadwal_waktu_pilihan (petugas_id, hari, jam)
            VALUES ($1, $2, $3::time)
            ON CONFLICT (petugas_id, hari, jam) DO NOTHING
          `,
          [petugasId, item.hari, item.jam],
        );
      }
    });

    const detail = await loadPetugasDetail(petugasId);
    return NextResponse.json({ data: detail });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
