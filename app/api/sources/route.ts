import { knowledge, json } from '@/lib/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const kb = await knowledge();
        return json({ version: kb.version, builtAt: kb.builtAt,
            engine: process.env.GROQ_API_KEY?.trim() ? 'groq-configured-not-verified' : 'extractive',
            sources: kb.sources.map(({ id, label, url, title, fetchedAt, lines, sha256 }) => ({ id, label, url, title, fetchedAt, passages: lines.length, sha256 })) });
    } catch { return json({ error: 'Source metadata unavailable' }, 503); }
}
