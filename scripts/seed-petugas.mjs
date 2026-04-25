import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Papa from "papaparse";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL belum diset. Isi .env.local terlebih dahulu.");
}

const csvPath = join(process.cwd(), "public", "data", "asisten_imam.csv");
const csv = await readFile(csvPath, "utf8");
const parsed = Papa.parse(csv, {
  header: true,
  skipEmptyLines: true,
});

if (parsed.errors.length > 0) {
  throw new Error(`Gagal membaca CSV: ${parsed.errors[0].message}`);
}

const rows = parsed.data.filter((row) => {
  return row && typeof row === "object" && row.asisten_imam;
});

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const row of rows) {
    const id = Number(row.id);
    const nama = String(row.asisten_imam || "").trim();
    const wilayah = String(row.wilayah || "Tanpa Wilayah").trim();
    const lingkungan = String(row.lingkungan || "").trim() || null;
    const noHp = String(row.no_hp || "").replace(/[^0-9]/g, "") || null;

    if (!id || !nama) continue;

    await client.query(
      `
        INSERT INTO petugas (id, nama, wilayah, lingkungan, no_hp, aktif)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (id) DO UPDATE SET
          nama = EXCLUDED.nama,
          wilayah = EXCLUDED.wilayah,
          lingkungan = EXCLUDED.lingkungan,
          no_hp = EXCLUDED.no_hp,
          aktif = true,
          updated_at = now()
      `,
      [id, nama, wilayah || "Tanpa Wilayah", lingkungan, noHp],
    );
  }

  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('petugas', 'id'),
      COALESCE((SELECT max(id) FROM petugas), 1),
      true
    )
  `);

  await client.query("COMMIT");
  console.log(`seeded ${rows.length} petugas`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
