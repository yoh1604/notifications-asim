"use client"
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// --- HELPER UNTUK KIRIM WA ---
const sendWA = async (number: string, message: string) => {
  const token = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  let formattedNumber = String(number).replace(/[^0-9]/g, '');
  if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);

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
  const worksheet = XLSX.utils.json_to_sheet([
    { Tanggal: "2026-02-01", Jam: "07:00", Nama_Petugas: "NAMA LENGKAP", Nama_Koordinator: "NAMA KOORDINATOR" }
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Jadwal");
  XLSX.writeFile(workbook, "Template_Upload_Jadwal.xlsx");
};

export default function UnifiedPage() {
  const [groupedAsim, setGroupedAsim] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    ambilData();
  }, []);

  async function ambilData() {
    const { data } = await supabase
      .from('asisten_imam')
      .select('*')
      .order('wilayah', { ascending: true })
      .order('lingkungan', { ascending: true });

    if (data) {
      const grouped = data.reduce((acc: any, item: any) => {
        const key = item.wilayah || 'Tanpa Wilayah';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});
      setGroupedAsim(grouped);
    }
    setLoading(false);
  }
  // Fungsi untuk mencocokkan nama meskipun ada inisial
  const isSmartMatch = (dbName: string, excelName: string) => {
    // Fungsi pembersihan total
    const clean = (str: string) => {
      if (!str) return "";
      return str
        .toString()
        .toUpperCase()
        // 1. Menghapus karakter non-breaking space (&nbsp;) yang sering ada di Excel
        .replace(/[\u00A0\u1680​\u180e\u2000-\u200b\u202f\u205f\u3000]/g, " ")
        // 2. Menghapus semua tanda titik agar "T.H." jadi "TH"
        .replace(/\./g, "")
        // 3. Mengubah spasi ganda menjadi spasi tunggal
        .replace(/\s+/g, " ")
        .trim();
    };

    const db = clean(dbName);
    const ex = clean(excelName);

    // Cek apakah sama setelah dibersihkan
    if (db === ex) return true;

    // Logika cadangan: Cek inisial jika jumlah kata sama
    const dbParts = db.split(" ");
    const exParts = ex.split(" ");

    if (dbParts.length === exParts.length) {
      return dbParts.every((part, i) => 
        part === exParts[i] || (exParts[i].length === 1 && part.startsWith(exParts[i]))
      );
    }

    return false;
  };
    // --- FUNGSI MEMBERSIHKAN FORMAT JAM ---
  function formatJam(dataExcel: any) {
    if (!dataExcel) return "-";
    const strData = String(dataExcel);
    if (strData.includes('1899') || strData.includes('1900')) {
      let date = new Date(dataExcel);
      let jam = date.getHours().toString().padStart(2, '0');
      let menit = date.getMinutes().toString().padStart(2, '0');
      return `${jam}:${menit}`;
    }
    return strData; 
  }

  const handleUploadJadwal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.endsWith('.csv');
    setLogs([`📁 Membuka file ${isCSV ? 'CSV' : 'Excel'}...`]);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { 
          type: isCSV ? 'string' : 'binary', 
          cellDates: true, 
          raw: false 
        });

        const wsname = workbook.SheetNames[0];
        const rawDataExcel: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[wsname]);

        const getSafeDate = (input: any) => {
          let d = input instanceof Date ? new Date(input.getTime()) : (!isNaN(input) ? new Date((input - 25569) * 86400 * 1000) : new Date(input));
          if (!isNaN(d.getTime())) d.setHours(d.getHours() + 12);
          return d;
        };

        // 1. MAPPING DATA & CLEANING
        const dataExcel = rawDataExcel.map(row => {
          const findValue = (possibleNames: string[]) => {
            const foundKey = Object.keys(row).find(key => 
              possibleNames.includes(key.toLowerCase().trim().replace(/\s+/g, '_')) ||
              possibleNames.includes(key.toLowerCase().trim())
            );
            return foundKey ? row[foundKey] : null;
          };

          const safeDate = getSafeDate(findValue(['tanggal', 'tgl', 'date']));

          return {
            ...row,
            Nama_Petugas: String(findValue(['nama_petugas', 'petugas']) || '').toUpperCase().trim(),
            Nama_Koordinator: String(findValue(['nama_koordinator', 'koordinator']) || '').toUpperCase().trim(),
            Jam: formatJam(findValue(['jam', 'waktu', 'time'])),
            TanggalSafe: safeDate,
            TanggalRapi: !isNaN(safeDate.getTime()) 
              ? safeDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : "Tanggal Tidak Valid"
          };
        }).filter(item => item.Nama_Petugas !== "");

        setPreviewData(dataExcel);
        setLogs(prev => [...prev, `🔍 Ditemukan ${dataExcel.length} baris data valid.`]);

        const { data: allAsim } = await supabase.from('asisten_imam').select('id, no_hp, asisten_imam');
        
        // Ambil data pengawas untuk rekap di akhir
        const listPengawas = allAsim?.filter(a => 
          ["YAKOBUS HERI PRIYANTO", "AGUSTINUS WAHYU SULISTYO", "IGNATIUS FEBIANTO KURNIAWAN", "YOHANES DWI PRASETYO DARMAWAN"]
          .includes(a.asisten_imam?.toUpperCase().trim())
        ) || [];

        let laporanUntukPengawas: string[] = [];

        // --- MULAI PROSES PENGIRIMAN DENGAN ANTI-SPAM ---
        for (let i = 0; i < dataExcel.length; i++) {
          const row = dataExcel[i];
          const progress = `[${i + 1}/${dataExcel.length}]`;

          // A. ISTIRAHAT PER BATCH (Setiap 10 Pesan, Istirahat 30 Detik)
          if (i > 0 && i % 10 === 0) {
            setLogs(prev => [...prev, "☕ Mencapai 10 pesan. Istirahat 30 detik agar aman..."]);
            await new Promise(res => setTimeout(res, 30000));
          }

          // B. PENCARIAN DENGAN SMART MATCH (Menangani Inisial & Karakter Tersembunyi)
          const p = allAsim?.find(a => isSmartMatch(a.asisten_imam, row.Nama_Petugas));
          const k = allAsim?.find(a => isSmartMatch(a.asisten_imam, row.Nama_Koordinator));

          if (!p) {
            setLogs(prev => [...prev, `⚠️ ${progress} SKIP: "${row.Nama_Petugas}" tidak ditemukan.`]);
            continue;
          }

          const rawNoK = k ? String(k.no_hp).replace(/[^0-9]/g, '') : '';
          const linkWA = rawNoK ? `wa.me/62${rawNoK}` : '#';

          const msgPetugas = `*PENGINGAT TUGAS ASISTEN IMAM*

Salam Damai,
Bapak/Ibu *${row.Nama_Petugas}*

Mengingatkan kembali jadwal tugas pelayanan:
🗓️ *Hari/Tgl:* ${row.TanggalRapi}
⏰ *Jam:* ${row.Jam || '-'} WIB

Dimohon hadir paling lambat 30 menit sebelum ibadah dimulai & mematuhi ketentuan protokoler kesehatan. 

Jika Bapak/Ibu berhalangan hadir, segera hubungi Koordinator selambat-lambatnya H-2 sebelum jadwal tugas.\n
Koordinator Anda:
*${row.Nama_Koordinator}*
Klik untuk chat: ${linkWA}

Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

Terima kasih atas pelayanannya. Tuhan memberkati. 🙏`;

          // Simpan Log ke Database
          await supabase.from('jadwal_tugas').insert({
            asim_id: p.id,
            tanggal: row.TanggalSafe.toISOString().split('T')[0],
            nama_koordinator: row.Nama_Koordinator
          });

          // Kirim ke Petugas
          const resP = await sendWA(p.no_hp, msgPetugas);
          if (resP.status) {
            setLogs(prev => [...prev, `✅ ${progress} BERHASIL: ${row.Nama_Petugas}`]);
            // Tambahkan ke daftar rekap untuk pengawas
            laporanUntukPengawas.push(`${i + 1}. *${row.Nama_Petugas}* (${row.Jam})`);
          }

          // Kirim ke Koordinator
          if (k && k.no_hp) {
            const msgKoord = `*LAPORAN NOTIFIKASI*\nHalo ${row.Nama_Koordinator}, notifikasi tugas *${row.Nama_Petugas}* telah dikirim oleh sistem.`;
            await sendWA(k.no_hp, msgKoord);
          }

          // C. JEDA ACAK ANTAR PESAN (2 sampai 5 detik)
          const msJeda = Math.floor(Math.random() * (35000 - 5000 + 1) + 20000);
          await new Promise(res => setTimeout(res, msJeda));
        }

        // --- D. KIRIM REKAP KE SEMUA PENGAWAS (Hanya 1x Kirim) ---
        if (laporanUntukPengawas.length > 0 && listPengawas.length > 0) {
          const tglTugas = dataExcel[0]?.TanggalRapi || "";
          const msgRekap = `*REKAP PENGIRIMAN JADWAL*\n🗓️ *Tgl Tugas:* ${tglTugas}\n\n*Petugas Terkirim:*\n${laporanUntukPengawas.join('\n')}\n\n✅ Sistem telah selesai mengirimkan semua notifikasi.`;
          
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

          for (const [index, pengawas] of listPengawas.entries()) {
            await sendWA(pengawas.no_hp, msgRekap);
            
            // Memberi jeda 3 detik (3000ms) antar pengawas, 
            // kecuali setelah pengiriman ke pengawas terakhir
            if (index < listPengawas.length - 1) {
              setLogs(prev => [...prev, `⏳ Menunggu sebelum mengirim ke pengawas berikutnya...`]);
              await sleep(5000); 
            }
          }

          setLogs(prev => [...prev, "📱 Rekap kolektif telah dikirim ke semua Pengawas."]);
        }
      } catch (err: any) {
        setLogs(prev => [...prev, `❌ ERROR: ${err.message}`]);
      } finally {
        setIsProcessing(false);
      }
    };

    if (isCSV) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

