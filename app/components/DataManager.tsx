"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { Jadwal, Koordinator, Petugas } from "@/lib/types";

type DataManagerProps = {
  petugas: Petugas[];
  koordinator: Koordinator[];
  jadwal: Jadwal[];
  onRefresh: () => Promise<void>;
};

type ApiPayload = Record<string, string | number | boolean | null>;

type PetugasPenugasanDetail = {
  petugas: Petugas;
  penugasan: Array<{
    id: number;
    jadwal_id: number;
    tanggal: string;
    jam: string;
    status: string;
    nama_koordinator: string | null;
  }>;
};

const emptyPetugasForm = {
  nama: "",
  wilayah: "",
  lingkungan: "",
  no_hp: "",
};

const emptyKoordinatorForm = {
  petugas_id: "",
  nama: "",
  no_hp: "",
};

const emptyJadwalForm = {
  tanggal: "",
  jam: "",
  jumlah_petugas: "",
};

async function sendJson(url: string, method: string, payload?: ApiPayload) {
  const response = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request gagal.");
  }

  return data;
}

function formatPetugasWithCount(petugas: Jadwal["petugas"][number]) {
  const name = petugas.asisten_imam || petugas.nama;
  return `${name} (${petugas.total_penugasan}x)`;
}

function getPetugasNames(item: Jadwal) {
  return item.petugas.map(formatPetugasWithCount);
}

function formatPetugasSummary(item: Jadwal) {
  const names = getPetugasNames(item);

  if (names.length === 0) return "-";

  const visibleNames = names.slice(0, 3).join(", ");
  return names.length > 3
    ? `${visibleNames} +${names.length - 3}`
    : visibleNames;
}

function canRandomizeJadwal(item: Jadwal) {
  return item.status === "draft";
}

function formatStatus(item: Jadwal) {
  if (item.status === "terjadwal") return "tersimpan";
  return item.status;
}

function downloadJadwalExcel(jadwal: Jadwal[]) {
  const exportData = jadwal
    .filter((item) => item.status !== "batal" && item.petugas.length > 0)
    .flatMap((item) =>
      item.petugas.map((petugas) => ({
        Tanggal: item.tanggal,
        Jam: item.jam || "",
        Nama_Petugas: petugas.asisten_imam || petugas.nama,
        Nama_Koordinator: item.nama_koordinator || "",
      })),
    );

  if (exportData.length === 0) {
    alert("Belum ada jadwal yang bisa diunduh.");
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Jadwal");

  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 10 },
    { wch: 35 },
    { wch: 35 },
  ];

  XLSX.writeFile(workbook, "Template_Jadwal_AI.xlsx");
}

