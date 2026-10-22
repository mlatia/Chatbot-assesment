import { answerQuestion } from '@/lib/core';
import { chunks } from '@/lib/retrieval';
import { selectWithOpenAI } from '@/lib/model';
import { knowledge, session, json, sameOrigin, cookie, allowedRate, redact } from '@/lib/server';
import { rpc } from '@/lib/storage';
import type { Reply, State } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000
        || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))
        return json({ error: 'Provide message (1–2000 characters) and requestId (8–100 safe characters).' }, 400);
    let id: string | undefined;
    let token: string | undefined;
    let locked = false;
    try {
        if (!await allowedRate(req)) return json({ error: 'Too many requests. Please try again in a minute.' }, 429, { 'Retry-After': '60' });
        const current = await session(req);
        id = current.id;
        const turnId = `${id}:${body.requestId}`;
        const cached = await rpc<Reply | null>('turn', { id: turnId });
        if (cached) return json(cached, 200, { 'Set-Cookie': cookie(id, req) });
        token = crypto.randomUUID();
        const lease = await rpc<{ state: State } | null>('acquire', { id, token });
        if (!lease) return json({ error: 'Another reply is being prepared. Please try again shortly.' }, 409, { 'Set-Cookie': cookie(id, req) });
        locked = true;
        // A matching request may have completed between the first cache check and lock.
        const completed = await rpc<Reply | null>('turn', { id: turnId });
        if (completed) return json(completed, 200, { 'Set-Cookie': cookie(id, req) });
        const kb = await knowledge();
        let reply = answerQuestion(kb, body.message, lease.state);
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (apiKey && reply.intent === 'general' && reply.status === 'answered') {
            try {
                const candidates = chunks(kb).filter(e => reply.evidenceIds.includes(e.id));
                const ids = await selectWithOpenAI(body.message, candidates, apiKey, process.env.OPENAI_MODEL || 'gpt-4.1-mini');
                if (ids.length) {
                    const selected = candidates.filter(e => ids.includes(e.id));
                    reply = { ...reply,
                        answer: 'The approved page states:\n\n' + selected.map(e => '• ' + e.text).join('\n') + '\n\nThese are attributed website descriptions, not medical recommendations.',
                        engine: 'openai-evidence-selection', trace: [...reply.trace, 'constrained_model_selection'] };
                }
            } catch { reply = { ...reply, engine: 'extractive-fallback', trace: [...reply.trace, 'model_unavailable_use_verified_evidence'] }; }
        }
        const saved = await rpc<boolean>('commit', { session_id: id, token, turn_id: turnId,
            request_id: body.requestId, question: body.message, response: reply,
            gap_id: crypto.randomUUID(), redacted_question: redact(body.message), version: kb.version });
        if (!saved) return json({ error: 'The conversation changed while the answer was being prepared. Please retry.' }, 409, { 'Set-Cookie': cookie(id, req) });
        locked = false;
        return json(reply, 200, { 'Set-Cookie': cookie(id, req) });
    } catch {
        return json({ error: 'The assistant is temporarily unavailable. Check server configuration and retry; no answer has been invented.' }, 503);
    } finally {
        if (locked && id && token) try { await rpc('release', { id, token }); } catch { /* lease expires */ }
    }
}
