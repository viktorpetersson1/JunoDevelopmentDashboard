/**
 * Standard API response envelopes per CLAUDE.md §11.2:
 *   Success: { data: T }
 *   Error:   { error: { code, message } }
 *
 * Status codes:
 *   400 validation, 401 auth, 403 role, 404 not found, 409 conflict, 500 unexpected
 */
import { NextResponse } from 'next/server';

export interface ApiError {
  code: string;
  message: string;
}

export type ApiEnvelope<T> = { data: T } | { error: ApiError };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<{ data: T }>({ data }, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json<{ data: T }>({ data }, { status: 201 });
}

export function badRequest(message: string, code = 'BAD_REQUEST') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 400 });
}

export function unauthorized(message = 'Authentication required', code = 'UNAUTHENTICATED') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 401 });
}

export function forbidden(message = 'Insufficient role', code = 'FORBIDDEN') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 403 });
}

export function notFound(message = 'Not found', code = 'NOT_FOUND') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 404 });
}

export function conflict(message: string, code = 'CONFLICT') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 409 });
}

export function serverError(message = 'Unexpected server error', code = 'INTERNAL_ERROR') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 500 });
}

/** 422 — request well-formed but couldn't be processed (e.g. calc engine threw
 *  on the new inputs). Used to surface the verbatim engine error (V6.1 E7). */
export function unprocessable(message: string, code = 'UNPROCESSABLE') {
  return NextResponse.json<{ error: ApiError }>({ error: { code, message } }, { status: 422 });
}
