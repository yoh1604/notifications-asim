"use client";

import { useEffect, useState, Dispatch, SetStateAction, useCallback } from "react";
import type { Jadwal, JadwalPetugas } from "@/lib/types";

type ApiPetugas = {
  id: number; // petugas ID
  jadwal_petugas_id: number; // jadwal_petugas ID
  nama: string;
  asisten_imam: string;
  no_hp: string | null;
  urutan: number;
  total_penugasan: number;
};

type AttendanceOfficer = {
  id: number; // petugas ID
  jadwal_petugas_id: number; // jadwal_petugas ID
  nama: string;
  asisten_imam: string;
  no_hp: string | null;
  urutan: number;
  total_penugasan: number;
  penugasan_id: number; // penugasan_petugas ID
  attendance_status: "pending" | "attended";
  attendance_checked_in_at: string | null;
  jadwal_id: number;
};

type ScheduleData = {
  id: number;
  tanggal: string;
  jam: string;
  petugas: AttendanceOfficer[];
  status: string;
};

type SwapModalState = {
  isOpen: boolean;
  officerId: number;
  officerName: string;
  jadwalPetugasId: number;
  penugasanId: number;
  mode: "manual" | "random";
};

type AvailableOfficer = {
  id: number;
  nama: string;
  total_penugasan: number;
};

type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