//   const handleUploadJadwal = async (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     const isCSV = file.name.endsWith('.csv');
//     setLogs([`📁 Membuka file ${isCSV ? 'CSV' : 'Excel'}...`]);
//     setIsProcessing(true);

//     const reader = new FileReader();
//     reader.onload = async (evt) => {
//       try {
//         const bstr = evt.target?.result;
//         const workbook = XLSX.read(bstr, { 
//           type: isCSV ? 'string' : 'binary', 
//           cellDates: true, 
//           raw: false 
//         });

//         const wsname = workbook.SheetNames[0];
//         const rawDataExcel: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[wsname]);

//         const getSafeDate = (input: any) => {
//           let d = input instanceof Date ? new Date(input.getTime()) : (!isNaN(input) ? new Date((input - 25569) * 86400 * 1000) : new Date(input));
//           if (!isNaN(d.getTime())) d.setHours(d.getHours() + 12);
//           return d;
//         };

//         // 1. MAPPING DATA & UPPERCASE
//         const dataExcel = rawDataExcel.map(row => {
//           const findValue = (possibleNames: string[]) => {
//             const foundKey = Object.keys(row).find(key => 
//               possibleNames.includes(key.toLowerCase().trim().replace(/\s+/g, '_')) ||
//               possibleNames.includes(key.toLowerCase().trim())
//             );
//             return foundKey ? row[foundKey] : null;
//           };

