"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse"; // Import PapaParse untuk baca CSV

// --- HELPER UNTUK KIRIM WA ---
const sendWA = async (number: string, message: string) => {
  const token = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  let formattedNumber = String(number).replace(/[^0-9]/g, "");

  if (formattedNumber.startsWith("0")) {
    formattedNumber = "62" + formattedNumber.substring(1);
  } else if (!formattedNumber.startsWith("62")) {
    formattedNumber = "62" + formattedNumber;
  }

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token || "" },
      body: new URLSearchParams({ target: formattedNumber, message }),
    });
    return await response.json();
  } catch (err) {
    return { status: false };
  }
};

const downloadTemplate = (
  setLogs: (fn: (prev: string[]) => string[]) => void,
) => {
  try {
    // 1. Buat data contoh
    const data = [
      {
        Tanggal: "2026-02-14",
        Jam: "18:00",
        Nama_Petugas: "FRANSISCUS XAVERIUS SONY BOENAWAN",
        Nama_Koordinator: "IGNATIUS FEBIANTO KURNIAWAN",
      },
      {
        Tanggal: "2026-02-15",
        Jam: "07:00",
        Nama_Petugas: "CHRISTOPHER SETIABUDI",
        Nama_Koordinator: "IGNATIUS FEBIANTO KURNIAWAN",
      },
    ];

    // 2. Buat worksheet dan workbook
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jadwal");

    // 3. Atur lebar kolom agar rapi (Opsional)
    const wscols = [
      { wch: 15 }, // Tanggal
      { wch: 10 }, // Jam
      { wch: 35 }, // Nama Petugas
      { wch: 35 }, // Nama Koordinator
    ];
    worksheet["!cols"] = wscols;

    // 4. Proses Download
    XLSX.writeFile(workbook, "Template_Jadwal_AI.xlsx");

    setLogs((prev) => [...prev, "✅ Template Excel berhasil diunduh."]);
  } catch (err) {
    console.error("Gagal download template:", err);
    alert("Gagal mengunduh template. Pastikan library XLSX sudah terinstall.");
  }
};

const exportConverterToExcel = (converterData: any[]) => {
  try {
    // Filter hanya data yang ditemukan
    const exportData = converterData
      .filter((item) => item.status === "found")
      .map((item) => ({
        "Hari/Tanggal": item.TanggalRapi,
        Jam: item.Jam,
        "Nama Petugas": item.Nama_Petugas,
        Koordinator: item.Nama_Koordinator,
        "No HP": item.no_hp,
        "Link WhatsApp": item.waLink,
        Status: "Aktif",
      }));

    if (exportData.length === 0) {
      alert(
        "Tidak ada data yang dapat diexport. Pastikan ada data petugas yang ditemukan.",
      );
      return;
    }

    // Buat worksheet dan workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Link_WA_Converter");

    // Atur lebar kolom
    const wscols = [
      { wch: 20 }, // Hari/Tanggal
      { wch: 10 }, // Jam
      { wch: 35 }, // Nama Petugas
      { wch: 35 }, // Koordinator
      { wch: 15 }, // No HP
      { wch: 60 }, // Link WhatsApp
      { wch: 10 }, // Status
    ];
    worksheet["!cols"] = wscols;

    // Proses Download
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    XLSX.writeFile(workbook, `Link_WA_Converter_${timestamp}.xlsx`);

    alert(`✅ Berhasil export ${exportData.length} link WhatsApp ke Excel!`);
  } catch (err) {
    console.error("Gagal export converter:", err);
    alert("Gagal export data. Pastikan library XLSX sudah terinstall.");
  }
};

