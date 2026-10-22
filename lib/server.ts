import { timingSafeEqual } from 'node:crypto';
import bundled from '../data/knowledge.json';
import { EMPTY_STATE } from './types.ts';
import type { Knowledge, State } from './types.ts';
import { rpc } from './storage.ts';

export async function knowledge(): Promise<Knowledge> {
    const active = await rpc<Knowledge | null>('knowledge');
    return active ?? bundled as Knowledge;
}
export function sessionId(req: Request) {
    return req.headers.get('cookie')?.match(/(?:^|;\s*)pw_session=([a-f0-9-]{36})(?:;|$)/)?.[1] ?? null;
}
export function sameOrigin(req: Request) {
    const origin = req.headers.get('origin');
    return !origin || origin === new URL(req.url).origin;
}
export function cookie(id: string, req: Request) {
    const secure = process.env.NODE_ENV === 'production' || new URL(req.url).protocol === 'https:';
    return `pw_session=${id}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Max-Age=${id ? 604800 : 0}`;
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
    return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function session(req: Request) {
    return rpc<{ id: string; state: State; revision: number }>('session', {
        id: sessionId(req), new_id: crypto.randomUUID(), initial_state: EMPTY_STATE
    });
}
export async function allowedRate(req: Request) {
    // Vercel supplies x-vercel-forwarded-for; the same fallback works locally.
    const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local-network';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const hash = Array.from(new Uint8Array(bytes).slice(0, 12), n => n.toString(16).padStart(2, '0')).join('');
    return rpc<boolean>('rate', { key: `${hash}:${Math.floor(Date.now() / 60000)}` });
}
export function redact(question: string) {
    return question.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/\+?[\d ()-]{8,}/g, '[phone]').slice(0, 2000);
}
export function authorizedAdmin(req: Request) {
    const secret = process.env.ADMIN_REFRESH_TOKEN;
    if (!secret || secret.length < 24) return false;
    const actual = Buffer.from(req.headers.get('authorization') || '');
    const expected = Buffer.from(`Bearer ${secret}`);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