//           const safeDate = getSafeDate(findValue(['tanggal', 'tgl', 'date']));

//           return {
//             ...row,
//             Nama_Petugas: String(findValue(['nama_petugas', 'petugas']) || '').toUpperCase().trim(),
//             Nama_Koordinator: String(findValue(['nama_koordinator', 'koordinator']) || '').toUpperCase().trim(),
//             Jam: formatJam(findValue(['jam', 'waktu', 'time'])),
//             TanggalSafe: safeDate,
//             TanggalRapi: !isNaN(safeDate.getTime()) 
//               ? safeDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
//               : "Tanggal Tidak Valid"
//           };
//         }).filter(item => item.Nama_Petugas !== "");

//         setPreviewData(dataExcel);
//         setLogs(prev => [...prev, `🔍 Ditemukan ${dataExcel.length} baris data valid.`]);

//         const { data: allAsim } = await supabase.from('asisten_imam').select('id, no_hp, asisten_imam');
//         const pengawas1 = allAsim?.find(a => a.asisten_imam?.toUpperCase().trim() === "YAKOBUS HERI PRIYANTO");
//         const pengawas2 = allAsim?.find(a => a.asisten_imam?.toUpperCase().trim() === "AGUSTINUS WAHYU SULISTYO");
//         const pengawas3 = allAsim?.find(a => a.asisten_imam?.toUpperCase().trim() === "IGNATIUS FEBIANTO KURNIAWAN");
//         const pengawas4 = allAsim?.find(a => a.asisten_imam?.toUpperCase().trim() === "YOHANES DWI PRASETYO DARMAWAN");
//         // --- MULAI PROSES PENGIRIMAN DENGAN ANTI-SPAM ---
//         for (let i = 0; i < dataExcel.length; i++) {
//           const row = dataExcel[i];
//           const progress = `[${i + 1}/${dataExcel.length}]`;

