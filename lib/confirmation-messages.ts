/**
 * WhatsApp Message Templates for Confirmation Feature
 * Pesan WhatsApp untuk fitur konfirmasi kehadiran
 */

export interface ConfirmationMessageData {
  petugas_nama: string;
  tanggal: string; // Format: DD MMMM YYYY (e.g., "15 Mei 2026")
  jam: string; // Format: HH:MM (e.g., "08:00")
  hari: string; // Format: Hari (e.g., "Kamis")
}

/**
 * Template 1: Initial Confirmation Request
 * Pesan yang dikirim saat jadwal baru dibuat (status: pending)
 */
export function getConfirmationRequestTemplate(
  data: ConfirmationMessageData,
): string {
  return `Assalamu'alaikum ${data.petugas_nama} 🙏

Anda dijadwalkan sebagai Asisten Imam pada:

📅 Hari: ${data.hari}
📆 Tanggal: ${data.tanggal}
⏰ Jam: ${data.jam}

*Mohon konfirmasi kehadiran Anda dengan membalas pesan ini:*
• Ketik *BISA* jika Anda bisa hadir
• Ketik *TIDAK* jika Anda tidak bisa hadir

Terima kasih atas perhatian dan kerja samanya! 🙏
---
Sistem Jadwal Asisten Imam Gereja
`;
}

/**
 * Template 2: Reminder untuk yang belum konfirmasi
 * Dikirim beberapa jam sebelum jadwal (optional)
 */
export function getConfirmationReminderTemplate(
  data: ConfirmationMessageData,
): string {
  return `Assalamu'alaikum ${data.petugas_nama} 🙏

⏰ *PENGINGAT JADWAL*

Jadwal Anda sebagai Asisten Imam:
📅 ${data.hari}, ${data.tanggal}
⏰ ${data.jam}

Kami belum menerima konfirmasi dari Anda.

*Mohon segera balas dengan:*
• *BISA* - Jika Anda siap hadir
• *TIDAK* - Jika berhalangan

Terima kasih! 🙏
`;
}

/**
 * Template 3: Confirmation Received - BISA
 * Balasan otomatis saat petugas mengkonfirmasi BISA
 */
export function getConfirmedResponseTemplate(
  petugas_nama: string,
  tanggal: string,
  jam: string,
): string {
  return `✅ *KONFIRMASI DITERIMA*

Terima kasih ${petugas_nama}!

Kehadiran Anda pada:
📅 ${tanggal}
⏰ ${jam}

Telah dikonfirmasi dan dicatat dalam sistem.

Kami tunggu kehadiran Anda. 🙏
`;
}

/**
 * Template 4: Decline Received - TIDAK
 * Balasan otomatis saat petugas mengkonfirmasi TIDAK
 */
export function getDeclinedResponseTemplate(
  petugas_nama: string,
  tanggal: string,
  jam: string,
): string {
  return `❌ *KETIDAKHADIRAN DICATAT*

${petugas_nama},

Kami telah mencatat bahwa Anda tidak bisa hadir pada:
📅 ${tanggal}
⏰ ${jam}

Tim kami akan segera mencari pengganti. Terima kasih atas pemberitahuannya. 🙏
`;
}

/**
 * Template 5: Replacement Notification
 * Dikirim ke pengganti saat ada yang tolak
 */
export function getReplacementNotificationTemplate(
  petugas_nama: string,
  tanggal: string,
  jam: string,
  hari: string,
): string {
  return `Assalamu'alaikum ${petugas_nama} 🙏

*UPDATE JADWAL MENDESAK*

Ada perubahan jadwal. Anda dinominasikan untuk mengganti sebagai Asisten Imam:

📅 Hari: ${hari}
📆 Tanggal: ${tanggal}
⏰ Jam: ${jam}

*Mohon konfirmasi segera dengan:*
• *BISA* - Jika Anda bisa menggantikan
• *TIDAK* - Jika Anda berhalangan

Terima kasih atas bantuan dan dedikasi Anda! 🙏
---
Sistem Jadwal Asisten Imam Gereja
`;
}

/**
 * Helper function untuk format tanggal Indonesia
 */
export function formatTanggalIndonesia(date: Date): {
  hari: string;
  tanggal: string;
} {
  const hari = date.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    hari: hari.charAt(0).toUpperCase() + hari.slice(1), // Capitalize first letter
    tanggal,
  };
}

/**
 * Helper function untuk format jam dari time string (HH24:MI)
 */
export function formatJam(timeString: string): string {
  // timeString format: "08:00" atau "HH24:MI"
  return timeString;
}

/**
 * Send WhatsApp confirmation message via Fonnte
 */
export async function sendConfirmationMessage(
  phoneNumber: string,
  template: "request" | "reminder" | "replacement",
  data: ConfirmationMessageData,
): Promise<{ status: boolean; message: string }> {
  const token = process.env.NEXT_PUBLIC_FONNTE_TOKEN;
  if (!token) {
    return { status: false, message: "Fonnte token tidak ditemukan" };
  }

  let messageText = "";
  switch (template) {
    case "request":
      messageText = getConfirmationRequestTemplate(data);
      break;
    case "reminder":
      messageText = getConfirmationReminderTemplate(data);
      break;
    case "replacement":
      messageText = getReplacementNotificationTemplate(
        data.petugas_nama,
        data.tanggal,
        data.jam,
        data.hari,
      );
      break;
  }

  // Normalize phone number
  let normalizedPhone = String(phoneNumber).replace(/[^0-9]/g, "");
  if (normalizedPhone.startsWith("0")) {
    normalizedPhone = "62" + normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith("62")) {
    normalizedPhone = "62" + normalizedPhone;
  }

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: normalizedPhone,
        message: messageText,
      }),
    });

    const result = await response.json();
    return {
      status: result.status,
      message: result.message || "Pesan terkirim",
    };
  } catch (error) {
    console.error("[WhatsApp Send Error]", error);
    return {
      status: false,
      message: error instanceof Error ? error.message : "Gagal mengirim pesan",
    };
  }
}
