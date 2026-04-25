"use client";

import { useEffect, useMemo, useState } from "react";
import type { Jadwal, Koordinator, Petugas } from "@/lib/types";

type DataManagerProps = {
  petugas: Petugas[];
  koordinator: Koordinator[];
  jadwal: Jadwal[];
  onRefresh: () => Promise<void>;
};

type ApiPayload = Record<string, string | number | boolean | null>;

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
  petugas_id: "",
  koordinator_id: "",
  catatan: "",
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

export default function DataManager({
  petugas,
  koordinator,
  jadwal,
  onRefresh,
}: DataManagerProps) {
  const [petugasForm, setPetugasForm] = useState(emptyPetugasForm);
  const [koordinatorForm, setKoordinatorForm] = useState(emptyKoordinatorForm);
  const [jadwalForm, setJadwalForm] = useState(emptyJadwalForm);
  const [eligiblePetugas, setEligiblePetugas] = useState<Petugas[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activePetugas = useMemo(
    () => petugas.filter((item) => item.aktif),
    [petugas],
  );
  const activeKoordinator = useMemo(
    () => koordinator.filter((item) => item.aktif),
    [koordinator],
  );

  useEffect(() => {
    let ignore = false;

    async function loadEligibility() {
      if (!jadwalForm.tanggal || !jadwalForm.jam) {
        setEligiblePetugas([]);
        return;
      }

      const params = new URLSearchParams({
        eligible_tanggal: jadwalForm.tanggal,
        eligible_jam: jadwalForm.jam,
      });
      const response = await fetch(`/api/petugas?${params.toString()}`);
      const result = await response.json();

      if (!ignore && response.ok) {
        setEligiblePetugas(result.data || []);
      }
    }

    loadEligibility().catch(() => {
      if (!ignore) setEligiblePetugas([]);
    });

    return () => {
      ignore = true;
    };
  }, [jadwalForm.tanggal, jadwalForm.jam]);

  const petugasOptions = eligiblePetugas.length > 0 ? eligiblePetugas : activePetugas;

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
      setMessage(error instanceof Error ? error.message : "Gagal menambah petugas.");
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
      await sendJson("/api/jadwal", "POST", {
        tanggal: jadwalForm.tanggal,
        jam: jadwalForm.jam,
        petugas_id: Number(jadwalForm.petugas_id),
        koordinator_id: jadwalForm.koordinator_id
          ? Number(jadwalForm.koordinator_id)
          : null,
        catatan: jadwalForm.catatan || null,
      });
      setJadwalForm(emptyJadwalForm);
      setEligiblePetugas([]);
      setMessage("Jadwal berhasil ditambahkan.");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menambah jadwal.");
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
      setMessage(error instanceof Error ? error.message : "Gagal membatalkan jadwal.");
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <select
              value={jadwalForm.petugas_id}
              onChange={(event) =>
                setJadwalForm({ ...jadwalForm, petugas_id: event.target.value })
              }
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
              required
            >
              <option value="">Pilih petugas</option>
              {petugasOptions.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={item.eligible === false}
                >
                  {item.asisten_imam}
                  {item.eligible === false ? " - tunggu giliran" : ""}
                </option>
              ))}
            </select>
            <select
              value={jadwalForm.koordinator_id}
              onChange={(event) =>
                setJadwalForm({
                  ...jadwalForm,
                  koordinator_id: event.target.value,
                })
              }
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            >
              <option value="">Pilih koordinator (opsional)</option>
              {activeKoordinator.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nama}
                </option>
              ))}
            </select>
            <input
              value={jadwalForm.catatan}
              onChange={(event) =>
                setJadwalForm({ ...jadwalForm, catatan: event.target.value })
              }
              placeholder="Catatan"
              className="w-full border rounded-xl px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <button
            disabled={submitting}
            className="mt-4 w-full bg-green-600 text-white rounded-xl py-2 text-xs font-black hover:bg-green-700 disabled:bg-green-300"
          >
            Simpan Jadwal
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
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">
            Jadwal Terbaru
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="py-2 pr-4">Tanggal</th>
                  <th className="py-2 pr-4">Jam</th>
                  <th className="py-2 pr-4">Petugas</th>
                  <th className="py-2 pr-4">Koordinator</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jadwal.map((item) => (
                  <tr key={item.id} className="text-gray-700">
                    <td className="py-3 pr-4 font-semibold">{item.tanggal}</td>
                    <td className="py-3 pr-4">{item.jam}</td>
                    <td className="py-3 pr-4">{item.nama_petugas}</td>
                    <td className="py-3 pr-4">
                      {item.nama_koordinator || "-"}
                    </td>
                    <td className="py-3 pr-4 uppercase text-[10px] font-black">
                      {item.status}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {item.status !== "batal" && (
                        <button
                          type="button"
                          onClick={() => handleCancelJadwal(item.id)}
                          disabled={submitting}
                          className="text-red-600 font-bold hover:text-red-800 disabled:text-red-300"
                        >
                          Batalkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {jadwal.length === 0 && (
                  <tr>
                    <td className="py-8 text-center text-gray-400" colSpan={6}>
                      Belum ada jadwal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