const formatTanggalDisplay = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${day}-${month}-${year}`;
};

const formatJamDisplay = (jamStr: string): string => {
  const [hour, minute] = jamStr.split(":");
  return `${hour}:${minute}`;
};

const showToast = (
  toasts: Toast[],
  setToasts: Dispatch<SetStateAction<Toast[]>>,
  message: string,
  type: "success" | "error" | "info" = "info",
) => {
  const id = Math.random().toString(36).substr(2, 9);
  const newToast: Toast = { id, message, type };
  setToasts((prev) => [...prev, newToast]);

  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
};

export default function AttendanceManager() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [swapModal, setSwapModal] = useState<SwapModalState>({
    isOpen: false,
    officerId: 0,
    officerName: "",
    jadwalPetugasId: 0,
    penugasanId: 0,
    mode: "manual",
  });
  const [availableOfficers, setAvailableOfficers] = useState<AvailableOfficer[]>([]);
  const [selectedReplacement, setSelectedReplacement] = useState<number>(0);

  // 1. FUNGSI LOAD DATA UTAMA (Bebas Cache)
  const loadScheduleData = useCallback(async (isInitialLoad = false) => {
    if (!selectedDate || !selectedTime) return;
    
    if (isInitialLoad) setLoading(true);
    
    try {
      // Tambahkan { cache: "no-store" } agar selalu narik data terbaru dari DB
      const response = await fetch("/api/jadwal", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch schedule");

      const data = (await response.json()) as {
        data: Array<{
          id: number;
          tanggal: string;
          jam: string;
          jumlah_petugas: number;
          assigned_count: number;
          koordinator_id: number | null;
          nama_koordinator: string | null;
          status: string;
          catatan: string | null;
          petugas: ApiPetugas[];
        }>;
      };
      
      const found = data.data.find(
        (j) => j.tanggal === selectedDate && j.jam === selectedTime,
      );

      if (found) {
        // Fetch attendance dengan { cache: "no-store" }
        const attendanceResponse = await fetch(
          `/api/jadwal/${found.id}/attendance`,
          { cache: "no-store" }
        );
        
        let attendanceMap: Record<
          number,
          {
            penugasan_id: number;
            attendance_status: string;
            attendance_checked_in_at: string | null;
          }
        > = {};

        if (attendanceResponse.ok) {
          const attendanceData = (await attendanceResponse.json()) as {
            data: Array<{
              jadwal_petugas_id: number;
              penugasan_id: number;
              attendance_status: string;
              attendance_checked_in_at: string | null;
            }>;
          };

          attendanceData.data.forEach((item) => {
            attendanceMap[item.jadwal_petugas_id] = {
              penugasan_id: item.penugasan_id,
              attendance_status: item.attendance_status,
              attendance_checked_in_at: item.attendance_checked_in_at,
            };
          });
        }

        const scheduleData: ScheduleData = {
          ...found,
          petugas: found.petugas.map((p) => {
            const attendance = attendanceMap[p.jadwal_petugas_id] || {
              penugasan_id: 0,
              attendance_status: "pending",
              attendance_checked_in_at: null,
            };
            return {
              ...p,
              jadwal_petugas_id: p.jadwal_petugas_id,
              penugasan_id: attendance.penugasan_id,
              attendance_status: attendance.attendance_status as "pending" | "attended",
              attendance_checked_in_at: attendance.attendance_checked_in_at,
              jadwal_id: found.id,
            };
          }),
        };
        setSchedule(scheduleData);
      } else {
        setSchedule(null);
        if (isInitialLoad) {
          showToast(toasts, setToasts, "Jadwal tidak ditemukan untuk waktu yang dipilih.", "info");
        }
      }
    } catch (error) {
      showToast(
        toasts,
        setToasts,
        error instanceof Error ? error.message : "Failed to fetch schedule",
        "error",
      );
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [selectedDate, selectedTime, toasts]);

  // 2. USE EFFECT HANYA MEMANGGIL FUNGSI DI ATAS
  useEffect(() => {
    loadScheduleData(true);
  }, [selectedDate, selectedTime]);

  const isDateConfirmed = schedule?.status === "selesai";
  const canActOnSchedule = !isDateConfirmed && schedule?.status === "terjadwal";

  const handleCheckIn = async (officer: AttendanceOfficer) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/jadwal/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          penugasan_id: officer.penugasan_id,
          note: "Check-in via admin interface",
        }),
      });

      const result = (await response.json()) as {
        data?: AttendanceOfficer;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Check-in failed");
      }

      showToast(toasts, setToasts, `✅ ${officer.nama} berhasil dicheck-in`, "success");

      // 3A. REFRESH DATA TANPA HARUS RELOAD BROWSER
      await loadScheduleData(false);

    } catch (error) {
      showToast(
        toasts,
        setToasts,
        error instanceof Error ? error.message : "Check-in failed",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openSwapModal = async (officer: AttendanceOfficer) => {
    
    if (!schedule) return;

    setSwapModal({
      isOpen: true,
      officerId: officer.id,
      officerName: officer.nama,
      jadwalPetugasId: officer.jadwal_petugas_id,
      penugasanId: officer.penugasan_id,
      mode: "manual",
    });

    const assignedOfficerIds = schedule.petugas.map((p) => p.id);

    try {
      const response = await fetch("/api/petugas", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          data: Array<{ id: number; nama: string; total_penugasan: number }>;
        };
        
        // FILTER: Hanya tampilkan petugas yang TIDAK ADA di assignedOfficerIds
        setAvailableOfficers(
          data.data.filter(
            (p) => !assignedOfficerIds.includes(p.id) && p.total_penugasan <= 5
          )
        );
      }
    } catch (error) {
      console.error("Failed to fetch available officers:", error);
    }
  };

  //   try {
  //     const response = await fetch("/api/petugas", { cache: "no-store" });
  //     if (response.ok) {
  //       const data = (await response.json()) as {
  //         data: Array<{ id: number; nama: string; total_penugasan: number }>;
  //       };
  //       setAvailableOfficers(
  //         data.data.filter((p) => p.id !== officer.id && p.total_penugasan <= 5),
  //       );
  //     }
  //   } catch (error) {
  //     console.error("Failed to fetch available officers:", error);
  //   }
  // };

  const handleSwap = async () => {
    if (!schedule) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        jadwal_id: schedule.id,
        jadwal_petugas_id: swapModal.jadwalPetugasId,
        mode: swapModal.mode,
      };

      if (swapModal.mode === "manual" && !selectedReplacement) {
        throw new Error("Pilih petugas pengganti terlebih dahulu");
      }

      if (swapModal.mode === "manual") {
        payload.petugas_pengganti_id = selectedReplacement;
      }

      const response = await fetch("/api/jadwal/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        data?: ScheduleData;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Swap failed");
      }

      showToast(toasts, setToasts, `✅ Penggantian petugas berhasil`, "success");

      setSwapModal({ ...swapModal, isOpen: false });
      setSelectedReplacement(0);

      // 3B. REFRESH DATA TANPA HARUS RELOAD BROWSER
      await loadScheduleData(false);

    } catch (error) {
      showToast(
        toasts,
        setToasts,
        error instanceof Error ? error.message : "Swap failed",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            📋 Manajemen Kehadiran
          </h1>
          <p className="text-gray-600 mt-2">
            Kelola check-in dan penggantian petugas untuk jadwal yang sudah
            tersimpan
          </p>
        </div>

        {/* Date & Time Selection */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pilih Tanggal
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pilih Jam
              </label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-end">
              {selectedDate && selectedTime && (
                <div className="text-sm text-green-600 font-medium">
                  ✅ {formatTanggalDisplay(selectedDate)} -{" "}
                  {formatJamDisplay(selectedTime)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-gray-600 mt-2">Memuat jadwal...</p>
          </div>
        )}

        {/* Schedule Status Alert */}
        {schedule && isDateConfirmed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              ⚠️ Jadwal ini sudah terkunci. Attendance status tidak dapat
              diubah.
            </p>
          </div>
        )}

        {/* Officers List */}
        {!loading && schedule && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Petugas - {formatTanggalDisplay(schedule.tanggal)}{" "}
                {formatJamDisplay(schedule.jam)}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Total: {schedule.petugas.length} petugas
              </p>
            </div>

            {schedule.petugas.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">
                  Tidak ada petugas untuk jadwal ini
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {schedule.petugas.map((officer) => (
                  <div
                    key={officer.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    {/* Officer Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                          {officer.urutan}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {officer.nama}
                          </p>
                          <p className="text-sm text-gray-500">
                            Penugasan: {officer.total_penugasan}x
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Status Badge */}
                    <div className="flex-1 text-center">
                      {officer.attendance_status === "attended" ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                          <span className="text-green-700 font-medium text-sm">
                            ✅ Hadir
                          </span>
                          {officer.attendance_checked_in_at && (
                            <span className="text-xs text-green-600">
                              (
                              {new Date(
                                officer.attendance_checked_in_at,
                              ).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              )
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-full">
                          <span className="text-yellow-700 font-medium text-sm">
                            ⏳ Menunggu
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-1 flex items-center justify-end gap-3">
                      {officer.attendance_status === "pending" && (
                        <>
                          <button
                            onClick={() => handleCheckIn(officer)}
                            disabled={
                              submitting || isDateConfirmed || !canActOnSchedule
                            }
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                          >
                            ✓ Hadir
                          </button>

                          <button
                            onClick={() => openSwapModal(officer)}
                            disabled={
                              submitting || isDateConfirmed || !canActOnSchedule
                            }
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                          >
                            🔄 Ganti
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !schedule && selectedDate && selectedTime && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <p className="text-gray-500 text-lg">
              Tidak ada jadwal untuk tanggal dan jam yang dipilih
            </p>
          </div>
        )}
      </div>

      {/* Swap Modal */}
      {swapModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 pointer-events-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              🔄 Ganti Petugas
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Ganti petugas:{" "}
              <span className="font-semibold">{swapModal.officerName}</span>
            </p>

            {/* Mode Selection */}
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="swap-mode"
                  value="manual"
                  checked={swapModal.mode === "manual"}
                  onChange={() =>
                    setSwapModal({ ...swapModal, mode: "manual" })
                  }
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <p className="font-medium text-gray-900">Manual</p>
                  <p className="text-xs text-gray-500">
                    Pilih petugas pengganti dari daftar
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="swap-mode"
                  value="random"
                  checked={swapModal.mode === "random"}
                  onChange={() =>
                    setSwapModal({ ...swapModal, mode: "random" })
                  }
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <p className="font-medium text-gray-900">Otomatis</p>
                  <p className="text-xs text-gray-500">
                    Sistem akan mencari pengganti yang sesuai
                  </p>
                </div>
              </label>
            </div>

            {/* Manual Mode - Officer Selection */}
            {swapModal.mode === "manual" && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Petugas Pengganti
                </label>
                <select
                  value={selectedReplacement}
                  onChange={(e) =>
                    setSelectedReplacement(Number(e.target.value))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Pilih Petugas --</option>
                  {availableOfficers.map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.nama} ({officer.total_penugasan}x penugasan)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Random Mode - Confirmation Message */}
            {swapModal.mode === "random" && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  ℹ️ Sistem akan secara otomatis mencari satu petugas pengganti
                  yang memenuhi kriteria Smart Randomizer.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSwapModal({ ...swapModal, isOpen: false });
                  setSelectedReplacement(0);
                }}
                disabled={submitting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 transition-colors font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleSwap}
                disabled={
                  submitting ||
                  (swapModal.mode === "manual" && !selectedReplacement)
                }
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {submitting ? "Memproses..." : "Ganti"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-40 space-y-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-fade-in ${
              toast.type === "success"
                ? "bg-green-500"
                : toast.type === "error"
                  ? "bg-red-500"
                  : "bg-blue-500"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
// "use client";

// import { useEffect, useState, Dispatch, SetStateAction } from "react";
// import type { Jadwal, JadwalPetugas } from "@/lib/types";

// type ApiPetugas = {
//   id: number; // petugas ID
//   jadwal_petugas_id: number; // jadwal_petugas ID
//   nama: string;
//   asisten_imam: string;
//   no_hp: string | null;
//   urutan: number;
//   total_penugasan: number;
// };

// type AttendanceOfficer = {
//   id: number; // petugas ID
//   jadwal_petugas_id: number; // jadwal_petugas ID
//   nama: string;
//   asisten_imam: string;
//   no_hp: string | null;
//   urutan: number;
//   total_penugasan: number;
//   penugasan_id: number; // penugasan_petugas ID
//   attendance_status: "pending" | "attended";
//   attendance_checked_in_at: string | null;
//   jadwal_id: number;
// };

// type ScheduleData = {
//   id: number;
//   tanggal: string;
//   jam: string;
//   petugas: AttendanceOfficer[];
//   status: string;
// };

// type SwapModalState = {
//   isOpen: boolean;
//   officerId: number;
//   officerName: string;
//   jadwalPetugasId: number;
//   penugasanId: number;
//   mode: "manual" | "random";
// };

// type AvailableOfficer = {
//   id: number;
//   nama: string;
//   total_penugasan: number;
// };

// type Toast = {
//   id: string;
//   message: string;
//   type: "success" | "error" | "info";
// };

// const formatTanggalDisplay = (dateStr: string): string => {
//   const [year, month, day] = dateStr.split("-");
//   return `${day}-${month}-${year}`;
// };

// const formatJamDisplay = (jamStr: string): string => {
//   const [hour, minute] = jamStr.split(":");
//   return `${hour}:${minute}`;
// };

// const showToast = (
//   toasts: Toast[],
//   setToasts: Dispatch<SetStateAction<Toast[]>>,
//   message: string,
//   type: "success" | "error" | "info" = "info",
// ) => {
//   const id = Math.random().toString(36).substr(2, 9);
//   const newToast: Toast = { id, message, type };
//   setToasts([...toasts, newToast]);

//   setTimeout(() => {
//     setToasts((prev) => prev.filter((t) => t.id !== id));
//   }, 4000);
// };

// export default function AttendanceManager() {
//   const [selectedDate, setSelectedDate] = useState<string>("");
//   const [selectedTime, setSelectedTime] = useState<string>("");
//   const [schedule, setSchedule] = useState<ScheduleData | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [submitting, setSubmitting] = useState(false);
//   const [toasts, setToasts] = useState<Toast[]>([]);
//   const [swapModal, setSwapModal] = useState<SwapModalState>({
//     isOpen: false,
//     officerId: 0,
//     officerName: "",
//     jadwalPetugasId: 0,
//     penugasanId: 0,
//     mode: "manual",
//   });
//   const [availableOfficers, setAvailableOfficers] = useState<
//     AvailableOfficer[]
//   >([]);
//   const [selectedReplacement, setSelectedReplacement] = useState<number>(0);

//   useEffect(() => {
//     if (!selectedDate || !selectedTime) return;

//     const fetchSchedule = async () => {
//       setLoading(true);
//       try {
//         const response = await fetch("/api/jadwal");
//         if (!response.ok) throw new Error("Failed to fetch schedule");

//         const data = (await response.json()) as {
//           data: Array<{
//             id: number;
//             tanggal: string;
//             jam: string;
//             jumlah_petugas: number;
//             assigned_count: number;
//             koordinator_id: number | null;
//             nama_koordinator: string | null;
//             status: string;
//             catatan: string | null;
//             petugas: ApiPetugas[];
//           }>;
//         };
//         const found = data.data.find(
//           (j) => j.tanggal === selectedDate && j.jam === selectedTime,
//         );

//         if (found) {
//           // Fetch attendance data for this schedule
//           const attendanceResponse = await fetch(
//             `/api/jadwal/${found.id}/attendance`,
//           );
//           let attendanceMap: Record<
//             number,
//             {
//               penugasan_id: number;
//               attendance_status: string;
//               attendance_checked_in_at: string | null;
//             }
//           > = {};

//           if (attendanceResponse.ok) {
//             const attendanceData = (await attendanceResponse.json()) as {
//               data: Array<{
//                 jadwal_petugas_id: number;
//                 penugasan_id: number;
//                 attendance_status: string;
//                 attendance_checked_in_at: string | null;
//               }>;
//             };
//             console.log(attendanceData.data);

//             attendanceData.data.forEach((item) => {
//               attendanceMap[item.jadwal_petugas_id] = {
//                 penugasan_id: item.penugasan_id,
//                 attendance_status: item.attendance_status,
//                 attendance_checked_in_at: item.attendance_checked_in_at,
//               };
//             });
//           }

//           const scheduleData: ScheduleData = {
//             ...found,
//             petugas: found.petugas.map((p) => {
//               const attendance = attendanceMap[p.jadwal_petugas_id] || {
//                 penugasan_id: 0,
//                 attendance_status: "pending",
//                 attendance_checked_in_at: null,
//               };
//               return {
//                 ...p,
//                 jadwal_petugas_id: p.jadwal_petugas_id,
//                 penugasan_id: attendance.penugasan_id,
//                 attendance_status: attendance.attendance_status as
//                   | "pending"
//                   | "attended",
//                 attendance_checked_in_at: attendance.attendance_checked_in_at,
//                 jadwal_id: found.id,
//               };
//             }),
//           };
//           setSchedule(scheduleData);
//         } else {
//           setSchedule(null);
//           showToast(
//             toasts,
//             setToasts,
//             "Jadwal tidak ditemukan untuk waktu yang dipilih.",
//             "info",
//           );
//         }
//       } catch (error) {
//         showToast(
//           toasts,
//           setToasts,
//           error instanceof Error ? error.message : "Failed to fetch schedule",
//           "error",
//         );
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchSchedule();
//   }, [selectedDate, selectedTime]);

//   const isDateConfirmed = schedule?.status === "selesai";
//   const canActOnSchedule = !isDateConfirmed && schedule?.status === "terjadwal";

//   const handleCheckIn = async (officer: AttendanceOfficer) => {
//     setSubmitting(true);
//     try {
//       const response = await fetch("/api/jadwal/check-in", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           penugasan_id: officer.penugasan_id,
//           note: "Check-in via admin interface",
//         }),
//       });

//       const result = (await response.json()) as {
//         data?: AttendanceOfficer;
//         error?: string;
//       };
//       if (!response.ok) {
//         throw new Error(result.error || "Check-in failed");
//       }

//       showToast(
//         toasts,
//         setToasts,
//         `✅ ${officer.nama} berhasil dicheck-in`,
//         "success",
//       );

//       // Refresh schedule
//       if (selectedDate && selectedTime) {
//         const refreshResponse = await fetch("/api/jadwal");
//         if (refreshResponse.ok) {
//           const data = (await refreshResponse.json()) as { data: Jadwal[] };
//           const updated = data.data.find(
//             (j) => j.tanggal === selectedDate && j.jam === selectedTime,
//           );
//           if (updated) {
//             // Fetch attendance data for updated schedule
//             const attendanceResponse = await fetch(
//               `/api/jadwal/${updated.id}/attendance`,
//             );
//             let attendanceMap: Record<
//               number,
//               {
//                 penugasan_id: number;
//                 attendance_status: string;
//                 attendance_checked_in_at: string | null;
//               }
//             > = {};

//             if (attendanceResponse.ok) {
//               const attendanceData = (await attendanceResponse.json()) as {
//                 data: Array<{
//                   jadwal_petugas_id: number;
//                   penugasan_id: number;
//                   attendance_status: string;
//                   attendance_checked_in_at: string | null;
//                 }>;
//               };
//               attendanceData.data.forEach((item) => {
//                 attendanceMap[item.jadwal_petugas_id] = {
//                   penugasan_id: item.penugasan_id,
//                   attendance_status: item.attendance_status,
//                   attendance_checked_in_at: item.attendance_checked_in_at,
//                 };
//               });
//             }

//             setSchedule({
//               ...updated,
//               petugas: updated.petugas.map((p) => {
//                 const attendance = attendanceMap[p.id] || {
//                   penugasan_id: 0,
//                   attendance_status: "pending",
//                   attendance_checked_in_at: null,
//                 };
//                 return {
//                   ...p,
//                   jadwal_petugas_id: p.id,
//                   penugasan_id: attendance.penugasan_id,
//                   attendance_status: attendance.attendance_status as
//                     | "pending"
//                     | "attended",
//                   attendance_checked_in_at: attendance.attendance_checked_in_at,
//                   jadwal_id: updated.id,
//                 };
//               }),
//             });
//           }
//         }
//       }
//     } catch (error) {
//       showToast(
//         toasts,
//         setToasts,
//         error instanceof Error ? error.message : "Check-in failed",
//         "error",
//       );
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const openSwapModal = async (officer: AttendanceOfficer) => {
//     setSwapModal({
//       isOpen: true,
//       officerId: officer.id,
//       officerName: officer.nama,
//       jadwalPetugasId: officer.jadwal_petugas_id,
//       penugasanId: officer.penugasan_id,
//       mode: "manual",
//     });

//     // Fetch available officers for manual mode
//     try {
//       const response = await fetch("/api/petugas");
//       if (response.ok) {
//         const data = (await response.json()) as {
//           data: Array<{ id: number; nama: string; total_penugasan: number }>;
//         };
//         setAvailableOfficers(
//           data.data.filter(
//             (p) => p.id !== officer.id && p.total_penugasan <= 5,
//           ),
//         );
//       }
//     } catch (error) {
//       console.error("Failed to fetch available officers:", error);
//     }
//   };

//   const handleSwap = async () => {
//     if (!schedule) return;

//     setSubmitting(true);
//     try {
//       const payload: Record<string, unknown> = {
//         jadwal_id: schedule.id,
//         jadwal_petugas_id: swapModal.jadwalPetugasId,
//         mode: swapModal.mode,
//       };

//       if (swapModal.mode === "manual" && !selectedReplacement) {
//         throw new Error("Pilih petugas pengganti terlebih dahulu");
//       }

//       if (swapModal.mode === "manual") {
//         payload.petugas_pengganti_id = selectedReplacement;
//       }

//       const response = await fetch("/api/jadwal/swap", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       const result = (await response.json()) as {
//         data?: ScheduleData;
//         error?: string;
//       };
//       if (!response.ok) {
//         throw new Error(result.error || "Swap failed");
//       }

//       showToast(
//         toasts,
//         setToasts,
//         `✅ Penggantian petugas berhasil`,
//         "success",
//       );

//       setSwapModal({ ...swapModal, isOpen: false });
//       setSelectedReplacement(0);

//       // Refresh schedule
//       if (selectedDate && selectedTime) {
//         const refreshResponse = await fetch("/api/jadwal");
//         if (refreshResponse.ok) {
//           const data = (await refreshResponse.json()) as { data: Jadwal[] };
//           const updated = data.data.find(
//             (j) => j.tanggal === selectedDate && j.jam === selectedTime,
//           );
//           if (updated) {
//             // Fetch attendance data for updated schedule
//             const attendanceResponse = await fetch(
//               `/api/jadwal/${updated.id}/attendance`,
//             );
//             let attendanceMap: Record<
//               number,
//               {
//                 penugasan_id: number;
//                 attendance_status: string;
//                 attendance_checked_in_at: string | null;
//               }
//             > = {};

//             if (attendanceResponse.ok) {
//               const attendanceData = (await attendanceResponse.json()) as {
//                 data: Array<{
//                   jadwal_petugas_id: number;
//                   penugasan_id: number;
//                   attendance_status: string;
//                   attendance_checked_in_at: string | null;
//                 }>;
//               };
//               attendanceData.data.forEach((item) => {
//                 attendanceMap[item.jadwal_petugas_id] = {
//                   penugasan_id: item.penugasan_id,
//                   attendance_status: item.attendance_status,
//                   attendance_checked_in_at: item.attendance_checked_in_at,
//                 };
//               });
//             }

//             setSchedule({
//               ...updated,
//               petugas: updated.petugas.map((p) => {
//                 const attendance = attendanceMap[p.id] || {
//                   penugasan_id: 0,
//                   attendance_status: "pending",
//                   attendance_checked_in_at: null,
//                 };
//                 return {
//                   ...p,
//                   jadwal_petugas_id: p.id,
//                   penugasan_id: attendance.penugasan_id,
//                   attendance_status: attendance.attendance_status as
//                     | "pending"
//                     | "attended",
//                   attendance_checked_in_at: attendance.attendance_checked_in_at,
//                   jadwal_id: updated.id,
//                 };
//               }),
//             });
//           }
//         }
//       }
//     } catch (error) {
//       showToast(
//         toasts,
//         setToasts,
//         error instanceof Error ? error.message : "Swap failed",
//         "error",
//       );
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gray-50 p-6">
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div className="mb-8">
//           <h1 className="text-3xl font-bold text-gray-900">
//             📋 Manajemen Kehadiran
//           </h1>
//           <p className="text-gray-600 mt-2">
//             Kelola check-in dan penggantian petugas untuk jadwal yang sudah
//             tersimpan
//           </p>
//         </div>

//         {/* Date & Time Selection */}
//         <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
//           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-2">
//                 Pilih Tanggal
//               </label>
//               <input
//                 type="date"
//                 value={selectedDate}
//                 onChange={(e) => setSelectedDate(e.target.value)}
//                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-2">
//                 Pilih Jam
//               </label>
//               <input
//                 type="time"
//                 value={selectedTime}
//                 onChange={(e) => setSelectedTime(e.target.value)}
//                 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//               />
//             </div>
//             <div className="flex items-end">
//               {selectedDate && selectedTime && (
//                 <div className="text-sm text-green-600 font-medium">
//                   ✅ {formatTanggalDisplay(selectedDate)} -{" "}
//                   {formatJamDisplay(selectedTime)}
//                 </div>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Loading State */}
//         {loading && (
//           <div className="text-center py-12">
//             <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
//             <p className="text-gray-600 mt-2">Memuat jadwal...</p>
//           </div>
//         )}

//         {/* Schedule Status Alert */}
//         {schedule && isDateConfirmed && (
//           <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
//             <p className="text-sm text-yellow-800">
//               ⚠️ Jadwal ini sudah terkunci. Attendance status tidak dapat
//               diubah.
//             </p>
//           </div>
//         )}

//         {/* Officers List */}
//         {!loading && schedule && (
//           <div className="bg-white rounded-lg shadow-sm overflow-hidden">
//             <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
//               <h2 className="text-lg font-semibold text-gray-900">
//                 Petugas - {formatTanggalDisplay(schedule.tanggal)}{" "}
//                 {formatJamDisplay(schedule.jam)}
//               </h2>
//               <p className="text-sm text-gray-600 mt-1">
//                 Total: {schedule.petugas.length} petugas
//               </p>
//             </div>

//             {schedule.petugas.length === 0 ? (
//               <div className="px-6 py-12 text-center">
//                 <p className="text-gray-500">
//                   Tidak ada petugas untuk jadwal ini
//                 </p>
//               </div>
//             ) : (
//               <div className="divide-y divide-gray-200">
//                 {schedule.petugas.map((officer) => (
//                   <div
//                     key={officer.id}
//                     className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
//                   >
//                     {/* Officer Info */}
//                     <div className="flex-1">
//                       <div className="flex items-center gap-3">
//                         <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
//                           {officer.urutan}
//                         </div>
//                         <div>
//                           <p className="font-medium text-gray-900">
//                             {officer.nama}
//                           </p>
//                           <p className="text-sm text-gray-500">
//                             Penugasan: {officer.total_penugasan}x
//                           </p>
//                         </div>
//                       </div>
//                     </div>

//                     {/* Attendance Status Badge */}
//                     <div className="flex-1 text-center">
//                       {officer.attendance_status === "attended" ? (
//                         <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
//                           <span className="text-green-700 font-medium text-sm">
//                             ✅ Hadir
//                           </span>
//                           {officer.attendance_checked_in_at && (
//                             <span className="text-xs text-green-600">
//                               (
//                               {new Date(
//                                 officer.attendance_checked_in_at,
//                               ).toLocaleTimeString("id-ID", {
//                                 hour: "2-digit",
//                                 minute: "2-digit",
//                               })}
//                               )
//                             </span>
//                           )}
//                         </div>
//                       ) : (
//                         <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-full">
//                           <span className="text-yellow-700 font-medium text-sm">
//                             ⏳ Menunggu
//                           </span>
//                         </div>
//                       )}
//                     </div>

//                     {/* Action Buttons */}
//                     <div className="flex-1 flex items-center justify-end gap-3">
//                       {officer.attendance_status === "pending" && (
//                         <>
//                           <button
//                             onClick={() => handleCheckIn(officer)}
//                             disabled={
//                               submitting || isDateConfirmed || !canActOnSchedule
//                             }
//                             className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
//                           >
//                             ✓ Hadir
//                           </button>

//                           <button
//                             onClick={() => openSwapModal(officer)}
//                             disabled={
//                               submitting || isDateConfirmed || !canActOnSchedule
//                             }
//                             className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
//                           >
//                             🔄 Ganti
//                           </button>
//                         </>
//                       )}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         )}

//         {/* Empty State */}
//         {!loading && !schedule && selectedDate && selectedTime && (
//           <div className="bg-white rounded-lg shadow-sm p-12 text-center">
//             <p className="text-gray-500 text-lg">
//               Tidak ada jadwal untuk tanggal dan jam yang dipilih
//             </p>
//           </div>
//         )}
//       </div>

//       {/* Swap Modal */}
//       {swapModal.isOpen && (
//         <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
//           <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 pointer-events-auto">
//             <h3 className="text-lg font-bold text-gray-900 mb-4">
//               🔄 Ganti Petugas
//             </h3>
//             <p className="text-sm text-gray-600 mb-6">
//               Ganti petugas:{" "}
//               <span className="font-semibold">{swapModal.officerName}</span>
//             </p>

//             {/* Mode Selection */}
//             <div className="space-y-3 mb-6">
//               <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
//                 <input
//                   type="radio"
//                   name="swap-mode"
//                   value="manual"
//                   checked={swapModal.mode === "manual"}
//                   onChange={() =>
//                     setSwapModal({ ...swapModal, mode: "manual" })
//                   }
//                   className="w-4 h-4 text-blue-600"
//                 />
//                 <div>
//                   <p className="font-medium text-gray-900">Manual</p>
//                   <p className="text-xs text-gray-500">
//                     Pilih petugas pengganti dari daftar
//                   </p>
//                 </div>
//               </label>

//               <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
//                 <input
//                   type="radio"
//                   name="swap-mode"
//                   value="random"
//                   checked={swapModal.mode === "random"}
//                   onChange={() =>
//                     setSwapModal({ ...swapModal, mode: "random" })
//                   }
//                   className="w-4 h-4 text-blue-600"
//                 />
//                 <div>
//                   <p className="font-medium text-gray-900">Otomatis</p>
//                   <p className="text-xs text-gray-500">
//                     Sistem akan mencari pengganti yang sesuai
//                   </p>
//                 </div>
//               </label>
//             </div>

//             {/* Manual Mode - Officer Selection */}
//             {swapModal.mode === "manual" && (
//               <div className="mb-6">
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                   Pilih Petugas Pengganti
//                 </label>
//                 <select
//                   value={selectedReplacement}
//                   onChange={(e) =>
//                     setSelectedReplacement(Number(e.target.value))
//                   }
//                   className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 >
//                   <option value="">-- Pilih Petugas --</option>
//                   {availableOfficers.map((officer) => (
//                     <option key={officer.id} value={officer.id}>
//                       {officer.nama} ({officer.total_penugasan}x penugasan)
//                     </option>
//                   ))}
//                 </select>
//               </div>
//             )}

//             {/* Random Mode - Confirmation Message */}
//             {swapModal.mode === "random" && (
//               <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
//                 <p className="text-sm text-blue-800">
//                   ℹ️ Sistem akan secara otomatis mencari satu petugas pengganti
//                   yang memenuhi kriteria Smart Randomizer.
//                 </p>
//               </div>
//             )}

//             {/* Action Buttons */}
//             <div className="flex gap-3">
//               <button
//                 onClick={() => {
//                   setSwapModal({ ...swapModal, isOpen: false });
//                   setSelectedReplacement(0);
//                 }}
//                 disabled={submitting}
//                 className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 transition-colors font-medium"
//               >
//                 Batal
//               </button>
//               <button
//                 onClick={handleSwap}
//                 disabled={
//                   submitting ||
//                   (swapModal.mode === "manual" && !selectedReplacement)
//                 }
//                 className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
//               >
//                 {submitting ? "Memproses..." : "Ganti"}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Toast Notifications */}
//       <div className="fixed bottom-6 right-6 z-40 space-y-3">
//         {toasts.map((toast) => (
//           <div
//             key={toast.id}
//             className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-fade-in ${
//               toast.type === "success"
//                 ? "bg-green-500"
//                 : toast.type === "error"
//                   ? "bg-red-500"
//                   : "bg-blue-500"
//             }`}
//           >
//             {toast.message}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