//           // A. ISTIRAHAT PER BATCH (Setiap 10 Pes  an, Istirahat 30 Detik)
//           if (i > 0 && i % 10 === 0) {
//             setLogs(prev => [...prev, "☕ Mencapai 10 pesan. Istirahat 30 detik agar aman..."]);
//             await new Promise(res => setTimeout(res, 30000));
//           }

//           // Ganti baris pencarian lama dengan ini:
//           const p = allAsim?.find(a => isSmartMatch(a.asisten_imam, row.Nama_Petugas));
//           const k = allAsim?.find(a => isSmartMatch(a.asisten_imam, row.Nama_Koordinator));
//           if (String(row.Nama_Petugas).toUpperCase().includes("ANDREAS DIDIET")) {
//             console.log("DEBUG MATCH:", {
//               excel: row.Nama_Petugas,
//               db_sample: allAsim?.[61]?.asisten_imam, // Sesuaikan index-nya
//               is_match: p ? "YES" : "NO"
//             });
//           }

//           if (!p) {
//             setLogs(prev => [...prev, `⚠️ ${progress} SKIP: "${row.Nama_Petugas}" tidak ditemukan.`]);
//             continue;
//           }

//           const rawNoK = k ? String(k.no_hp).replace(/[^0-9]/g, '') : '';
//           const linkWA = rawNoK ? `wa.me/62${rawNoK}` : '#';

//           const msgPetugas = `*PENGINGAT TUGAS ASISTEN IMAM*

// Salam Damai,
// Bapak/Ibu *${row.Nama_Petugas}*

// Mengingatkan kembali jadwal tugas pelayanan:
// 🗓️ *Hari/Tgl:* ${row.TanggalRapi}
// ⏰ *Jam:* ${row.Jam || '-'} WIB

// Dimohon hadir paling lambat 30 menit sebelum ibadah dimulai & mematuhi ketentuan protokoler kesehatan. 

// Jika Bapak/Ibu berhalangan hadir, segera hubungi Koordinator selambat-lambatnya H-2 sebelum jadwal tugas.\n
// Koordinator Anda:
// *${row.Nama_Koordinator}*
// Klik untuk chat: ${linkWA}

// Untuk mendapatkan asisten imam pengganti atau bertukar tugas. Bila 15 menit sebelum ibadat belum hadir maka akan digantikan personil AI lain yang telah siap menggantikan.

// Terima kasih atas pelayanannya. Tuhan memberkati. 🙏`;

//           await supabase.from('jadwal_tugas').insert({
//             asim_id: p.id,
//             tanggal: row.TanggalSafe.toISOString().split('T')[0],
//             nama_koordinator: row.Nama_Koordinator
//           });

//           const resP = await sendWA(p.no_hp, msgPetugas);
//           if (resP.status) setLogs(prev => [...prev, `✅ ${progress} BERHASIL: ${row.Nama_Petugas}`]);

//           if (k && k.no_hp) {
//             const msgKoord = `*LAPORAN NOTIFIKASI*\nHalo ${row.Nama_Koordinator}, notifikasi tugas *${row.Nama_Petugas}* telah dikirim oleh sistem.`;
//             await sendWA(k.no_hp, msgKoord);
//           }
//           const msgLaporanPengawas = `*LAPORAN SISTEM JADWAL*\n\nNotifikasi tugas telah dikirim kepada:\n👤 Petugas: *${row.Nama_Petugas}*\n🗓️ Jadwal: ${row.TanggalRapi}\n⏰ Jam: ${row.Jam}\n\nKoordinator: *${row.Nama_Koordinator}*`;

//           if (pengawas1) await sendWA(pengawas1.no_hp, msgLaporanPengawas);
//           if (pengawas2) await sendWA(pengawas2.no_hp, msgLaporanPengawas);
//           if (pengawas3) await sendWA(pengawas3.no_hp, msgLaporanPengawas);
//           if (pengawas4) await sendWA(pengawas4.no_hp, msgLaporanPengawas);

//           const msJeda = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
//           setLogs(prev => [...prev, `⏳ Jeda ${msJeda/1000} detik...`]);
//           await new Promise(res => setTimeout(res, msJeda));
//         }

//         setLogs(prev => [...prev, "🏁 PROSES SELESAI SEMUA."]);

//       } catch (err: any) {
//         setLogs(prev => [...prev, `❌ ERROR: ${err.message}`]);
//       } finally {
//         setIsProcessing(false);
//       }
//     };

