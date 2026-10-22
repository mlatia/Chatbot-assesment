import { session, json, sameOrigin, cookie } from '@/lib/server';
import { rpc } from '@/lib/storage';
export const runtime = 'nodejs';
export async function POST(req: Request) {
    if (!sameOrigin(req)) return json({ error: 'Cross-origin request rejected' }, 403);
    let body: Record<string, unknown>;
    try {
        const raw = await req.text();
        if (new TextEncoder().encode(raw).length > 12000) return json({ error: 'Request too large' }, 413);
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        body = value;
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100
        || typeof body.email !== 'string' || body.email.length > 254 || !/^\S+@\S+\.\S+$/.test(body.email) || body.consent !== true)
        return json({ error: 'Provide a name, valid email, and explicit consent.' }, 400);
    try {
        const current = await session(req);
        await rpc('lead', { id: crypto.randomUUID(), session_id: current.id, name: body.name.trim(), email: body.email.trim(), treatment: current.state.treatment });
        return json({ ok: true, message: 'Your contact was saved in this assessment demo only. It has not been sent to PlacidWay. Use the official quote link to submit an inquiry.' }, 201, { 'Set-Cookie': cookie(current.id, req) });
    } catch { return json({ error: 'Contact could not be saved. Please use the official quote link.' }, 503); }
}
