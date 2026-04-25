DROP TABLE IF EXISTS jadwal_merge_petugas;
DROP TABLE IF EXISTS jadwal_merge_headers;
DROP TABLE IF EXISTS jadwal_merge_groups;

CREATE TEMP TABLE jadwal_merge_groups AS
SELECT
  min(id) AS target_id,
  tanggal,
  jam
FROM jadwal
WHERE status <> 'batal'
GROUP BY tanggal, jam
HAVING count(*) > 1;

CREATE TEMP TABLE jadwal_merge_headers AS
SELECT
  g.target_id,
  GREATEST(count(DISTINCT jp.petugas_id)::integer, 1) AS jumlah_petugas,
  min(j.koordinator_id) FILTER (WHERE j.koordinator_id IS NOT NULL)
    AS koordinator_id,
  CASE
    WHEN bool_or(j.status = 'selesai') THEN 'selesai'
    WHEN bool_or(j.status = 'terjadwal') THEN 'terjadwal'
    ELSE 'draft'
  END AS status,
  string_agg(DISTINCT NULLIF(trim(j.catatan), ''), '; ')
    FILTER (WHERE NULLIF(trim(j.catatan), '') IS NOT NULL) AS catatan
FROM jadwal_merge_groups g
JOIN jadwal j
  ON j.tanggal = g.tanggal
  AND j.jam = g.jam
  AND j.status <> 'batal'
LEFT JOIN jadwal_petugas jp ON jp.jadwal_id = j.id
GROUP BY g.target_id;

CREATE TEMP TABLE jadwal_merge_petugas AS
SELECT
  target_id,
  petugas_id,
  row_number() OVER (
    PARTITION BY target_id
    ORDER BY first_jadwal_id, first_urutan, petugas_id
  )::integer AS urutan
FROM (
  SELECT
    g.target_id,
    jp.petugas_id,
    min(j.id) AS first_jadwal_id,
    min(jp.urutan) AS first_urutan
  FROM jadwal_merge_groups g
  JOIN jadwal j
    ON j.tanggal = g.tanggal
    AND j.jam = g.jam
    AND j.status <> 'batal'
  JOIN jadwal_petugas jp ON jp.jadwal_id = j.id
  GROUP BY g.target_id, jp.petugas_id
) source_rows;

DELETE FROM jadwal_petugas jp
USING jadwal_merge_groups g, jadwal j
WHERE jp.jadwal_id = j.id
  AND j.tanggal = g.tanggal
  AND j.jam = g.jam
  AND j.status <> 'batal';

INSERT INTO jadwal_petugas (jadwal_id, petugas_id, urutan)
SELECT target_id, petugas_id, urutan
FROM jadwal_merge_petugas;

UPDATE jadwal j
SET
  jumlah_petugas = h.jumlah_petugas,
  koordinator_id = COALESCE(h.koordinator_id, j.koordinator_id),
  status = h.status,
  catatan = COALESCE(h.catatan, j.catatan)
FROM jadwal_merge_headers h
WHERE j.id = h.target_id;

DELETE FROM jadwal j
USING jadwal_merge_groups g
WHERE j.tanggal = g.tanggal
  AND j.jam = g.jam
  AND j.status <> 'batal'
  AND j.id <> g.target_id;

DROP TABLE IF EXISTS jadwal_merge_petugas;
DROP TABLE IF EXISTS jadwal_merge_headers;
DROP TABLE IF EXISTS jadwal_merge_groups;
