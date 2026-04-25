"use client"
import * as XLSX from 'xlsx';

export default function Uploader() {
  const uploadData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);

      let success = 0;
      for (const row of data) {
        const item = row as Record<string, unknown>;
        const response = await fetch('/api/petugas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama: item.nama || item.asisten_imam || item.Nama || item.Petugas,
            wilayah: item.wilayah || item.Wilayah || 'Tanpa Wilayah',
            lingkungan: item.lingkungan || item.Lingkungan || '',
            no_hp: item.no_hp || item.No_HP || item.NoHp || '',
          }),
        });
        if (response.ok) success += 1;
      }

      alert(`${success} data berhasil diupload ke PostgreSQL.`);
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
      <h3 className="font-bold mb-2">Upload Data Petugas (.xlsx / .csv)</h3>
      <input type="file" onChange={uploadData} accept=".xlsx, .csv" />
    </div>
  );
}
