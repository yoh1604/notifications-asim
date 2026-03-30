"use client"
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse'; // Import PapaParse untuk baca CSV

// --- HELPER UNTUK KIRIM WA ---
const sendWA = async (number: string, message: string) => {
  const token = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  let formattedNumber = String(number).replace(/[^0-9]/g, '');
  
  if (formattedNumber.startsWith('0')) {
    formattedNumber = '62' + formattedNumber.substring(1);
  } else if (!formattedNumber.startsWith('62')) {
    formattedNumber = '62' + formattedNumber;
  }

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token || '' },
      body: new URLSearchParams({ target: formattedNumber, message })
    });
    return await response.json();
  } catch (err) {
    return { status: false };
  }
};

const downloadTemplate = () => {
const [logs, setLogs] = useState<string[]>([]);
    try {
      // 1. Buat data contoh
      const data = [
        { 
          "Tanggal": "2026-02-14", 
          "Jam": "18:00", 
          "Nama_Petugas": "FRANSISCUS XAVERIUS SONY BOENAWAN", 
          "Nama_Koordinator": "IGNATIUS FEBIANTO KURNIAWAN" 
        },
        { 
          "Tanggal": "2026-02-15", 
          "Jam": "07:00", 
          "Nama_Petugas": "CHRISTOPHER SETIABUDI", 
          "Nama_Koordinator": "IGNATIUS FEBIANTO KURNIAWAN" 
        }
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
      worksheet['!cols'] = wscols;

      // 4. Proses Download
      XLSX.writeFile(workbook, "Template_Jadwal_AI.xlsx");
      
      setLogs(prev => [...prev, "✅ Template Excel berhasil diunduh."]);
    } catch (err) {
      console.error("Gagal download template:", err);
      alert("Gagal mengunduh template. Pastikan library XLSX sudah terinstall.");
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

      const grouped = data.reduce((acc: Record<string, any[]>, item: any) => {
        const key = item.wilayah || 'Tanpa Wilayah';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {} as Record<string, any[]>); // <--- Tambahkan tipe data di sini
        
        setGroupedAsim(grouped);
        setLoading(false);
      },
      error: (err) => {
        console.error("Gagal memuat CSV:", err);
        setLoading(false);
      }
    });
  };

  const isSmartMatch = (dbName: string, excelName: string) => {
    const clean = (str: string) => {
      if (!str) return "";
      return str.toString().toUpperCase()
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
      return dbParts.every((part, i) => 
        part === exParts[i] || (exParts[i].length === 1 && part.startsWith(exParts[i]))
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
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true, raw: false });
        const wsname = workbook.SheetNames[0];
        const rawDataExcel: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[wsname]);

        const dataExcel = rawDataExcel.map(row => {
          const findValue = (possibleNames: string[]) => {
            const foundKey = Object.keys(row).find(key => 
              possibleNames.includes(key.toLowerCase().trim())
            );
            return foundKey ? row[foundKey] : null;
          };

          const tglRaw = findValue(['tanggal', 'tgl', 'date']);
          const safeDate = tglRaw instanceof Date ? tglRaw : new Date();

          return {
            ...row,
            Nama_Petugas: String(findValue(['nama_petugas', 'petugas']) || '').toUpperCase().trim(),
            Nama_Koordinator: String(findValue(['nama_koordinator', 'koordinator']) || '').toUpperCase().trim(),
            Jam: String(findValue(['jam', 'waktu']) || '-'),
            TanggalRapi: safeDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          };
        }).filter(item => item.Nama_Petugas !== "");

        setPreviewData(dataExcel);
        setLogs(prev => [...prev, "🚀 Memulai pengiriman pesan massal..."]);

        // Data Pengawas
        const listPengawas = allAsimLocal.filter(a => 
          // ["YAKOBUS HERI PRIYANTO", "AGUSTINUS WAHYU SULISTYO", "IGNATIUS FEBIANTO KURNIAWAN", "YOHANES DWI PRASETYO DARMAWAN"]
          ["ADMIN 1", "ADMIN 2"]
          .includes(String(a.asisten_imam).toUpperCase().trim())
        );
        
        let laporanUntukPengawas: string[] = [];
        let setKoordinatorUnik = new Set<string>();
        
        // OBJEK REKAP UNTUK KOORDINATOR
        // Struktur: { "NAMA": { berhasil: [], gagal: [], no_hp: "" } }
        let rekapPerKoordinator: Record<string, { berhasil: string[], gagal: string[], no_hp: string }> = {};

        for (let i = 0; i < dataExcel.length; i++) {
          const row = dataExcel[i];
          const progress = `[${i + 1}/${dataExcel.length}]`;

          if (i > 0 && i % 10 === 0) {
            setLogs(prev => [...prev, "☕ Mencapai 10 pesan. Istirahat 45 detik agar aman..."]);
            await new Promise(res => setTimeout(res, 45000));
          }

          // Pecah Nama Koordinator
          const namaKoordArray = row.Nama_Koordinator
            .split(/[,&]|\bDAN\b/i) 
            .map((n: string) => n.trim())
            .filter((n: string) => n !== "");

          const p = allAsimLocal.find(a => isSmartMatch(a.asisten_imam, row.Nama_Petugas));
          const daftarKoordData = namaKoordArray.map((nama: string) => 
            allAsimLocal.find(a => isSmartMatch(a.asisten_imam, nama))
          ).filter(Boolean);

          if (!p) {
            setLogs(prev => [...prev, `⚠️ ${progress} SKIP: "${row.Nama_Petugas}" tidak ditemukan di CSV.`]);
            // Catat sebagai gagal di setiap koordinator terkait
            daftarKoordData.forEach((k:any) => {
              if (!rekapPerKoordinator[k.asisten_imam]) rekapPerKoordinator[k.asisten_imam] = { berhasil: [], gagal: [], no_hp: k.no_hp };
              rekapPerKoordinator[k.asisten_imam].gagal.push(`${row.Nama_Petugas} (Tidak ada di database)`);
            });
            continue;
          }

          const linkChat = daftarKoordData.map((k: any) => {
            const rawNo = String(k.no_hp).replace(/[^0-9]/g, '');
            const cleanNo = rawNo.startsWith('0') ? '62' + rawNo.substring(1) : (rawNo.startsWith('62') ? rawNo : '62' + rawNo);
            return `Klik chat ${k.asisten_imam}: wa.me/${cleanNo}`;
          }).join('\n');

          const msgPetugas = `*PENGINGAT TUGAS ASISTEN IMAM*

Salam Damai,
Bapak/Ibu *${row.Nama_Petugas}*

Mengingatkan kembali jadwal tugas pelayanan:
🗓️ *Hari/Tgl:* ${row.TanggalRapi}
⏰ *Jam:* ${row.Jam || '-'} WIB

Dimohon hadir paling lambat 30 menit sebelum ibadah dimulai & mematuhi ketentuan protokoler kesehatan. 

Jika Bapak/Ibu berhalangan hadir, segera hubungi Koordinator selambat-lambatnya H-2 sebelum jadwal tugas.

Koordinator Anda:
*${row.Nama_Koordinator}*

${linkChat}

Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

Terima kasih. Tuhan memberkati. 🙏`;          
  

          // KIRIM KE PETUGAS
          const resP = await sendWA(p.no_hp, msgPetugas);
          
          const infoBaris = `${row.Nama_Petugas} (${row.Jam})`;

          // CATAT STATUS KE REKAP KOORDINATOR
          daftarKoordData.forEach((k: any) => {
            const namaK = k.asisten_imam;
            if (!rekapPerKoordinator[namaK]) {
              rekapPerKoordinator[namaK] = { berhasil: [], gagal: [], no_hp: k.no_hp };
            }
            if (resP.status) rekapPerKoordinator[namaK].berhasil.push(infoBaris);
            else rekapPerKoordinator[namaK].gagal.push(infoBaris);
            setKoordinatorUnik.add(namaK);
          });

          if (resP.status) {
            setLogs(prev => [...prev, `✅ ${progress} BERHASIL: ${row.Nama_Petugas}`]);
            laporanUntukPengawas.push(`✅ ${infoBaris}`);
          } else {
            setLogs(prev => [...prev, `❌ ${progress} GAGAL: ${row.Nama_Petugas}`]);
            laporanUntukPengawas.push(`❌ ${infoBaris} (Gagal WA)`);
          }

          const msJeda = Math.floor(Math.random() * (45000 - 20000 + 1) + 20000);
          await new Promise(res => setTimeout(res, msJeda));
        }

        // --- 4. KIRIM REKAP KE MASING-MASING KOORDINATOR ---
        setLogs(prev => [...prev, "📱 Mengirim rekap ringkas ke para Koordinator..."]);
        for (const namaK of Object.keys(rekapPerKoordinator)) {
          const data = rekapPerKoordinator[namaK];
          const tglTugas = dataExcel[0]?.TanggalRapi || "";
          
          let msgKoord = `*LAPORAN PENGIRIMAN JADWAL*\n\nHalo *${namaK}*, berikut rekap notifikasi tugas untuk tanggal:\n🗓️ ${tglTugas}\n`;
          
          if (data.berhasil.length > 0) {
            msgKoord += `\n✅ *BERHASIL TERKIRIM:*\n- ${data.berhasil.join('\n- ')}`;
          }
          
          if (data.gagal.length > 0) {
            msgKoord += `\n\n⚠️ *BELUM TERKIRIM:*\n- ${data.gagal.join('\n- ')}`;
          }

          msgKoord += `\n\nTerima kasih. 🙏`;
          
          await sendWA(data.no_hp, msgKoord);
          await new Promise(res => setTimeout(res, 10000)); // Jeda antar koordinator
        }

        // --- 5. KIRIM REKAP KE SEMUA PENGAWAS ---
        if (laporanUntukPengawas.length > 0 && listPengawas.length > 0) {
          const tglTugas = dataExcel[0]?.TanggalRapi || "";
          const msgRekap = `*REKAP AKHIR SISTEM JADWAL*
🗓️ *Tgl Tugas:* ${tglTugas}
👔 *Koordinator:* ${Array.from(setKoordinatorUnik).join(', ')}

*Status Pengiriman:*
${laporanUntukPengawas.join('\n')}

✅ Seluruh proses telah selesai.`;

          for (const [index, pengawas] of listPengawas.entries()) {
            await sendWA(pengawas.no_hp, msgRekap);
            if (index < listPengawas.length - 1) await new Promise(res => setTimeout(res, 10000)); 
          }
          setLogs(prev => [...prev, "📱 Rekap kolektif terkirim ke Pengawas."]);
        }

        setLogs(prev => [...prev, "🏁 PROSES SELESAI SEMUA."]);
      } catch (err) {
        setLogs(prev => [...prev, "❌ Terjadi kesalahan baca file."]);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };
