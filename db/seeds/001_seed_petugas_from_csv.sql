CREATE TEMP TABLE seed_petugas_csv (
  id integer,
  wilayah text,
  lingkungan text,
  asisten_imam text,
  no_hp text
);

\copy seed_petugas_csv (id, wilayah, lingkungan, asisten_imam, no_hp) FROM '/docker-entrypoint-initdb.d/asisten_imam.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO petugas (id, wilayah, lingkungan, nama, no_hp, aktif)
SELECT
  id,
  COALESCE(NULLIF(trim(wilayah), ''), 'Tanpa Wilayah'),
  NULLIF(trim(lingkungan), ''),
  trim(asisten_imam),
  NULLIF(regexp_replace(COALESCE(no_hp, ''), '[^0-9]', '', 'g'), ''),
  true
FROM seed_petugas_csv
WHERE NULLIF(trim(asisten_imam), '') IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  wilayah = EXCLUDED.wilayah,
  lingkungan = EXCLUDED.lingkungan,
  nama = EXCLUDED.nama,
  no_hp = EXCLUDED.no_hp,
  aktif = true,
  updated_at = now();

SELECT setval(
  pg_get_serial_sequence('petugas', 'id'),
  COALESCE((SELECT max(id) FROM petugas), 1),
  true
);
