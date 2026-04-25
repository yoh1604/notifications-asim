CREATE OR REPLACE FUNCTION sync_penugasan_from_jadwal_petugas()
RETURNS trigger AS $$
DECLARE
  target_tanggal date;
  target_jam time without time zone;
  target_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM penugasan_petugas
    WHERE jadwal_petugas_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT tanggal, jam, status
    INTO target_tanggal, target_jam, target_status
  FROM jadwal
  WHERE id = NEW.jadwal_id;

  IF target_status = 'draft' THEN
    DELETE FROM penugasan_petugas
    WHERE jadwal_petugas_id = NEW.id;
    RETURN NEW;
  END IF;

  IF target_status = 'batal' THEN
    UPDATE penugasan_petugas
    SET
      tanggal = target_tanggal,
      jam = target_jam,
      status = 'batal',
      updated_at = now()
    WHERE jadwal_petugas_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO penugasan_petugas (
    jadwal_id,
    jadwal_petugas_id,
    petugas_id,
    tanggal,
    jam,
    status
  )
  VALUES (
    NEW.jadwal_id,
    NEW.id,
    NEW.petugas_id,
    target_tanggal,
    target_jam,
    normalize_penugasan_status(target_status)
  )
  ON CONFLICT (jadwal_petugas_id) DO UPDATE SET
    jadwal_id = EXCLUDED.jadwal_id,
    petugas_id = EXCLUDED.petugas_id,
    tanggal = EXCLUDED.tanggal,
    jam = EXCLUDED.jam,
    status = EXCLUDED.status,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_penugasan_from_jadwal()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    DELETE FROM penugasan_petugas
    WHERE jadwal_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.status = 'batal' THEN
    UPDATE penugasan_petugas
    SET
      tanggal = NEW.tanggal,
      jam = NEW.jam,
      status = 'batal',
      updated_at = now()
    WHERE jadwal_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO penugasan_petugas (
    jadwal_id,
    jadwal_petugas_id,
    petugas_id,
    tanggal,
    jam,
    status
  )
  SELECT
    NEW.id,
    jp.id,
    jp.petugas_id,
    NEW.tanggal,
    NEW.jam,
    normalize_penugasan_status(NEW.status)
  FROM jadwal_petugas jp
  WHERE jp.jadwal_id = NEW.id
  ON CONFLICT (jadwal_petugas_id) DO UPDATE SET
    jadwal_id = EXCLUDED.jadwal_id,
    petugas_id = EXCLUDED.petugas_id,
    tanggal = EXCLUDED.tanggal,
    jam = EXCLUDED.jam,
    status = EXCLUDED.status,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DELETE FROM penugasan_petugas pp
USING jadwal j
WHERE j.id = pp.jadwal_id
  AND j.status = 'draft';