//   const handleUploadJadwal = async (e: React.ChangeEvent<HTMLInputElement>) => {
//   const file = e.target.files?.[0];
//   if (!file) return;

//   setIsProcessing(true);
//   setLogs(["📁 Memproses file jadwal..."]);

//   const reader = new FileReader();
//   reader.onload = async (evt) => {
//     try {
//       const bstr = evt.target?.result;
//       const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true, raw: false });
//       const wsname = workbook.SheetNames[0];
//       const rawDataExcel: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[wsname]);

//       const dataExcel = rawDataExcel.map(row => {
//         const findValue = (possibleNames: string[]) => {
//           const foundKey = Object.keys(row).find(key => 
//             possibleNames.includes(key.toLowerCase().trim())
//           );
//           return foundKey ? row[foundKey] : null;
//         };

//         const tglRaw = findValue(['tanggal', 'tgl', 'date']);
//         const safeDate = tglRaw instanceof Date ? tglRaw : new Date();

//         return {
//           ...row,
//           Nama_Petugas: String(findValue(['nama_petugas', 'petugas']) || '').toUpperCase().trim(),
//           Nama_Koordinator: String(findValue(['nama_koordinator', 'koordinator']) || '').toUpperCase().trim(),
//           Jam: String(findValue(['jam', 'waktu']) || '-'),
//           TanggalRapi: safeDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
//         };
//       }).filter(item => item.Nama_Petugas !== "");

