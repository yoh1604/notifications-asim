"use client"
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

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

      // Masukkan ke Supabase
      const { error } = await supabase.from('petugas').insert(data);
      
      if (error) alert("Error: " + error.message);
      else alert("Data Berhasil Diupload ke Supabase!");
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