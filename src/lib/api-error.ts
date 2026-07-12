import { NextResponse } from 'next/server';

// Log the real DB/internal error server-side and return a GENERIC message to the
// client. Postgres error text (column, constraint and RLS names) is schema recon
// in an attacker's hands, so it must never reach the response body. Use this in
// place of `NextResponse.json({ error: error.message })`.
export function serverError(
  context: string,
  error: unknown,
  opts?: { status?: number; message?: string }
): NextResponse {
  console.error(`[${context}]`, error);
  return NextResponse.json(
    { error: opts?.message ?? 'Something went wrong. Please try again.' },
    { status: opts?.status ?? 500 }
  );
}
