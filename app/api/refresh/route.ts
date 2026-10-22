import { authorizedAdmin, json, sameOrigin } from '@/lib/server';
import { refreshKnowledge } from '@/lib/ingestion';
import { rpc } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(req: Request) {
    if (!sameOrigin(req) || !authorizedAdmin(req)) return json({ error: 'Admin authorization required' }, 401);
    try {
        if (!await rpc<boolean>('refresh_lease')) return json({ error: 'Refresh already running or cooling down. Last-good content remains active.' }, 409);
        const kb = await refreshKnowledge();
        await rpc('save_knowledge', { knowledge: kb });
        return json({ ok: true, version: kb.version, sources: kb.sources.length, builtAt: kb.builtAt });
    } catch { return json({ error: 'Refresh failed. Check source access, robots policy and Supabase status.', lastGoodPreserved: true }, 502); }
}
export async function GET(req: Request) {
    if (!authorizedAdmin(req)) return json({ error: 'Admin authorization required' }, 401);
    try { return json({ gaps: await rpc('gaps') }); }
    catch { return json({ error: 'Could not load content gaps' }, 503); }
}
