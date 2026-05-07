export type Petugas = {
  id: number;
  nama: string;
  asisten_imam: string;
  wilayah: string;
  lingkungan: string | null;
  no_hp: string | null;
  aktif: boolean;
  total_penugasan: number;
  eligible?: boolean;
};

export type Koordinator = {
  id: number;
  petugas_id: number | null;
  nama: string;
  no_hp: string | null;
  aktif: boolean;
};

export type ConfirmationStatus = "pending" | "confirmed" | "declined";

export type JadwalPetugas = {
  id: number;
  nama: string;
  asisten_imam: string;
  no_hp: string | null;
  urutan: number;
  total_penugasan: number;
  confirmation_status?: ConfirmationStatus;
  confirmation_sent_at?: string | null;
  confirmation_received_at?: string | null;
};

export type PenugasanPetugas = {
  id: number;
  jadwal_id: number;
  jadwal_petugas_id: number;
  petugas_id: number;
  tanggal: string;
  jam: string;
  status: "terjadwal" | "batal";
  confirmation_status: ConfirmationStatus;
  confirmation_sent_at: string | null;
  confirmation_received_at: string | null;
  confirmation_message: string | null;
  assigned_at: string;
  updated_at: string;
};

export type Jadwal = {
  id: number;
  tanggal: string;
  jam: string;
  jumlah_petugas: number;
  assigned_count: number;
  koordinator_id: number | null;
  nama_koordinator: string | null;
  status: "draft" | "terjadwal" | "selesai" | "batal";
  catatan: string | null;
  petugas: JadwalPetugas[];
};
