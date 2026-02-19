"use client"
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const [listAsim, setListAsim] = useState<any[]>([]);

  useEffect(() => {
    async function ambilData() {
      const { data } = await supabase.from('asisten_imam').select('*').order('wilayah', { ascending: true });
      if (data) setListAsim(data);
    }
    ambilData();
  }, []);

  return (
    <main className="p-10">
      <h1 className="text-2xl font-bold mb-4">Daftar Asisten Imam:</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listAsim.map((p) => (
          <div key={p.id} className="p-4 border rounded shadow-sm">
            <p className="font-bold">{p.asisten_imam}</p>
            <p className="text-sm text-gray-600">{p.wilayah} - {p.lingkungan}</p>
            <p className="text-sm text-green-600 font-mono">{p.no_hp}</p>
          </div>
        ))}
      </div>
    </main>
  );
}