export default function DataManager({
  petugas,
  koordinator,
  jadwal,
  onRefresh,
}: DataManagerProps) {
  const [petugasForm, setPetugasForm] = useState(emptyPetugasForm);
  const [koordinatorForm, setKoordinatorForm] = useState(emptyKoordinatorForm);
  const [jadwalForm, setJadwalForm] = useState(emptyJadwalForm);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPetugasDetail, setSelectedPetugasDetail] =
    useState<PetugasPenugasanDetail | null>(null);
  const [petugasDetailLoading, setPetugasDetailLoading] = useState(false);
  const [petugasDetailError, setPetugasDetailError] = useState("");

  const activePetugas = useMemo(
    () => petugas.filter((item) => item.aktif),
    [petugas],
  );
  const activeKoordinator = useMemo(
    () => koordinator.filter((item) => item.aktif),
    [koordinator],
  );
  const sortedPetugasByPenugasan = useMemo(
    () =>
      [...petugas].sort((a, b) => {
        const countDiff = a.total_penugasan - b.total_penugasan;
        if (countDiff !== 0) return countDiff;
        return (a.asisten_imam || a.nama).localeCompare(
          b.asisten_imam || b.nama,
        );
      }),
    [petugas],
  );
  const draftJadwal = useMemo(
    () => jadwal.filter((item) => canRandomizeJadwal(item)),
    [jadwal],
  );

  const handleCreatePetugas = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await sendJson("/api/petugas", "POST", petugasForm);
      setPetugasForm(emptyPetugasForm);
      setMessage("Petugas berhasil ditambahkan.");
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal menambah petugas.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKoordinator = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await sendJson("/api/koordinator", "POST", {
        petugas_id: koordinatorForm.petugas_id
          ? Number(koordinatorForm.petugas_id)
          : null,
        nama: koordinatorForm.nama,
        no_hp: koordinatorForm.no_hp,
      });
      setKoordinatorForm(emptyKoordinatorForm);
      setMessage("Koordinator berhasil ditambahkan.");
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal menambah koordinator.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateJadwal = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const jumlahPetugas = Number(jadwalForm.jumlah_petugas);
      if (!jumlahPetugas || jumlahPetugas < 1) {
        throw new Error("Jumlah petugas wajib lebih dari 0.");
      }

      await sendJson("/api/jadwal", "POST", {
        tanggal: jadwalForm.tanggal,
        jam: jadwalForm.jam,
        jumlah_petugas: jumlahPetugas,
      });
      setJadwalForm(emptyJadwalForm);
      setMessage(`Jadwal untuk ${jumlahPetugas} petugas berhasil dibuat.`);
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal menambah jadwal.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomizeJadwal = async (id: number) => {
    setSubmitting(true);
    setMessage("");

    try {
      await sendJson(`/api/jadwal/${id}/randomize`, "POST");
      setMessage("Petugas, koordinator, dan count penugasan berhasil disimpan.");
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal randomize jadwal.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomizeDrafts = async () => {
    if (draftJadwal.length === 0) return;

    setSubmitting(true);
    setMessage("");

    try {
      for (const item of draftJadwal) {
        await sendJson(`/api/jadwal/${item.id}/randomize`, "POST");
      }
      setMessage(`${draftJadwal.length} jadwal berhasil diacak dan disimpan.`);
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal randomize jadwal.",
      );
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelJadwal = async (id: number) => {
    setSubmitting(true);
    setMessage("");

    try {
      await sendJson(`/api/jadwal/${id}`, "DELETE");
      setMessage("Jadwal berhasil dibatalkan.");
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal membatalkan jadwal.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleKoordinatorPetugasChange = (petugasId: string) => {
    const selected = activePetugas.find((item) => String(item.id) === petugasId);
    setKoordinatorForm({
      petugas_id: petugasId,
      nama: selected?.asisten_imam || "",
      no_hp: selected?.no_hp || "",
    });
  };

  const handleOpenPetugasDetail = async (item: Petugas) => {
    setSelectedPetugasDetail({ petugas: item, penugasan: [] });
    setPetugasDetailLoading(true);
    setPetugasDetailError("");

    try {
      const result = (await sendJson(
        `/api/petugas/${item.id}/penugasan`,
        "GET",
      )) as { data?: PetugasPenugasanDetail };
      if (result.data) {
        setSelectedPetugasDetail(result.data);
      }
    } catch (error) {
      setPetugasDetailError(
        error instanceof Error
          ? error.message
          : "Gagal memuat detail penugasan.",
      );
    } finally {
      setPetugasDetailLoading(false);
    }
  };

  const handleClosePetugasDetail = () => {
    setSelectedPetugasDetail(null);
    setPetugasDetailLoading(false);
    setPetugasDetailError("");
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form
          onSubmit={handleCreatePetugas}
          className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-black uppercase tracking-widest text-blue-900 mb-4">
            Isi Petugas
          </h3>
          <div className="space-y-3">
            <input
              value={petugasForm.nama}
              onChange={(event) =>
                setPetugasForm({ ...petugasForm, nama: event.target.value })
              }
              placeholder="Nama petugas"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
            <input
              value={petugasForm.wilayah}
              onChange={(event) =>
                setPetugasForm({ ...petugasForm, wilayah: event.target.value })
              }
              placeholder="Wilayah"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
            <input
              value={petugasForm.lingkungan}
              onChange={(event) =>
                setPetugasForm({
                  ...petugasForm,
                  lingkungan: event.target.value,
                })
              }
              placeholder="Lingkungan"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            />
            <input
              value={petugasForm.no_hp}
              onChange={(event) =>
                setPetugasForm({ ...petugasForm, no_hp: event.target.value })
              }
              placeholder="No HP"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <button
            disabled={submitting}
            className="mt-4 w-full bg-blue-600 text-white rounded-xl py-2 text-xs font-black hover:bg-blue-700 disabled:bg-blue-300"
          >
            Simpan Petugas
          </button>
        </form>

        <form
          onSubmit={handleCreateKoordinator}
          className="bg-white border border-purple-100 rounded-2xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-black uppercase tracking-widest text-purple-900 mb-4">
            Isi Koordinator
          </h3>
          <div className="space-y-3">
            <select
              value={koordinatorForm.petugas_id}
              onChange={(event) =>
                handleKoordinatorPetugasChange(event.target.value)
              }
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            >
              <option value="">Pilih dari petugas (opsional)</option>
              {activePetugas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.asisten_imam}
                </option>
              ))}
            </select>
            <input
              value={koordinatorForm.nama}
              onChange={(event) =>
                setKoordinatorForm({
                  ...koordinatorForm,
                  nama: event.target.value,
                })
              }
              placeholder="Nama koordinator"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
            <input
              value={koordinatorForm.no_hp}
              onChange={(event) =>
                setKoordinatorForm({
                  ...koordinatorForm,
                  no_hp: event.target.value,
                })
              }
              placeholder="No HP"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <button
            disabled={submitting}
            className="mt-4 w-full bg-purple-600 text-white rounded-xl py-2 text-xs font-black hover:bg-purple-700 disabled:bg-purple-300"
          >
            Simpan Koordinator
          </button>
        </form>

        <form
          onSubmit={handleCreateJadwal}
          className="bg-white border border-green-100 rounded-2xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-black uppercase tracking-widest text-green-900 mb-4">
            Isi Jadwal
          </h3>
          <div className="space-y-3">
            <input
              type="date"
              value={jadwalForm.tanggal}
              onChange={(event) =>
                setJadwalForm({ ...jadwalForm, tanggal: event.target.value })
              }
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
            <input
              type="time"
              value={jadwalForm.jam}
              onChange={(event) =>
                setJadwalForm({ ...jadwalForm, jam: event.target.value })
              }
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
            <input
              type="number"
              min="1"
              max={activePetugas.length || undefined}
              value={jadwalForm.jumlah_petugas}
              onChange={(event) =>
                setJadwalForm({
                  ...jadwalForm,
                  jumlah_petugas: event.target.value,
                })
              }
              placeholder="Jumlah petugas"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            />
          </div>
          <button
            disabled={submitting}
            className="mt-4 w-full bg-green-600 text-white rounded-xl py-2 text-xs font-black hover:bg-green-700 disabled:bg-green-300"
          >
            Buat Jadwal
          </button>
        </form>
      </div>

      {message && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">
            Ringkasan
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-2xl font-black text-blue-700">
                {activePetugas.length}
              </p>
              <p className="text-[10px] font-bold text-blue-500 uppercase">
                Petugas
              </p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3">
              <p className="text-2xl font-black text-purple-700">
                {activeKoordinator.length}
              </p>
              <p className="text-[10px] font-bold text-purple-500 uppercase">
                Koord.
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-2xl font-black text-green-700">
                {jadwal.length}
              </p>
              <p className="text-[10px] font-bold text-green-500 uppercase">
                Jadwal
              </p>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
              Jadwal Terbaru
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRandomizeDrafts}
                disabled={submitting || draftJadwal.length === 0}
                className="bg-blue-600 text-white rounded-xl px-3 py-2 text-[11px] font-black hover:bg-blue-700 disabled:bg-blue-300"
              >
                Randomize & Simpan Draft
              </button>
              <button
                type="button"
                onClick={() => downloadJadwalExcel(jadwal)}
                disabled={jadwal.length === 0}
                className="bg-green-600 text-white rounded-xl px-3 py-2 text-[11px] font-black hover:bg-green-700 disabled:bg-green-300"
              >
                Download Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="py-2 pr-4">Tanggal</th>
                  <th className="py-2 pr-4">Jam</th>
                  <th className="py-2 pr-4">Jumlah</th>
                  <th className="py-2 pr-4">Petugas</th>
                  <th className="py-2 pr-4">Koordinator</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jadwal.map((item) => (
                  <tr key={item.id} className="text-gray-700">
                    <td className="py-3 pr-4 font-semibold">{item.tanggal}</td>
                    <td className="py-3 pr-4">{item.jam || "-"}</td>
                    <td className="py-3 pr-4">
                      {item.assigned_count}/{item.jumlah_petugas}
                    </td>
                    <td
                      className="py-3 pr-4 max-w-72"
                      title={getPetugasNames(item).join(", ")}
                    >
                      {formatPetugasSummary(item)}
                    </td>
                    <td className="py-3 pr-4">
                      {item.nama_koordinator || "-"}
                    </td>
                    <td className="py-3 pr-4 uppercase text-[10px] font-black">
                      {formatStatus(item)}
                    </td>
                    <td className="py-3 pr-4">
                      {item.status !== "batal" && (
                        <div className="flex justify-end gap-2">
                          {canRandomizeJadwal(item) ? (
                            <button
                              type="button"
                              onClick={() => handleRandomizeJadwal(item.id)}
                              disabled={submitting}
                              className="text-blue-600 font-bold hover:text-blue-800 disabled:text-blue-300"
                            >
                              Randomize & Simpan
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="text-gray-400 font-bold cursor-not-allowed"
                            >
                              Tersimpan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCancelJadwal(item.id)}
                            disabled={submitting}
                            className="text-red-600 font-bold hover:text-red-800 disabled:text-red-300"
                          >
                            Batalkan
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {jadwal.length === 0 && (
                  <tr>
                    <td className="py-8 text-center text-gray-400" colSpan={7}>
                      Belum ada jadwal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
            Penugasan Petugas
          </h3>
          <span className="text-[11px] font-bold text-gray-400">
            {petugas.length} petugas
          </span>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-400 border-b">
                <th className="py-2 pr-4">Nama Petugas</th>
                <th className="py-2 pr-4">Wilayah</th>
                <th className="py-2 pr-4">Lingkungan</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Penugasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPetugasByPenugasan.map((item) => (
                <tr
                  key={item.id}
                  className="text-gray-700 hover:bg-blue-50/60"
                >
                  <td className="py-3 pr-4 font-semibold">
                    <button
                      type="button"
                      onClick={() => handleOpenPetugasDetail(item)}
                      className="text-left font-semibold text-gray-800 hover:text-blue-700"
                    >
                      {item.asisten_imam || item.nama}
                    </button>
                  </td>
                  <td className="py-3 pr-4">{item.wilayah || "-"}</td>
                  <td className="py-3 pr-4">{item.lingkungan || "-"}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        item.aktif
                          ? "font-black text-green-700"
                          : "font-black text-gray-400"
                      }
                    >
                      {item.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-black text-blue-700">
                    {item.total_penugasan}x
                  </td>
                </tr>
              ))}
              {sortedPetugasByPenugasan.length === 0 && (
                <tr>
                  <td className="py-8 text-center text-gray-400" colSpan={5}>
                    Belum ada petugas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPetugasDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                  Detail Petugas
                </p>
                <h3 className="mt-1 text-lg font-black text-gray-900">
                  {selectedPetugasDetail.petugas.asisten_imam ||
                    selectedPetugasDetail.petugas.nama}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClosePetugasDetail}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>

            <div className="max-h-[calc(90vh-78px)] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="font-bold text-blue-500 uppercase">Penugasan</p>
                  <p className="mt-1 text-2xl font-black text-blue-800">
                    {selectedPetugasDetail.petugas.total_penugasan}x
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-gray-400 uppercase">Wilayah</p>
                  <p className="mt-1 font-black text-gray-800">
                    {selectedPetugasDetail.petugas.wilayah || "-"}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-gray-400 uppercase">
                    Lingkungan
                  </p>
                  <p className="mt-1 font-black text-gray-800">
                    {selectedPetugasDetail.petugas.lingkungan || "-"}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-gray-400 uppercase">No HP</p>
                  <p className="mt-1 font-black text-gray-800">
                    {selectedPetugasDetail.petugas.no_hp || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">
                  Riwayat Penugasan
                </h4>

                {petugasDetailError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {petugasDetailError}
                  </div>
                )}

                {petugasDetailLoading && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm font-semibold text-gray-500">
                    Memuat detail penugasan...
                  </div>
                )}

                {!petugasDetailLoading && !petugasDetailError && (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-400 border-b border-gray-100">
                          <th className="py-2 px-3">Tanggal</th>
                          <th className="py-2 px-3">Jam</th>
                          <th className="py-2 px-3">Koordinator</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedPetugasDetail.penugasan.map((item) => (
                          <tr key={item.id} className="text-gray-700">
                            <td className="py-3 px-3 font-semibold">
                              {item.tanggal}
                            </td>
                            <td className="py-3 px-3">{item.jam}</td>
                            <td className="py-3 px-3">
                              {item.nama_koordinator || "-"}
                            </td>
                            <td className="py-3 px-3 uppercase text-[10px] font-black">
                              {item.status}
                            </td>
                          </tr>
                        ))}
                        {selectedPetugasDetail.penugasan.length === 0 && (
                          <tr>
                            <td
                              className="py-8 text-center text-gray-400"
                              colSpan={4}
                            >
                              Belum ada riwayat penugasan.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
