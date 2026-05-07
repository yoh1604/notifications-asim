-- Add confirmation status columns to penugasan_petugas table
-- Tracks: pending (awaiting confirmation), confirmed (said BISA), declined (said TIDAK)

ALTER TABLE penugasan_petugas
ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmation_received_at timestamptz,
ADD COLUMN IF NOT EXISTS confirmation_message text;

-- Update status check constraint
ALTER TABLE penugasan_petugas
DROP CONSTRAINT IF EXISTS penugasan_petugas_status_check;

ALTER TABLE penugasan_petugas
ADD CONSTRAINT penugasan_petugas_status_check
  CHECK (status IN ('terjadwal', 'batal'));

-- Add constraint for confirmation_status
ALTER TABLE penugasan_petugas
ADD CONSTRAINT penugasan_petugas_confirmation_status_check
  CHECK (confirmation_status IN ('pending', 'confirmed', 'declined'));

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS penugasan_petugas_confirmation_status_idx
  ON penugasan_petugas (confirmation_status)
  WHERE confirmation_status = 'pending';

CREATE INDEX IF NOT EXISTS penugasan_petugas_confirmation_sent_at_idx
  ON penugasan_petugas (confirmation_sent_at)
  WHERE confirmation_status = 'pending';

-- Function to mark assignment as confirmed
CREATE OR REPLACE FUNCTION mark_penugasan_confirmed(
  p_petugas_id integer,
  p_jadwal_id bigint
)
RETURNS TABLE (
  id bigint,
  confirmation_status text,
  updated_at timestamptz
) AS $$
UPDATE penugasan_petugas
SET
  confirmation_status = 'confirmed',
  confirmation_received_at = now(),
  updated_at = now()
WHERE
  petugas_id = p_petugas_id
  AND jadwal_id = p_jadwal_id
  AND confirmation_status = 'pending'
RETURNING
  penugasan_petugas.id,
  penugasan_petugas.confirmation_status,
  penugasan_petugas.updated_at;
$$ LANGUAGE SQL;

-- Function to mark assignment as declined
CREATE OR REPLACE FUNCTION mark_penugasan_declined(
  p_petugas_id integer,
  p_jadwal_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  confirmation_status text,
  updated_at timestamptz
) AS $$
UPDATE penugasan_petugas
SET
  confirmation_status = 'declined',
  confirmation_received_at = now(),
  confirmation_message = p_reason,
  updated_at = now()
WHERE
  petugas_id = p_petugas_id
  AND jadwal_id = p_jadwal_id
  AND confirmation_status = 'pending'
RETURNING
  penugasan_petugas.id,
  penugasan_petugas.confirmation_status,
  penugasan_petugas.updated_at;
$$ LANGUAGE SQL;

-- Function to get all pending confirmations for a schedule
CREATE OR REPLACE FUNCTION get_pending_confirmations(p_jadwal_id bigint)
RETURNS TABLE (
  id bigint,
  jadwal_id bigint,
  petugas_id integer,
  petugas_nama text,
  petugas_no_hp text,
  tanggal date,
  jam time without time zone,
  confirmation_status text,
  confirmation_sent_at timestamptz
) AS $$
SELECT
  pp.id,
  pp.jadwal_id,
  pp.petugas_id,
  p.nama,
  p.no_hp,
  pp.tanggal,
  pp.jam,
  pp.confirmation_status,
  pp.confirmation_sent_at
FROM penugasan_petugas pp
JOIN petugas p ON p.id = pp.petugas_id
WHERE pp.jadwal_id = p_jadwal_id
  AND pp.confirmation_status = 'pending'
ORDER BY pp.confirmation_sent_at ASC;
$$ LANGUAGE SQL STABLE;

-- Add trigger to set confirmation_status to 'pending' when new penugasan_petugas is created
CREATE OR REPLACE FUNCTION init_confirmation_status()
RETURNS trigger AS $$
BEGIN
  NEW.confirmation_status = 'pending';
  NEW.confirmation_sent_at = NULL;
  NEW.confirmation_received_at = NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS init_confirmation_status_trigger ON penugasan_petugas;
CREATE TRIGGER init_confirmation_status_trigger
BEFORE INSERT ON penugasan_petugas
FOR EACH ROW
EXECUTE FUNCTION init_confirmation_status();

-- Update trigger for update timestamp
CREATE OR REPLACE FUNCTION update_penugasan_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS penugasan_petugas_set_updated_at ON penugasan_petugas;
CREATE TRIGGER penugasan_petugas_set_updated_at
BEFORE UPDATE ON penugasan_petugas
FOR EACH ROW
EXECUTE FUNCTION update_penugasan_updated_at();
