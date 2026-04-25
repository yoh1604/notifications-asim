import { NextResponse } from "next/server";

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kesalahan server.";
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