//       setPreviewData(dataExcel);
//       setLogs(prev => [...prev, "🚀 Memulai pengiriman pesan massal..."]);

//       const listPengawas = allAsimLocal.filter(a => 
//         ["YAKOBUS HERI PRIYANTO", "AGUSTINUS WAHYU SULISTYO", "IGNATIUS FEBIANTO KURNIAWAN", "YOHANES DWI PRASETYO DARMAWAN"]
//         // ["ADMIN 2", "ADMIN 1"]
//         .includes(String(a.asisten_imam).toUpperCase().trim())
//       );
      
//       let laporanUntukPengawas: string[] = [];
//       let setKoordinatorUnik = new Set<string>();

//       for (let i = 0; i < dataExcel.length; i++) {
//         const row = dataExcel[i];
//         const progress = `[${i + 1}/${dataExcel.length}]`;

//         // 1. JEDA PER BATCH (Setiap 10 Pesan, Istirahat 45 Detik)
//         if (i > 0 && i % 10 === 0) {
//           setLogs(prev => [...prev, "☕ Mencapai 10 pesan. Istirahat 45 detik"]);
//           await new Promise(res => setTimeout(res, 45000));
//         }

//         // 2. LOGIKA MULTI-KOORDINATOR (Pecah nama jika ada "&", ",", atau "DAN")
//         const namaKoordArray = row.Nama_Koordinator
//           .split(/[,&]|\bDAN\b/i) 
//           .map((n: string) => n.trim())
//           .filter((n: string) => n !== "");

