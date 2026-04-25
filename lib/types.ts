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

export type JadwalPetugas = {
  id: number;
  nama: string;
  asisten_imam: string;
  no_hp: string | null;
  urutan: number;
  total_penugasan: number;
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
