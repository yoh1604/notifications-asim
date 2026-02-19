import { createClient } from '@supabase/supabase-js';

// Ambil nilai dari .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Log ini untuk memastikan variabel terbaca
console.log("Variabel URL ditemukan:", !!supabaseUrl);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase URL atau Anon Key tidak ditemukan. Pastikan file .env.local sudah benar dan Server sudah di-restart."
  );
}

// Inisialisasi client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);