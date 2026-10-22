import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { answerQuestion } from '../lib/core.ts';
import { EMPTY_STATE } from '../lib/types.ts';
import type { Knowledge, State, Reply } from '../lib/types.ts';
const kb: Knowledge = JSON.parse(readFileSync(new URL('../data/knowledge.json', import.meta.url), 'utf8'));
const base = process.env.LIVE_BASE_URL?.replace(/\/$/, '');
const cases = [
    { type: 'Cost', session: 'cost', q: 'How much does adrenal cancer treatment cost in Mexico?', check: (r: Reply) => r.status === 'answered' && r.answer.includes('USD 18,995') && r.answer.includes('USD 30,000') },
    { type: 'Comparison', session: 'comparison', q: 'Is adrenal cancer treatment cheaper in Mexico or Turkey?', check: (r: Reply) => r.status === 'unknown' && r.answer.includes('do not have a comparable') },
    { type: 'Procedure / inclusions', session: 'package', q: 'What is included in the adenocarcinoma package?', check: (r: Reply) => r.status === 'answered' && r.answer.includes('Weekly Comprehensive Lab Work') },
    { type: 'Follow-up', session: 'package', q: 'And what about recovery time?', check: (r: Reply) => r.state.treatment === 'adenocarcinoma' && r.status === 'unknown' && r.answer.includes('neither is a recovery-time estimate') },
    { type: 'Booking unavailable', session: 'booking', q: 'Can you book me an appointment for tomorrow?', check: (r: Reply) => r.answer.includes('cannot book') && !!r.quoteUrl },
    { type: 'Out of scope', session: 'weather', q: 'What is the weather in Cancun?', check: (r: Reply) => r.status === 'declined' },
    { type: 'Personal medical advice', session: 'medical', q: 'Is this surgery safe for my diabetes?', check: (r: Reply) => r.status === 'medical' && r.answer.includes('doctor or oncologist') },
    { type: 'False-price premise', session: 'cost', q: 'I heard it costs $50. Confirm that.', check: (r: Reply) => r.answer.includes('cannot confirm') && r.answer.includes('USD 18,995') }
];
const states: Record<string, State> = {};
const cookies: Record<string, string> = {};
const results = [];
for (let i = 0; i < cases.length; i++) {
    const t = cases[i];
    let response: Reply;
    const start = performance.now();
    if (base) {
        const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookies[t.session] ? { Cookie: cookies[t.session] } : {}) }, body: JSON.stringify({ message: t.q, requestId: crypto.randomUUID() }) });
        assert.equal(r.status, 200, `HTTP ${r.status}: ${await r.clone().text()}`);
        const cookie = r.headers.get('set-cookie');
        if (cookie)
            cookies[t.session] = cookie.split(';')[0];
        response = await r.json() as Reply;
    }
    else
        response = answerQuestion(kb, t.q, states[t.session] || EMPTY_STATE);
    states[t.session] = response.state;
    const pass = t.check(response);
    assert.ok(pass, t.type);
    results.push({ number: i + 1, type: t.type, session: t.session, question: t.q, pass, latencyMs: Math.round(performance.now() - start), response });
}
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
const suffix = base ? 'live-test-results' : 'test-results';
writeFileSync(new URL('../docs/' + suffix + '.json', import.meta.url), JSON.stringify({ testedAt: new Date().toISOString(), target: base || 'local pure engine', engine: 'see each response.engine; model calls are not proven by key configuration', passed: results.length, total: cases.length, results }, null, 2));
let md = `# Assessment test results\n\nTested: ${new Date().toISOString()}\n\nTarget: ${base || 'Local engine against the downloaded source snapshot'}\n\nResult: **${results.length}/${cases.length} passed**. Consult response.engine for the actual path used; these eight cases do not prove a successful model API call.\n\nQuestions 3–4 share a conversation; questions 1 and 8 share a separate conversation. Other questions use isolated sessions.\n`;
for (const t of results)
    md += `\n## ${t.number}. ${t.type} — PASS\n\n**Question:** ${t.question}\n\n**Actual answer:**\n\n${t.response.answer}\n\n**Status:** ${t.response.status}; **latency:** ${t.latencyMs} ms\n\n**Sources:**\n\n${t.response.citations.map(c => '- [' + c.label + '](' + c.url + ')').join('\n')}\n`;
writeFileSync(new URL('../docs/' + suffix + '.md', import.meta.url), md);
console.log(JSON.stringify({ target: base || 'local', passed: results.length, total: cases.length, files: [suffix + '.md', suffix + '.json'] }));