//         // Cari data Petugas
//         const p = allAsimLocal.find(a => isSmartMatch(a.asisten_imam, row.Nama_Petugas));
        
//         // Cari data semua Koordinator yang terlibat
//         const daftarKoordData = namaKoordArray.map((nama:string) => 
//           allAsimLocal.find(a => isSmartMatch(a.asisten_imam, nama))
//         ).filter(Boolean);

//         if (!p) {
//           setLogs(prev => [...prev, `⚠️ ${progress} SKIP: "${row.Nama_Petugas}" tidak ditemukan di CSV.`]);
//           continue;
//         }

//         const linkChat = daftarKoordData.map((k: any) => {
//           const rawNo = String(k.no_hp).replace(/[^0-9]/g, '');
//           const cleanNo = rawNo.startsWith('0') ? '62' + rawNo.substring(1) : (rawNo.startsWith('62') ? rawNo : '62' + rawNo);
//           return `Klik untuk chat ${k.asisten_imam}: wa.me/${cleanNo}`;
//         }).join('\n');

//         const msgPetugas = `*PENGINGAT TUGAS ASISTEN IMAM*

// Salam Damai,
// Bapak/Ibu *${row.Nama_Petugas}*

// Mengingatkan kembali jadwal tugas pelayanan:
// 🗓️ *Hari/Tgl:* ${row.TanggalRapi}
// ⏰ *Jam:* ${row.Jam || '-'} WIB

// Dimohon hadir paling lambat 30 menit sebelum ibadah dimulai & mematuhi ketentuan protokoler kesehatan. 

// Jika Bapak/Ibu berhalangan hadir, segera hubungi Koordinator selambat-lambatnya H-2 sebelum jadwal tugas.

// Koordinator Anda:
// *${row.Nama_Koordinator}*

// ${linkChat}

// Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

// Terima kasih. Tuhan memberkati. 🙏`;

//           // 3. KIRIM KE PETUGAS
//           const resP = await sendWA(p.no_hp, msgPetugas);
          
//           if (resP.status) {
//             setLogs(prev => [...prev, `✅ ${progress} BERHASIL: ${row.Nama_Petugas}`]);
//             laporanUntukPengawas.push(`${i + 1}. *${row.Nama_Petugas}* (${row.Jam})`);

//             // 4. KIRIM LAPORAN KE SEMUA KOORDINATOR TERKAIT
//             for (const kData of daftarKoordData) {
//               if (kData && kData.no_hp) {
//                 const msgKoord = `*LAPORAN SISTEM*\nHalo ${kData.asisten_imam}, notifikasi jadwal untuk *${row.Nama_Petugas}* (${row.Jam}) telah terkirim.`;
//                 await sendWA(kData.no_hp, msgKoord);
//                 if (kData.asisten_imam) setKoordinatorUnik.add(kData.asisten_imam);
//                 await new Promise(res => setTimeout(res, 5000)); // Jeda antar koordinator
//               }
//             }
//           }

