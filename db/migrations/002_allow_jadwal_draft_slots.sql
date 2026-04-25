DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'jadwal'
      AND column_name = 'petugas_id'
  ) THEN
    ALTER TABLE jadwal ALTER COLUMN petugas_id DROP NOT NULL;
  END IF;

  ALTER TABLE jadwal ALTER COLUMN status SET DEFAULT 'draft';
END;
$$;
