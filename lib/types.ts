export type Petugas = {
  id: number;
  nama: string;
  asisten_imam: string;
  wilayah: string;
  lingkungan: string | null;
  no_hp: string | null;
  aktif: boolean;
  eligible?: boolean;
};

export type Koordinator = {
  id: number;
  petugas_id: number | null;
  nama: string;
  no_hp: string | null;
  aktif: boolean;
};

export type Jadwal = {
  id: number;
  tanggal: string;
  jam: string;
  petugas_id: number;
  nama_petugas: string;
  koordinator_id: number | null;
  nama_koordinator: string | null;
  status: "draft" | "terjadwal" | "selesai" | "batal";
  catatan: string | null;
};