//           // 5. JEDA ACAK ANTAR BARIS (20 sampai 35 detik)
//           const msJeda = Math.floor(Math.random() * (35000 - 20000 + 1) + 20000);
//           setLogs(prev => [...prev, `⏳ Jeda aman ${msJeda/1000} detik...`]);
//           await new Promise(res => setTimeout(res, msJeda));
//         }

//         // --- 6. KIRIM REKAP KE SEMUA PENGAWAS (Sekali saja di akhir) ---
//         if (laporanUntukPengawas.length > 0 && listPengawas.length > 0) {
//           const tglTugas = dataExcel[0]?.TanggalRapi || "";
//           const msgRekap = `*REKAP PENGIRIMAN JADWAL*
// 🗓️ *Tgl Tugas:* ${tglTugas}
// 👔 *Koordinator:* ${Array.from(setKoordinatorUnik).join(', ')}

// *Daftar Petugas Terkirim:*
// ${laporanUntukPengawas.join('\n')}

// ✅ Seluruh notifikasi telah selesai dikirim.`;

//           for (const [index, pengawas] of listPengawas.entries()) {
//             await sendWA(pengawas.no_hp, msgRekap);
//             if (index < listPengawas.length - 1) {
//               setLogs(prev => [...prev, `⏳ Jeda 10 detik antar pengawas...`]);
//               await new Promise(res => setTimeout(res, 10000)); 
//             }
//           }
//           setLogs(prev => [...prev, "📱 Rekap kolektif terkirim ke Pengawas."]);
//         }

//         setLogs(prev => [...prev, "🏁 PROSES SELESAI SEMUA."]);
//       } catch (err) {
//         setLogs(prev => [...prev, "❌ Terjadi kesalahan baca file."]);
//       } finally {
//         setIsProcessing(false);
//       }
//     };
//     reader.readAsBinaryString(file);
//   };

  if (loading) return <div className="p-10 text-center">Memuat Database CSV Lokal...</div>;

// //           if (pengawas1) await sendWA(pengawas1.no_hp, msgLaporanPengawas);
// //           if (pengawas2) await sendWA(pengawas2.no_hp, msgLaporanPengawas);
// //           if (pengawas3) await sendWA(pengawas3.no_hp, msgLaporanPengawas);
// //           if (pengawas4) await sendWA(pengawas4.no_hp, msgLaporanPengawas);

// //           const msJeda = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
// //           setLogs(prev => [...prev, `⏳ Jeda ${msJeda/1000} detik...`]);
// //           await new Promise(res => setTimeout(res, msJeda));
// //         }

// //         setLogs(prev => [...prev, "🏁 PROSES SELESAI SEMUA."]);

// //       } catch (err: any) {
// //         setLogs(prev => [...prev, `❌ ERROR: ${err.message}`]);
// //       } finally {
// //         setIsProcessing(false);
// //       }
// //     };

// //     if (isCSV) {
// //         reader.readAsText(file);
// //       } else {
// //         reader.readAsBinaryString(file);
// //       }
// //     };

//   if (loading) return <div className="p-10 text-center italic text-gray-500">Memuat Data Asisten...</div>;

