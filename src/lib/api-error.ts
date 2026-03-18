import { NextResponse } from 'next/server';

/**
 * Returns a generic 500 error response while logging the real error server-side.
 * Prevents leaking database schema details (table names, column names, constraints)
 * in API responses.
 */
export function internalError(error: { message?: string } | unknown, context?: string) {
  const msg = error && typeof error === 'object' && 'message' in error
    ? (error as { message: string }).message
    : String(error);
  console.error(`[API Error]${context ? ` ${context}:` : ''}`, msg);
  return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
}
