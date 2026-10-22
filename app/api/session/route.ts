import { sessionId, json, sameOrigin, cookie } from '@/lib/server';
import { rpc } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
    const id = sessionId(req);
    if (!id) return json({ turns: [] });
    try { return json({ turns: await rpc('history', { id }) }); }
    catch { return json({ error: 'Could not restore conversation' }, 503); }
}
export async function DELETE(req: Request) {
    if (!sameOrigin(req)) return json({ error: 'Cross-origin request rejected' }, 403);
    try {
        const id = sessionId(req);
        if (id) await rpc('reset', { id });
        return json({ ok: true }, 200, { 'Set-Cookie': cookie('', req) });
    } catch { return json({ error: 'Could not reset conversation' }, 503); }
}