//   return (
//     <main className="p-6 max-w-6xl mx-auto bg-white min-h-screen">
//       <div className='flex mb-8 items-center gap-4 p-2 border-b'>
//         <img src="/img/logo_gereja.png" alt="Logo Gereja" className="h-12 w-16 mb-4" />
//         <div className="flex flex-col gap-1 justify-center items-left">
//           <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Jadwal Asisten Imam</h1>
//           <p className='text-[12px]'>Gereja Santa Maria Annuntiata - Sidoarjo</p>
//         </div>
//       </div>
//       <div className="mb-2 gap-2">
//       {!isAdmin ? (
//           <div className="flex flex-col gap-2">
//             <h3>Akses Upload Jadwal</h3>
//             <div className='flex gap-2'>
//               <input 
//                 type="password" 
//                 placeholder="Kode Akses" 
//                 className="border px-3 py-1 rounded w-32 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" 
//                 onChange={(e) => setPassInput(e.target.value)} 
//               />
//               <button 
//                 onClick={() => passInput === "GEREJA123" && setIsAdmin(true)} 
//                 className="bg-blue-100 px-4 py-1 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
//               >
//                 Admin
//               </button>
//             </div>
//           </div>
//         ) : (
//           <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-2">
//             <div className='flex justify-between items-center'>
//               <label className="text-xs font-bold text-blue-700 uppercase">Upload Jadwal (.xlsx/.xls/.csv)</label>
//               <button 
//                 onClick={downloadTemplate}
//                 className=" border-blue-300 border text-blue-600 px-3 py-1 rounded hover:bg-blue-50 w-fit"
//               >
//                 📥 Download Template Excel
//               </button>
//             </div>
//             <input 
//               type="file" 
//               accept=".xlsx, .xls, .csv" 
//               onChange={handleUploadJadwal} 
//               className="mt-2 text-sm bg-white border justify-between items-center border-blue-300 text-blue-600 p-3 w-fit rounded hover:bg-blue-50" 
//             />
          
//             <button onClick={() => setIsAdmin(false)} className="mt-2 text-xs bg-white  text-blue-600 p-3 rounded hover:bg-blue-50">Tutup Mode Admin</button>
//           </div>
//         )}
//       <div className="flex flex-col mt-6 gap-6">
//         {previewData.length > 0 && (
//           <div className="overflow-hidden border rounded-xl shadow-sm bg-white">
//             <div className="bg-gray-50 px-4 py-2 border-b">
//               <h3 className="text-sm font-bold text-gray-700">Pratinjau Data Unggahan</h3>
//             </div>
//             <div className="overflow-x-auto">
//               <table className="min-w-full text-[11px] border-collapse">
//                 <thead>
//                   <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
//                     <th className="border-b p-3 text-left">Hari / Tanggal</th>
//                     <th className="border-b p-3 text-left">Jam</th>
//                     <th className="border-b p-3 text-left">Nama Petugas</th>
//                     <th className="border-b p-3 text-left">Koordinator</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y divide-gray-100">
//                   {previewData.map((d, idx) => (
//                     <tr key={idx} className={`${isProcessing ? "animate-pulse" : ""} hover:bg-blue-50/30 transition-colors`}>
//                       {/* FIX TAMPILAN TANGGAL DI SINI */}
//                       <td className="p-3 whitespace-nowrap font-medium">{d.TanggalRapi}</td>
//                       <td className="p-3 font-medium text-blue-600">{d.Jam}</td>
//                       <td className="p-3 font-bold text-gray-800">{d.Nama_Petugas}</td>
//                       <td className="p-3 text-gray-600">{d.Nama_Koordinator}</td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         )}

//         {logs.length > 0 && (
//           <div className="p-4 bg-gray-900 text-green-400 font-mono text-[10px] rounded-xl shadow-lg max-h-48 overflow-y-auto border border-gray-800">
//             {logs.map((log, i) => <p key={i} className="mb-1 leading-relaxed"><span className="text-gray-500 mr-2">{i+1}.</span> {log}</p>)}
//           </div>
//         )}
//       </div>
//       </div>
//       <hr className="my-10 border-gray-100" />

