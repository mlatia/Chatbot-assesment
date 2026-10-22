// Local end-to-end HTTP test: real Next.js + PostgreSQL SQL through a test-only
// PostgREST bridge. This is not proof of deployment in a hosted Supabase account.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createTestDatabase, call } from './test-db.mjs';
const db = await createTestDatabase();
const secret = 'sb_secret_' + randomBytes(24).toString('hex');
const admin = randomBytes(32).toString('hex');
const bridge = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/rest/v1/rpc/pw_call' || req.headers.apikey !== secret) {
        res.writeHead(401); res.end('{}'); return;
    }
    try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const value = await call(db, body.p_action, body.p_args);
        res.end(JSON.stringify(value));
    } catch { res.writeHead(500); res.end('{}'); }
});
await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
const supabaseUrl = `http://127.0.0.1:${bridge.address().port}`;
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
let logs = '';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, SUPABASE_URL: supabaseUrl, SUPABASE_SECRET_KEY: secret, ADMIN_REFRESH_TOKEN: admin, OPENAI_API_KEY: '', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', s => { logs += s; }); server.stderr.on('data', s => { logs += s; });
try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
        try { const r = await fetch(base + '/api/health'); if (r.ok) { ready = true; break; } } catch {}
        if (server.exitCode !== null) throw new Error('Next.js exited: ' + logs);
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'Next.js health did not become ready: ' + logs);
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.status, 'ok'); assert.equal(health.sources, 7);
    const root = await fetch(base); assert.equal(root.status, 200);
    assert.match(await root.text(), /PlacidWay Knowledge Assistant/);
    assert.equal((await (await fetch(base + '/api/sources')).json()).sources.length, 7);
    let cookie = '';
    async function send(message, requestId = randomUUID(), sessionCookie = cookie) {
        const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body: JSON.stringify({ message, requestId }) });
        if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
        return { status: r.status, data: await r.json() };
    }
    const requestId = randomUUID();
    const a = await send('How much does adrenal cancer treatment cost in Mexico?', requestId);
    assert.equal(a.status, 200); assert.match(a.data.answer, /USD 18,995/);
    const sessionOne = cookie;
    assert.deepEqual((await send('How much does adrenal cancer treatment cost in Mexico?', requestId)).data, a.data);
    const follow = await send('What about in Turkey?');
    assert.equal(follow.data.status, 'unknown'); assert.doesNotMatch(follow.data.answer, /USD 18,995/);
    const history = await (await fetch(base + '/api/session', { headers: { Cookie: sessionOne } })).json();
    assert.equal(history.turns.length, 2);
    const separate = await send('What is included?', randomUUID(), '');
    assert.equal(separate.data.status, 'clarification');
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', headers: { Origin: 'https://outside.example' }, body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/api/chat', { method: 'POST', body: '[]' })).status, 400);
    assert.equal((await fetch(base + '/api/refresh', { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + '/api/refresh')).status, 401);
    assert.equal((await fetch(base + '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Local Test', email: 'test@example.com', consent: false }) })).status, 400);
    const lead = await fetch(base + '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionOne }, body: JSON.stringify({ name: 'Local Test', email: 'test@example.com', consent: true }) });
    assert.equal(lead.status, 201);
    const gaps = await (await fetch(base + '/api/refresh', { headers: { Authorization: 'Bearer ' + admin } })).json();
    assert.equal(gaps.gaps.length, 1);
    assert.equal((await fetch(base + '/api/session', { method: 'DELETE', headers: { Cookie: sessionOne } })).status, 200);
    assert.deepEqual(await (await fetch(base + '/api/session', { headers: { Cookie: sessionOne } })).json(), { turns: [] });
    await new Promise((resolve, reject) => {
        const submission = spawn(process.execPath, ['--experimental-strip-types', 'scripts/test-submission.ts'], {
            env: { ...process.env, LIVE_BASE_URL: base }, stdio: 'inherit'
        });
        submission.once('error', reject);
        submission.once('exit', code => code === 0 ? resolve() : reject(new Error('Assessment HTTP tests failed')));
    });
    console.log(JSON.stringify({ passed: true, target: 'local Next.js production build + PostgreSQL through test bridge', checks: ['health', 'homepage', 'sources', 'price', 'idempotency', 'follow-up', 'history', 'session isolation', 'cross-origin', 'invalid input', 'admin authorization', 'lead consent', 'lead save', 'gap log', 'reset'], assessmentHttpTestsPassed: 8, openaiCalls: 0 }));
} finally {
    server.kill('SIGTERM');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
    bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve));
    await db.close();
}