export default function UnifiedPage() {
  const [allAsimLocal, setAllAsimLocal] = useState<any[]>([]);
  const [groupedAsim, setGroupedAsim] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"batch" | "converter">("batch");
  const [converterData, setConverterData] = useState<any[]>([]);
  const [copyNotification, setCopyNotification] = useState<{
    id: string;
    show: boolean;
  }>({ id: "", show: false });
  const [pengawasConverter, setPengawasConverter] = useState<any[]>([]);
  const [koordinatorConverter, setKoordinatorConverter] = useState<any[]>([]);
  const [isSendingConverter, setIsSendingConverter] = useState(false);

  useEffect(() => {
    muatDataCSV();
  }, []);

  // 1. FUNGSI MEMBACA CSV LOKAL
  const muatDataCSV = () => {
    Papa.parse("/data/asisten_imam.csv", {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data;
        setAllAsimLocal(data);

        const grouped = data.reduce(
          (acc: Record<string, any[]>, item: any) => {
            const key = item.wilayah || "Tanpa Wilayah";
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
          },
          {} as Record<string, any[]>,
        ); // <--- Tambahkan tipe data di sini

        setGroupedAsim(grouped);
        setLoading(false);
      },
      error: (err) => {
        console.error("Gagal memuat CSV:", err);
        setLoading(false);
      },
    });
  };

  const isSmartMatch = (dbName: string, excelName: string) => {
    const clean = (str: string) => {
      if (!str) return "";
      return str
        .toString()
        .toUpperCase()
        .replace(/[\u00A0\u1680​\u180e\u2000-\u200b\u202f\u205f\u3000]/g, " ")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    const db = clean(dbName);
    const ex = clean(excelName);
    if (db === ex) return true;
    const dbParts = db.split(" ");
    const exParts = ex.split(" ");
    if (dbParts.length === exParts.length) {
      return dbParts.every(
        (part, i) =>
          part === exParts[i] ||
          (exParts[i].length === 1 && part.startsWith(exParts[i])),
      );
    }
    return false;
  };

  const handleUploadJadwal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setLogs(["📁 Memproses file jadwal..."]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, {
          type: "binary",
          cellDates: true,
          raw: false,
        });
        const wsname = workbook.SheetNames[0];
        const rawDataExcel: any[] = XLSX.utils.sheet_to_json(
          workbook.Sheets[wsname],
        );

        const dataExcel = rawDataExcel
          .map((row) => {
            const findValue = (possibleNames: string[]) => {
              const foundKey = Object.keys(row).find((key) =>
                possibleNames.includes(key.toLowerCase().trim()),
              );
              return foundKey ? row[foundKey] : null;
            };

            const tglRaw = findValue(["tanggal", "tgl", "date"]);
            const safeDate = tglRaw instanceof Date ? tglRaw : new Date();

            return {
              ...row,
              Nama_Petugas: String(findValue(["nama_petugas", "petugas"]) || "")
                .toUpperCase()
                .trim(),
              Nama_Koordinator: String(
                findValue(["nama_koordinator", "koordinator"]) || "",
              )
                .toUpperCase()
                .trim(),
              Jam: String(findValue(["jam", "waktu"]) || "-"),
              TanggalRapi: safeDate.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            };
          })
          .filter((item) => item.Nama_Petugas !== "");

        setPreviewData(dataExcel);
        setLogs((prev) => [...prev, "🚀 Memulai pengiriman pesan massal..."]);

        // Data Pengawas
        const listPengawas = allAsimLocal.filter((a) =>
          [
            "YAKOBUS HERI PRIYANTO",
            "AGUSTINUS WAHYU SULISTYO",
            "IGNATIUS FEBIANTO KURNIAWAN",
            "YOHANES DWI PRASETYO DARMAWAN",
          ]
            // ["ADMIN 1", "ADMIN 2"]
            .includes(String(a.asisten_imam).toUpperCase().trim()),
        );

        let laporanUntukPengawas: string[] = [];
        let setKoordinatorUnik = new Set<string>();

        // OBJEK REKAP UNTUK KOORDINATOR
        // Struktur: { "NAMA": { berhasil: [], gagal: [], no_hp: "" } }
        let rekapPerKoordinator: Record<
          string,
          { berhasil: string[]; gagal: string[]; no_hp: string }
        > = {};

        for (let i = 0; i < dataExcel.length; i++) {
          const row = dataExcel[i];
          const progress = `[${i + 1}/${dataExcel.length}]`;

          if (i > 0 && i % 10 === 0) {
            setLogs((prev) => [
              ...prev,
              "☕ Mencapai 10 pesan. Istirahat 3 menit agar aman...",
            ]);
            await new Promise((res) => setTimeout(res, 180000));
          }

          // Pecah Nama Koordinator
          const namaKoordArray = row.Nama_Koordinator.split(/[,&]|\bDAN\b/i)
            .map((n: string) => n.trim())
            .filter((n: string) => n !== "");
          const salamList = [
            "Salam Damai",
            "Berkah Dalem",
            "Shalom",
            "Selamat Pagi/Siang",
          ];
          const salamAcak =
            salamList[Math.floor(Math.random() * salamList.length)];
          const p = allAsimLocal.find((a) =>
            isSmartMatch(a.asisten_imam, row.Nama_Petugas),
          );
          const opsiInstruksi = [
            "Mohon hadir 30 menit sebelum ibadah dimulai. Jika berhalangan, hubungi Koordinator maksimal H-2.",
            "Harap tiba di lokasi 30 menit lebih awal. Jika berhalangan hadir, segera kabari Koordinator selambatnya H-2.",
            "Kehadiran diharapkan 30 menit sebelum mulai. Mohon konfirmasi ke Koordinator H-2 jika tidak bisa bertugas.",
          ];

          const instruksiAcak =
            opsiInstruksi[Math.floor(Math.random() * opsiInstruksi.length)];
          const daftarKoordData = namaKoordArray
            .map((nama: string) =>
              allAsimLocal.find((a) => isSmartMatch(a.asisten_imam, nama)),
            )
            .filter(Boolean);

          if (!p) {
            setLogs((prev) => [
              ...prev,
              `⚠️ ${progress} SKIP: "${row.Nama_Petugas}" tidak ditemukan di CSV.`,
            ]);
            // Catat sebagai gagal di setiap koordinator terkait
            daftarKoordData.forEach((k: any) => {
              if (!rekapPerKoordinator[k.asisten_imam])
                rekapPerKoordinator[k.asisten_imam] = {
                  berhasil: [],
                  gagal: [],
                  no_hp: k.no_hp,
                };
              rekapPerKoordinator[k.asisten_imam].gagal.push(
                `${row.Nama_Petugas} (Tidak ada di database)`,
              );
            });
            continue;
          }

          const linkChat = daftarKoordData
            .map((k: any) => {
              const rawNo = String(k.no_hp).replace(/[^0-9]/g, "");
              const cleanNo = rawNo.startsWith("0")
                ? "62" + rawNo.substring(1)
                : rawNo.startsWith("62")
                  ? rawNo
                  : "62" + rawNo;
              return `Klik chat ${k.asisten_imam}: wa.me/${cleanNo}`;
            })
            .join("\n");

          const msgPetugas = `*PENGINGAT TUGAS ASISTEN IMAM*

*${salamAcak}*
Bapak/Ibu *${row.Nama_Petugas}*

Mengingatkan kembali jadwal tugas pelayanan:
🗓️ *Hari/Tgl:* ${row.TanggalRapi}
⏰ *Jam:* ${row.Jam || "-"} WIB

${instruksiAcak}

Koordinator Anda:
*${row.Nama_Koordinator}*

${linkChat}

Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

Terima kasih. Tuhan memberkati. 🙏 `;
          const resP = await sendWA(p.no_hp, msgPetugas);
          const infoBaris = `${row.Nama_Petugas} (${row.Jam})`;

          daftarKoordData.forEach((k: any) => {
            const namaK = k.asisten_imam;
            if (!rekapPerKoordinator[namaK]) {
              rekapPerKoordinator[namaK] = {
                berhasil: [],
                gagal: [],
                no_hp: k.no_hp,
              };
            }
            if (resP.status)
              rekapPerKoordinator[namaK].berhasil.push(infoBaris);
            else rekapPerKoordinator[namaK].gagal.push(infoBaris);
            setKoordinatorUnik.add(namaK);
          });

          if (resP.status) {
            setLogs((prev) => [
              ...prev,
              `✅ ${progress} BERHASIL: ${row.Nama_Petugas}`,
            ]);
            laporanUntukPengawas.push(`✅ ${infoBaris}`);
          } else {
            setLogs((prev) => [
              ...prev,
              `❌ ${progress} GAGAL: ${row.Nama_Petugas}`,
            ]);
            laporanUntukPengawas.push(`❌ ${infoBaris} (Gagal WA)`);
          }

          const msJeda = Math.floor(
            Math.random() * (180000 - 120000 + 1) + 120000,
          );
          setLogs((prev) => [
            ...prev,
            `⏳ Jeda ${Math.round(msJeda / 1000)} detik sebelum pesan berikutnya...`,
          ]);
          await new Promise((res) => setTimeout(res, msJeda));
        }

        setLogs((prev) => [
          ...prev,
          "📱 Mengirim rekap ringkas ke para Koordinator...",
        ]);
        for (const namaK of Object.keys(rekapPerKoordinator)) {
          const data = rekapPerKoordinator[namaK];
          const tglTugas = dataExcel[0]?.TanggalRapi || "";

          let msgKoord = `*LAPORAN PENGIRIMAN JADWAL*\n\nHalo *${namaK}*, berikut rekap notifikasi tugas untuk tanggal:\n🗓️ ${tglTugas}\n`;

          if (data.berhasil.length > 0) {
            msgKoord += `\n✅ *BERHASIL TERKIRIM:*\n- ${data.berhasil.join("\n- ")}`;
          }

          if (data.gagal.length > 0) {
            msgKoord += `\n\n⚠️ *BELUM TERKIRIM:*\n- ${data.gagal.join("\n- ")}`;
          }

          msgKoord += `\n\nTerima kasih. 🙏`;

          await sendWA(data.no_hp, msgKoord);
          await new Promise((res) => setTimeout(res, 10000)); // Jeda antar koordinator
        }

        // --- 5. KIRIM REKAP KE SEMUA PENGAWAS ---
        if (laporanUntukPengawas.length > 0 && listPengawas.length > 0) {
          const tglTugas = dataExcel[0]?.TanggalRapi || "";
          const msgRekap = `*REKAP AKHIR SISTEM JADWAL*
🗓️ *Tgl Tugas:* ${tglTugas}
👔 *Koordinator:* ${Array.from(setKoordinatorUnik).join(", ")}

*Status Pengiriman:*
${laporanUntukPengawas.join("\n")}

✅ Seluruh proses telah selesai.`;

          for (const [index, pengawas] of listPengawas.entries()) {
            await sendWA(pengawas.no_hp, msgRekap);
            if (index < listPengawas.length - 1)
              await new Promise((res) => setTimeout(res, 10000));
          }
          setLogs((prev) => [
            ...prev,
            "📱 Rekap kolektif terkirim ke Pengawas.",
          ]);
        }

        setLogs((prev) => [...prev, "🏁 PROSES SELESAI SEMUA."]);
      } catch (err) {
        setLogs((prev) => [...prev, "❌ Terjadi kesalahan baca file."]);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // CONVERTER UPLOAD HANDLER
  const handleUploadConverter = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, {
          type: "binary",
          cellDates: true,
          raw: false,
        });
        const wsname = workbook.SheetNames[0];
        const rawDataExcel: any[] = XLSX.utils.sheet_to_json(
          workbook.Sheets[wsname],
        );

        const dataExcel = rawDataExcel
          .map((row) => {
            const findValue = (possibleNames: string[]) => {
              const foundKey = Object.keys(row).find((key) =>
                possibleNames.includes(key.toLowerCase().trim()),
              );
              return foundKey ? row[foundKey] : null;
            };

            const tglRaw = findValue(["tanggal", "tgl", "date"]);
            const safeDate = tglRaw instanceof Date ? tglRaw : new Date();

            const namaPetugas = String(
              findValue(["nama_petugas", "petugas"]) || "",
            )
              .toUpperCase()
              .trim();
            const jam = String(findValue(["jam", "waktu"]) || "-");
            const tanggalRapi = safeDate.toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            });

            return {
              ...row,
              Nama_Petugas: namaPetugas,
              Jam: jam,
              TanggalRapi: tanggalRapi,
              id: `${namaPetugas}-${jam}-${Date.now()}-${Math.random()}`,
            };
          })
          .filter((item) => item.Nama_Petugas !== "");

        // Proses data untuk converter - cari data petugas di database
        const processedData = dataExcel.map((row) => {
          const p = allAsimLocal.find((a) =>
            isSmartMatch(a.asisten_imam, row.Nama_Petugas),
          );

          if (!p) {
            return {
              ...row,
              no_hp: null,
              status: "not_found",
            };
          }

          const salamList = [
            "Salam Damai",
            "Berkah Dalem",
            "Shalom",
            "Selamat Pagi/Siang",
          ];
          const salamAcak =
            salamList[Math.floor(Math.random() * salamList.length)];

          const opsiInstruksi = [
            "Mohon hadir 30 menit sebelum ibadah dimulai. Jika berhalangan, hubungi Koordinator maksimal H-2.",
            "Harap tiba di lokasi 30 menit lebih awal. Jika berhalangan hadir, segera kabari Koordinator selambatnya H-2.",
            "Kehadiran diharapkan 30 menit sebelum mulai. Mohon konfirmasi ke Koordinator H-2 jika tidak bisa bertugas.",
          ];

          const instruksiAcak =
            opsiInstruksi[Math.floor(Math.random() * opsiInstruksi.length)];

          const namaKoordArray = row.Nama_Koordinator.split(/[,&]|\bDAN\b/i)
            .map((n: string) => n.trim())
            .filter((n: string) => n !== "");

          const daftarKoordData = namaKoordArray
            .map((nama: string) =>
              allAsimLocal.find((a) => isSmartMatch(a.asisten_imam, nama)),
            )
            .filter(Boolean);
          const linkChat = daftarKoordData
            .map((k: any) => {
              const rawNo = String(k.no_hp).replace(/[^0-9]/g, "");
              const cleanNo = rawNo.startsWith("0")
                ? "62" + rawNo.substring(1)
                : rawNo.startsWith("62")
                  ? rawNo
                  : "62" + rawNo;
              return `Klik chat ${k.asisten_imam}: wa.me/${cleanNo}`;
            })
            .join("\n");

          const msg = `*PENGINGAT TUGAS ASISTEN IMAM*

*${salamAcak}*
Bapak/Ibu *${row.Nama_Petugas}*

Mengingatkan kembali jadwal tugas pelayanan:
🗓️ *Hari/Tgl:* ${row.TanggalRapi}
🕐 *Jam:* ${row.Jam || "-"} WIB

${instruksiAcak}

Koordinator Anda:
*${row.Nama_Koordinator}*

${linkChat}

Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

Terima kasih. Tuhan memberkati. 🙏`;

          const normalizedNumber = String(p.no_hp)
            .replace(/[^0-9]/g, "")
            .replace(/^0/, "");
          // Use encodeURIComponent for proper URL encoding including emojis
          const waLink = `https://wa.me/62${normalizedNumber}?text=${encodeURIComponent(msg)}`;

          return {
            ...row,
            no_hp: p.no_hp,
            waLink,
            message: msg,
            status: "found",
          };
        });

        setConverterData(processedData);

        // Extract Pengawas data
        const listPengawas = allAsimLocal.filter((a) =>
          [
            "YAKOBUS HERI PRIYANTO",
            "AGUSTINUS WAHYU SULISTYO",
            "IGNATIUS FEBIANTO KURNIAWAN",
            "YOHANES DWI PRASETYO DARMAWAN",
            // "ADMIN 1",
            // "ADMIN 2",
          ].includes(String(a.asisten_imam).toUpperCase().trim()),
        );
        setPengawasConverter(listPengawas);

        // Extract unique Koordinator data
        const setKoordinatorUnik = new Set<string>();
        const koordinatorList: any[] = [];

        processedData.forEach((item) => {
          if (item.status === "found") {
            const namaKoordArray = item.Nama_Koordinator.split(/[,&]|\bDAN\b/i)
              .map((n: string) => n.trim())
              .filter((n: string) => n !== "");

            namaKoordArray.forEach((nama: string) => {
              if (!setKoordinatorUnik.has(nama)) {
                setKoordinatorUnik.add(nama);
                const koordData = allAsimLocal.find((a) =>
                  isSmartMatch(a.asisten_imam, nama),
                );
                if (koordData) {
                  koordinatorList.push(koordData);
                }
              }
            });
          }
        });

        setKoordinatorConverter(koordinatorList);
      } catch (err) {
        console.error("Gagal memproses converter:", err);
        alert("Gagal memproses file converter.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // Function to send recap to Pengawas and Koordinator
  const sendConverterRecap = async () => {
    if (isSendingConverter) return;
    setIsSendingConverter(true);

    // Initialize logs for converter recap
    setLogs(["🚀 Memulai pengiriman recap converter..."]);

    try {
      const tglTugas =
        converterData[0]?.TanggalRapi || new Date().toLocaleDateString("id-ID");
      const totalSuccess = converterData.filter(
        (d) => d.status === "found",
      ).length;
      const totalFailed = converterData.filter(
        (d) => d.status === "not_found",
      ).length;

      // Send to all Pengawas
      if (pengawasConverter.length > 0) {
        setLogs((prev) => [
          ...prev,
          `📊 Mengirim rekap ke ${pengawasConverter.length} Pengawas...`,
        ]);

        const msgPengawas = `*REKAP AKHIR SISTEM JADWAL*
🗓️ *Tgl Tugas:* ${tglTugas}
👔 *Koordinator:* ${Array.from(new Set(converterData.map((item) => item.Nama_Koordinator).filter((k) => k))).join(", ")}

*Status Pengiriman:*
${converterData
  .map((item, index) => {
    const status = item.status === "found" ? "✅" : "❌";
    const detail =
      item.status === "found"
        ? "Link WA dikirim"
        : "Tidak ditemukan di database";
    return `${status} ${item.Nama_Petugas} (${item.Jam}) - ${detail}`;
  })
  .join("\n")}

✅ Seluruh proses telah selesai.`;

        for (let i = 0; i < pengawasConverter.length; i++) {
          const pengawas = pengawasConverter[i];
          const progress = `[${i + 1}/${pengawasConverter.length}]`;

          setLogs((prev) => [
            ...prev,
            `📤 ${progress} Mengirim ke Pengawas: ${pengawas.asisten_imam}...`,
          ]);

          const res = await sendWA(pengawas.no_hp, msgPengawas);

          if (res.status) {
            setLogs((prev) => [
              ...prev,
              `✅ ${progress} BERHASIL: ${pengawas.asisten_imam}`,
            ]);
          } else {
            setLogs((prev) => [
              ...prev,
              `❌ ${progress} GAGAL: ${pengawas.asisten_imam}`,
            ]);
          }

          // Jeda antar pengiriman
          if (i < pengawasConverter.length - 1) {
            setLogs((prev) => [
              ...prev,
              `⏳ Jeda 5 detik sebelum pengiriman berikutnya...`,
            ]);
            await new Promise((res) => setTimeout(res, 5000));
          }
        }

        setLogs((prev) => [
          ...prev,
          `✅ Rekap Pengawas selesai dikirim ke ${pengawasConverter.length} orang.`,
        ]);
      }

      // Send to all Koordinator
      if (koordinatorConverter.length > 0) {
        setLogs((prev) => [
          ...prev,
          `👔 Mengirim pemberitahuan ke ${koordinatorConverter.length} Koordinator...`,
        ]);

        for (let i = 0; i < koordinatorConverter.length; i++) {
          const koordinator = koordinatorConverter[i];
          const progress = `[${i + 1}/${koordinatorConverter.length}]`;

          setLogs((prev) => [
            ...prev,
            `📤 ${progress} Mengirim ke Koordinator: ${koordinator.asisten_imam}...`,
          ]);

          const msgKoordinator = `*LAPORAN PENGIRIMAN JADWAL*\n\nHalo *${koordinator.asisten_imam}*, berikut rekap notifikasi tugas untuk tanggal:\n🗓️ ${tglTugas}\n

📊 *Statistik Converter:*
✅ Berhasil: ${totalSuccess} petugas
❌ Gagal: ${totalFailed} petugas

*Detail Status:*
${converterData
  .map((item, index) => {
    const status = item.status === "found" ? "✅" : "❌";
    const detail =
      item.status === "found" ? "Link WA tersedia" : "Tidak ditemukan";
    return `${status} ${item.Nama_Petugas} (${item.Jam}) - ${detail}`;
  })
  .join("\n")}

Terima kasih. 🙏`;

          const res = await sendWA(koordinator.no_hp, msgKoordinator);

          if (res.status) {
            setLogs((prev) => [
              ...prev,
              `✅ ${progress} BERHASIL: ${koordinator.asisten_imam}`,
            ]);
          } else {
            setLogs((prev) => [
              ...prev,
              `❌ ${progress} GAGAL: ${koordinator.asisten_imam}`,
            ]);
          }

          // Jeda antar pengiriman
          if (i < koordinatorConverter.length - 1) {
            setLogs((prev) => [
              ...prev,
              `⏳ Jeda 5 detik sebelum pengiriman berikutnya...`,
            ]);
            await new Promise((res) => setTimeout(res, 5000));
          }
        }

        setLogs((prev) => [
          ...prev,
          `✅ Pemberitahuan Koordinator selesai dikirim ke ${koordinatorConverter.length} orang.`,
        ]);
      }

      if (pengawasConverter.length === 0 && koordinatorConverter.length === 0) {
        setLogs((prev) => [
          ...prev,
          "⚠️ Tidak ada Pengawas atau Koordinator yang terdeteksi.",
        ]);
      } else {
        setLogs((prev) => [...prev, "🏁 PROSES PENGIRIMAN RECAP SELESAI."]);
      }
    } catch (err) {
      console.error("Gagal mengirim recap:", err);
      setLogs((prev) => [...prev, "❌ Terjadi kesalahan saat mengirim recap."]);
    } finally {
      setIsSendingConverter(false);
    }
  };

  if (loading)
    return <div className="p-10 text-center">Memuat Database CSV Lokal...</div>;
  return (
    <main className="p-10 bg-white min-h-screen">
      {/* HEADER SECTION */}
      <div className="flex mb-8 items-center gap-4 p-2 border-b">
        <img
          src="/img/logo_gereja.png"
          alt="Logo Gereja"
          className="h-14 w-auto mb-4"
        />
        <div className="flex flex-col gap-1 justify-center">
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">
            Jadwal Asisten Imam
          </h1>
          <p className="text-sm text-gray-500">
            Gereja Santa Maria Annuntiata - Sidoarjo
          </p>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="mb-8 flex gap-3 border-b pb-4">
        <button
          onClick={() => {
            setActiveTab("batch");
            setIsAdmin(false);
          }}
          className={`px-6 py-2 rounded-lg font-bold text-sm uppercase tracking-widest transition-all ${
            activeTab === "batch"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          📋 Batch Jadwal
        </button>
        <button
          onClick={() => {
            setActiveTab("converter");
            setConverterData([]);
          }}
          className={`px-6 py-2 rounded-lg font-bold text-sm uppercase tracking-widest transition-all ${
            activeTab === "converter"
              ? "bg-green-600 text-white shadow-md"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🔗 Converter Link WA
        </button>
      </div>

      {/* BATCH JADWAL TAB */}
      {activeTab === "batch" && (
        <div className="mb-8">
          {!isAdmin ? (
            /* TAMPILAN JIKA BELUM LOGIN */
            <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 w-fit">
              <h3 className="text-sm font-semibold text-gray-700">
                Akses Upload Jadwal
              </h3>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Kode Akses"
                  className="border px-3 py-2 rounded-lg text-sm text-black focus:ring-2 focus:ring-blue-500 outline-none w-40"
                  onChange={(e) => setPassInput(e.target.value)}
                />
                <button
                  onClick={() => passInput === "GEREJA123" && setIsAdmin(true)}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
                >
                  Login Admin
                </button>
              </div>
            </div>
          ) : (
            /* TAMPILAN JIKA SUDAH LOGIN (ADMIN PANEL) */
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm mb-8 animate-in fade-in duration-500">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <div>
                  <label className="text-xs font-black text-blue-800 uppercase tracking-widest">
                    Panel Kontrol Jadwal
                  </label>
                  <p className="text-sm text-blue-600/80">
                    Gunakan template resmi agar data terbaca sistem.
                  </p>
                </div>

                {/* TOMBOL DOWNLOAD */}
                <button
                  onClick={() => downloadTemplate(setLogs)}
                  className="bg-white border-2 border-blue-200 text-blue-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all flex items-center gap-2 shadow-sm"
                >
                  <span>📥</span> Download Template Excel
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleUploadJadwal}
                  className="block w-full text-sm text-blue-900 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer bg-white rounded-xl border border-blue-200 p-1"
                />
                <button
                  onClick={() => setIsAdmin(false)}
                  className="text-xs font-bold text-red-500 hover:text-red-700 p-2 underline decoration-2 underline-offset-4"
                >
                  Logout
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10 mb-10">
                {/* Table Preview */}
                <div className="lg:col-span-2">
                  {previewData.length > 0 ? (
                    <div className="overflow-hidden border border-gray-200 rounded-2xl shadow-sm bg-white">
                      <div className="bg-gray-50 px-5 py-3 border-b flex justify-between items-center">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                          Pratinjau Jadwal Terdeteksi
                        </h3>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {previewData.length} Baris
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white text-gray-400 text-left">
                              <th className="p-4 font-semibold border-b">
                                HARI / TANGGAL
                              </th>
                              <th className="p-4 font-semibold border-b">
                                JAM
                              </th>
                              <th className="p-4 font-semibold border-b">
                                NAMA PETUGAS
                              </th>
                              <th className="p-4 font-semibold border-b">
                                KOORDINATOR
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewData.map((d, idx) => (
                              <tr
                                key={idx}
                                className={`${isProcessing ? "animate-pulse" : ""} hover:bg-blue-50/50 transition-colors`}
                              >
                                <td className="p-4 font-medium text-gray-900">
                                  {d.TanggalRapi}
                                </td>
                                <td className="p-4 font-bold text-blue-600">
                                  {d.Jam}
                                </td>
                                <td className="p-4 font-black text-gray-800">
                                  {d.Nama_Petugas}
                                </td>
                                <td className="p-4 text-gray-500 italic">
                                  {d.Nama_Koordinator}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center p-10 text-gray-400 italic text-sm">
                      Belum ada data jadwal yang diunggah.
                    </div>
                  )}
                </div>

                {/* Terminal Logs */}
                <div className="lg:col-span-1">
                  <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full min-h-[300px]">
                    <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">
                        System Logs
                      </span>
                    </div>
                    <div className="p-4 font-mono text-[11px] text-green-400 overflow-y-auto flex-grow space-y-1">
                      {logs.length > 0 ? (
                        logs.map((log, i) => (
                          <p
                            key={i}
                            className="leading-relaxed border-l-2 border-green-900/50 pl-2"
                          >
                            <span className="text-gray-600 mr-2">{i + 1}</span>{" "}
                            {log}
                          </p>
                        ))
                      ) : (
                        <p className="text-gray-600 italic">
                          Menunggu aktivitas...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONVERTER TAB */}
      {activeTab === "converter" && (
        <div className="mb-8">
          <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm mb-8">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <div>
                <label className="text-xs font-black text-green-800 uppercase tracking-widest">
                  Converter Link WhatsApp
                </label>
                <p className="text-sm text-green-600/80">
                  Import file jadwal dan generate link WA siap kirim.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleUploadConverter}
                className="block w-full text-sm text-green-900 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-green-600 file:text-white hover:file:bg-green-700 cursor-pointer bg-white rounded-xl border border-green-200 p-1"
              />
            </div>

            {/* CONVERTER RESULTS CARDS */}
            {converterData.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                    Hasil Converter
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => exportConverterToExcel(converterData)}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all flex items-center gap-2 shadow-sm"
                    >
                      <span>📊</span> Export Excel
                    </button>
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {converterData.length} Data
                    </span>
                  </div>
                </div>

                {/* Send Buttons for Pengawas and Koordinator */}
                {(pengawasConverter.length > 0 ||
                  koordinatorConverter.length > 0) && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200 flex flex-col sm:flex-row gap-3">
                    {pengawasConverter.length > 0 && (
                      <button
                        onClick={sendConverterRecap}
                        disabled={isSendingConverter}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:bg-blue-400 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span>👔</span>
                        {isSendingConverter
                          ? "Mengirim..."
                          : `Kirim ke ${pengawasConverter.length} Pengawas`}
                      </button>
                    )}
                    {koordinatorConverter.length > 0 && (
                      <button
                        onClick={sendConverterRecap}
                        disabled={isSendingConverter}
                        className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-purple-700 disabled:bg-purple-400 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span>📋</span>
                        {isSendingConverter
                          ? "Mengirim..."
                          : `Kirim ke ${koordinatorConverter.length} Koordinator`}
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {converterData.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-green-600 opacity-0 group-hover:opacity-100 transition-all"></div>

                      {/* Header: Status Badge */}
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-gray-900 text-sm mb-0.5">
                            {item.Nama_Petugas}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {item.TanggalRapi}
                          </p>
                        </div>
                        {item.status === "found" ? (
                          <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full">
                            ✓ Aktif
                          </span>
                        ) : (
                          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-full">
                            ✗ Tidak Ditemukan
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-gray-600 mb-4 pb-4 border-b">
                        <p>
                          <strong>Jam:</strong> {item.Jam}
                        </p>
                        <p>
                          <strong>Koordinator:</strong> {item.Nama_Koordinator}
                        </p>
                        {item.no_hp && (
                          <p>
                            <strong>No HP:</strong> {item.no_hp}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {item.status === "found" && item.waLink ? (
                        <div className="flex gap-2">
                          {/* Copy Link Button */}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(item.waLink);
                              setCopyNotification({ id: item.id, show: true });
                              setTimeout(
                                () =>
                                  setCopyNotification({ id: "", show: false }),
                                2000,
                              );
                            }}
                            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs py-2 px-3 rounded-xl transition-all border border-blue-200 flex items-center justify-center gap-1"
                          >
                            📋{" "}
                            {copyNotification.id === item.id &&
                            copyNotification.show
                              ? "Tersalin!"
                              : "Salin Link"}
                          </button>

                          {/* Send WA Button */}
                          <button
                            onClick={() => {
                              if (!item.waLink) return;
                              window.open(item.waLink, "_blank");
                            }}
                            className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs py-2 px-3 rounded-xl transition-all border border-green-200 flex items-center justify-center gap-1"
                          >
                            📱 Kirim WA
                          </button>
                        </div>
                      ) : (
                        <div className="bg-red-50 text-red-700 text-xs py-2 px-3 rounded-xl text-center font-bold border border-red-200">
                          Data tidak ditemukan di database
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {converterData.length === 0 && (
              <div className="mt-8 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center p-10 text-gray-400 italic text-sm">
                Belum ada data converter yang diproses. Silahkan upload file
                jadwal.
              </div>
            )}

            {/* CONVERTER LOGS SECTION */}
            <div className="mt-8">
              <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full min-h-[300px]">
                <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">
                    Converter Logs
                  </span>
                </div>
                <div className="p-4 font-mono text-[11px] text-green-400 overflow-y-auto flex-grow space-y-1">
                  {logs.length > 0 ? (
                    logs.map((log, i) => (
                      <p
                        key={i}
                        className="leading-relaxed border-l-2 border-green-900/50 pl-2"
                      >
                        <span className="text-gray-600 mr-2">{i + 1}</span>{" "}
                        {log}
                      </p>
                    ))
                  ) : (
                    <p className="text-gray-600 italic">
                      Menunggu aktivitas...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <hr className="mb-12 border-gray-100" />

      {/* DATABASE DISPLAY SECTION - ONLY IN BATCH TAB */}
      {activeTab === "batch" && (
        <div className="space-y-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">
              Database Asisten Imam
            </h2>
            <div className="h-px bg-gray-200 flex-grow"></div>
          </div>

          {Object.entries(groupedAsim).map(([wilayah, petugas]) => (
            <section
              key={wilayah}
              className="animate-in slide-in-from-bottom-4 duration-700"
            >
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-black text-blue-900 text-sm uppercase tracking-widest">
                  {wilayah}
                </h3>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                  {petugas.length} PERSONEL
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {petugas.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-all"></div>
                    <p className="font-bold text-gray-900 text-base mb-1">
                      {p.asisten_imam}
                    </p>
                    <p className="text-[11px] text-blue-500 font-bold uppercase mb-4 tracking-tight">
                      {p.lingkungan}
                    </p>

                    <a
                      href={`https://wa.me/62${String(p.no_hp)
                        .replace(/[^0-9]/g, "")
                        .replace(/^0/, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2 bg-green-50 text-green-700 rounded-xl text-xs font-black hover:bg-green-600 hover:text-white transition-all border border-green-100"
                    >
                      <span>📱</span> {p.no_hp}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