//       <div className="space-y-8">
//         {Object.entries(groupedAsim).map(([wilayah, petugas]) => (
//           <section key={wilayah} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
//             <div className="bg-blue-600 px-5 py-3">
//               <h2 className="text-white font-bold text-sm tracking-wide uppercase">{wilayah}</h2>
//             </div>
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-5 bg-gray-50/50">
//               {petugas.map((p) => (
//                 <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group">
//                   <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{p.asisten_imam}</p>
//                   <p className="text-[10px] text-gray-400 font-medium mb-3 uppercase tracking-tighter">{p.lingkungan}</p>
//                   <a 
//                     href={`https://wa.me/${String(p.no_hp).replace(/[^0-9]/g, '')}`} 
//                     target="_blank" 
//                     rel="noreferrer"
//                     className="inline-flex items-center text-[11px] text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full hover:bg-green-100 transition-colors"
//                   >
//                     📱 {p.no_hp}
//                   </a>
//                 </div>
//               ))}
//             </div>
//           </section>
//         ))}
//       </div>
//     </main>
//   );
// }
return (
    <main className="p-10 bg-white min-h-screen">
      {/* HEADER SECTION */}
      <div className='flex mb-8 items-center gap-4 p-2 border-b'>
        <img src="/img/logo_gereja.png" alt="Logo Gereja" className="h-14 w-auto mb-4" />
        <div className="flex flex-col gap-1 justify-center">
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Jadwal Asisten Imam</h1>
          <p className='text-sm text-gray-500'>Gereja Santa Maria Annuntiata - Sidoarjo</p>
        </div>
      </div>

      {/* ADMIN CONTROL SECTION */}
      <div className="mb-8">
          {!isAdmin ? (
            /* TAMPILAN JIKA BELUM LOGIN */
            <div className="flex flex-col gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 w-fit">
              <h3 className="text-sm font-semibold text-gray-700">Akses Upload Jadwal</h3>
              <div className='flex gap-2'>
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
              <div className='flex flex-wrap justify-between items-center gap-4 mb-4'>
                <div>
                  <label className="text-xs font-black text-blue-800 uppercase tracking-widest">Panel Kontrol Jadwal</label>
                  <p className="text-sm text-blue-600/80">Gunakan template resmi agar data terbaca sistem.</p>
                </div>
                
                {/* TOMBOL DOWNLOAD */}
                <button 
                  onClick={downloadTemplate}
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
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Pratinjau Jadwal Terdeteksi</h3>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{previewData.length} Baris</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white text-gray-400 text-left">
                              <th className="p-4 font-semibold border-b">HARI / TANGGAL</th>
                              <th className="p-4 font-semibold border-b">JAM</th>
                              <th className="p-4 font-semibold border-b">NAMA PETUGAS</th>
                              <th className="p-4 font-semibold border-b">KOORDINATOR</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewData.map((d, idx) => (
                              <tr key={idx} className={`${isProcessing ? "animate-pulse" : ""} hover:bg-blue-50/50 transition-colors`}>
                                <td className="p-4 font-medium text-gray-900">{d.TanggalRapi}</td>
                                <td className="p-4 font-bold text-blue-600">{d.Jam}</td>
                                <td className="p-4 font-black text-gray-800">{d.Nama_Petugas}</td>
                                <td className="p-4 text-gray-500 italic">{d.Nama_Koordinator}</td>
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
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2">System Logs</span>
                    </div>
                    <div className="p-4 font-mono text-[11px] text-green-400 overflow-y-auto flex-grow space-y-1">
                      {logs.length > 0 ? (
                        logs.map((log, i) => (
                          <p key={i} className="leading-relaxed border-l-2 border-green-900/50 pl-2">
                            <span className="text-gray-600 mr-2">{i+1}</span> {log}
                          </p>
                        ))
                      ) : (
                        <p className="text-gray-600 italic">Menunggu aktivitas...</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      {/* PREVIEW & LOGS SECTION */}
      

      <hr className="mb-12 border-gray-100" />

      {/* DATABASE DISPLAY SECTION */}
      <div className="space-y-10">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Database Asisten Imam</h2>
          <div className="h-px bg-gray-200 flex-grow"></div>
        </div>
        
        {Object.entries(groupedAsim).map(([wilayah, petugas]) => (
          <section key={wilayah} className="animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="font-black text-blue-900 text-sm uppercase tracking-widest">{wilayah}</h3>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{petugas.length} PERSONEL</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {petugas.map((p) => (
                <div key={p.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-all"></div>
                  <p className="font-bold text-gray-900 text-base mb-1">{p.asisten_imam}</p>
                  <p className="text-[11px] text-blue-500 font-bold uppercase mb-4 tracking-tight">{p.lingkungan}</p>
                  
                  <a 
                    href={`https://wa.me/62${String(p.no_hp).replace(/[^0-9]/g, '').replace(/^0/, '')}`} 
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
    </main>
  );
}