//     if (isCSV) {
//         reader.readAsText(file);
//       } else {
//         reader.readAsBinaryString(file);
//       }
//     };

  if (loading) return <div className="p-10 text-center italic text-gray-500">Memuat Data Asisten...</div>;

  return (
    <main className="p-6 max-w-6xl mx-auto bg-white min-h-screen">
      <div className='flex mb-8 items-center gap-4 p-2 border-b'>
        <img src="/img/logo_gereja.png" alt="Logo Gereja" className="h-12 w-16 mb-4" />
        <div className="flex flex-col gap-1 justify-center items-left">
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Jadwal Asisten Imam</h1>
          <p className='text-[12px]'>Gereja Santa Maria Annuntiata - Sidoarjo</p>
        </div>
      </div>
      <div className="mb-2 gap-2">
      {!isAdmin ? (
          <div className="flex flex-col gap-2">
            <h3>Akses Upload Jadwal</h3>
            <div className='flex gap-2'>
              <input 
                type="password" 
                placeholder="Kode Akses" 
                className="border px-3 py-1 rounded w-32 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" 
                onChange={(e) => setPassInput(e.target.value)} 
              />
              <button 
                onClick={() => passInput === "GEREJA123" && setIsAdmin(true)} 
                className="bg-blue-100 px-4 py-1 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                Admin
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-2">
            <div className='flex justify-between items-center'>
              <label className="text-xs font-bold text-blue-700 uppercase">Upload Jadwal (.xlsx/.xls/.csv)</label>
              <button 
                onClick={downloadTemplate}
                className=" border-blue-300 border text-blue-600 px-3 py-1 rounded hover:bg-blue-50 w-fit"
              >
                📥 Download Template Excel
              </button>
            </div>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleUploadJadwal} 
              className="mt-2 text-sm bg-white border justify-between items-center border-blue-300 text-blue-600 p-3 w-fit rounded hover:bg-blue-50" 
            />
          
            <button onClick={() => setIsAdmin(false)} className="mt-2 text-xs bg-white  text-blue-600 p-3 rounded hover:bg-blue-50">Tutup Mode Admin</button>
          </div>
        )}
      <div className="flex flex-col mt-6 gap-6">
        {previewData.length > 0 && (
          <div className="overflow-hidden border rounded-xl shadow-sm bg-white">
            <div className="bg-gray-50 px-4 py-2 border-b">
              <h3 className="text-sm font-bold text-gray-700">Pratinjau Data Unggahan</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                    <th className="border-b p-3 text-left">Hari / Tanggal</th>
                    <th className="border-b p-3 text-left">Jam</th>
                    <th className="border-b p-3 text-left">Nama Petugas</th>
                    <th className="border-b p-3 text-left">Koordinator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewData.map((d, idx) => (
                    <tr key={idx} className={`${isProcessing ? "animate-pulse" : ""} hover:bg-blue-50/30 transition-colors`}>
                      {/* FIX TAMPILAN TANGGAL DI SINI */}
                      <td className="p-3 whitespace-nowrap font-medium">{d.TanggalRapi}</td>
                      <td className="p-3 font-medium text-blue-600">{d.Jam}</td>
                      <td className="p-3 font-bold text-gray-800">{d.Nama_Petugas}</td>
                      <td className="p-3 text-gray-600">{d.Nama_Koordinator}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="p-4 bg-gray-900 text-green-400 font-mono text-[10px] rounded-xl shadow-lg max-h-48 overflow-y-auto border border-gray-800">
            {logs.map((log, i) => <p key={i} className="mb-1 leading-relaxed"><span className="text-gray-500 mr-2">{i+1}.</span> {log}</p>)}
          </div>
        )}
      </div>
      </div>
      <hr className="my-10 border-gray-100" />

      <div className="space-y-8">
        {Object.entries(groupedAsim).map(([wilayah, petugas]) => (
          <section key={wilayah} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="bg-blue-600 px-5 py-3">
              <h2 className="text-white font-bold text-sm tracking-wide uppercase">{wilayah}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-5 bg-gray-50/50">
              {petugas.map((p) => (
                <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group">
                  <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{p.asisten_imam}</p>
                  <p className="text-[10px] text-gray-400 font-medium mb-3 uppercase tracking-tighter">{p.lingkungan}</p>
                  <a 
                    href={`https://wa.me/${String(p.no_hp).replace(/[^0-9]/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center text-[11px] text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full hover:bg-green-100 transition-colors"
                  >
                    📱 {p.no_hp}
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