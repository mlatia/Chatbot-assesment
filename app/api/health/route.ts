import { knowledge, json } from '@/lib/server';
import { rpc } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        await rpc('health');
        const kb = await knowledge();
        return json({ status: 'ok', sources: kb.sources.length, knowledgeVersion: kb.version,
            engine: process.env.OPENAI_API_KEY?.trim() ? 'openai-configured-not-verified' : 'extractive' });
    } catch {
        return json({ status: 'unavailable', error: 'Check Supabase project status, server environment and supabase/schema.sql.' }, 503);
    }
}
