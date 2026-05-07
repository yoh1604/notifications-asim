import { NextResponse } from "next/server";
import { badRequest, errorMessage } from "@/lib/http";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Fonnte Webhook Handler untuk penerimaan balasan WhatsApp
 * Endpoint: POST /api/webhook/fonnte/confirm
 *
 * Menerima data dari Fonnte dengan format:
 * {
 *   device_id: string,
 *   sender: string (nomor pengirim dengan format 62xxx),
 *   message: string,
 *   name: string (nama pengirim di kontak),
 *   media_url?: string,
 *   media_type?: string,
 *   timestamp?: number
 * }
 */

type FonnteSenderData = {
  device_id: string;
  sender: string;
  message: string;
  name?: string;
  timestamp?: number;
};

type ConfirmationResult = {
  id: number;
  nama: string;
  no_hp: string | null;
  jadwal_id: number;
  tanggal: string;
  jam: string;
  confirmation_status: string;
};

// Normalize nomor HP ke format 62xxx
function normalizePhoneNumber(phone: string): string {
  let normalized = String(phone).replace(/[^0-9]/g, "");

  if (normalized.startsWith("0")) {
    normalized = "62" + normalized.substring(1);
  } else if (!normalized.startsWith("62")) {
    normalized = "62" + normalized;
  }

  return normalized;
}

// Ekstrak perintah dari pesan (BISA atau TIDAK)
function extractConfirmationCommand(message: string): "bisa" | "tidak" | null {
  const normalized = message
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (normalized.includes("BISA")) return "bisa";
  if (normalized.includes("TIDAK")) return "tidak";

  return null;
}

export async function POST(request: Request) {
  try {
    // Validasi method POST
    if (request.method !== "POST") {
      return NextResponse.json(
        { error: "Hanya POST yang diizinkan" },
        { status: 405 },
      );
    }

    const body: unknown = await request.json();

    // Parse dan validasi data dari Fonnte
    if (
      typeof body !== "object" ||
      body === null ||
      !("sender" in body) ||
      !("message" in body)
    ) {
      return badRequest("Data Fonnte tidak lengkap (sender dan message wajib).");
    }

    const fontneData = body as FonnteSenderData;
    const senderPhone = normalizePhoneNumber(fontneData.sender);
    const messageText = String(fontneData.message || "").trim();

    if (!senderPhone || !messageText) {
      return badRequest("Nomor pengirim atau pesan kosong.");
    }

    // Ekstrak perintah konfirmasi
    const confirmationCommand =
      extractConfirmationCommand(messageText);

    if (!confirmationCommand) {
      // Jika bukan BISA atau TIDAK, kirim pesan balasan otomatis
      await sendAutoReply(senderPhone, fontneData.name || senderPhone);
      return NextResponse.json(
        {
          status: "ignored",
          message:
            "Pesan tidak berisi perintah BISA atau TIDAK. Auto-reply dikirim.",
        },
        { status: 200 },
      );
    }

    // Cari petugas berdasarkan nomor HP
    const petugasResult = await query<{ id: number; nama: string }>(
      `SELECT id, nama FROM petugas WHERE no_hp = $1 LIMIT 1`,
      [senderPhone],
    );

    if (petugasResult.rows.length === 0) {
      await sendAutoReply(
        senderPhone,
        fontneData.name || senderPhone,
        "Nomor tidak terdaftar",
      );
      return NextResponse.json(
        { status: "not_found", message: "Petugas tidak ditemukan" },
        { status: 404 },
      );
    }

    const petugasId = petugasResult.rows[0].id;
    const petugasNama = petugasResult.rows[0].nama;

    // Cari penugasan terbaru yang pending untuk petugas ini
    const penugasanResult = await query<ConfirmationResult>(
      `
        SELECT
          pp.id,
          p.nama,
          p.no_hp,
          pp.jadwal_id,
          pp.tanggal::text,
          to_char(pp.jam, 'HH24:MI') as jam,
          pp.confirmation_status
        FROM penugasan_petugas pp
        JOIN petugas p ON p.id = pp.petugas_id
        WHERE pp.petugas_id = $1
          AND pp.confirmation_status = 'pending'
          AND pp.status = 'terjadwal'
        ORDER BY pp.tanggal DESC, pp.jam DESC
        LIMIT 1
      `,
      [petugasId],
    );

    if (penugasanResult.rows.length === 0) {
      await sendAutoReply(
        senderPhone,
        petugasNama,
        "Tidak ada jadwal yang menunggu konfirmasi",
      );
      return NextResponse.json(
        {
          status: "no_pending",
          message: "Tidak ada penugasan pending untuk petugas ini",
        },
        { status: 404 },
      );
    }

    const penugasan = penugasanResult.rows[0];
    const jadwalId = penugasan.jadwal_id;

    // Update status berdasarkan perintah
    let updateResult;
    if (confirmationCommand === "bisa") {
      updateResult = await query(
        `
          SELECT mark_penugasan_confirmed($1::integer, $2::bigint)
            AS result
        `,
        [petugasId, jadwalId],
      );
    } else {
      updateResult = await query(
        `
          SELECT mark_penugasan_declined($1::integer, $2::bigint, $3)
            AS result
        `,
        [petugasId, jadwalId, messageText],
      );
    }

    // Kirim konfirmasi balasan
    const confirmationMessage =
      confirmationCommand === "bisa"
        ? `✅ Terima kasih ${petugasNama}, konfirmasi kehadiran untuk ${penugasan.tanggal} jam ${penugasan.jam} telah diterima. Status: DIKONFIRMASI`
        : `❌ Maaf, ${petugasNama}. Ketidakhadiran untuk ${penugasan.tanggal} jam ${penugasan.jam} telah dicatat. Tim akan mencari pengganti.`;

    await sendAutoReply(senderPhone, petugasNama, confirmationMessage);

    return NextResponse.json(
      {
        status: "success",
        message: `Konfirmasi ${confirmationCommand === "bisa" ? "kehadiran" : "ketidakhadiran"} telah diproses`,
        petugas: petugasNama,
        jadwal_date: penugasan.tanggal,
        jadwal_time: penugasan.jam,
        confirmation_status:
          confirmationCommand === "bisa" ? "confirmed" : "declined",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Fonnte Webhook Error]", error);
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}

/**
 * Helper: Kirim pesan balasan otomatis via WhatsApp
 */
async function sendAutoReply(
  phone: string,
  name: string,
  customMessage?: string,
): Promise<void> {
  const token = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  if (!token) return;

  let message =
    customMessage ||
    `Halo ${name}, terima kasih atas balasannya. Kami akan memproses informasi Anda.`;

  try {
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: phone,
        message,
      }),
    });
  } catch (err) {
    console.error("[Auto-reply send failed]", err);
  }
}

/**
 * GET endpoint untuk testing webhook
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ready",
      message: "Fonnte Confirmation Webhook is running",
      endpoint: "/api/webhook/fonnte/confirm",
      method: "POST",
    },
    { status: 200 },
  );
}
