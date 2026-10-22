import test from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../lib/storage.ts';
test('RPC uses the modern secret header and does not expose provider error details', async () => {
    const oldFetch = globalThis.fetch;
    const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_FAKE_TEST_ONLY';
    try {
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
            assert.equal(String(url), 'https://example.supabase.co/rest/v1/rpc/pw_call');
            const headers = new Headers(init?.headers);
            assert.equal(headers.get('apikey'), 'sb_secret_FAKE_TEST_ONLY');
            assert.equal(headers.get('authorization'), null);
            assert.deepEqual(JSON.parse(String(init?.body)), { p_action: 'health', p_args: {} });
            return Response.json(true);
        }) as typeof fetch;
        assert.equal(await rpc('health'), true);
        globalThis.fetch = (async () => new Response('DO_NOT_EXPOSE_SECRET_PROVIDER_DETAIL', { status: 401 })) as typeof fetch;
        await assert.rejects(rpc('health'), err => {
            assert.match(String(err), /HTTP 401/);
            assert.doesNotMatch(String(err), /DO_NOT_EXPOSE|sb_secret/); return true;
        });
    } finally {
        globalThis.fetch = oldFetch;
        if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
    }
});
