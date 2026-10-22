const base = process.env.LIVE_BASE_URL?.replace(/\/$/, '');
if (!base) throw new Error('Set LIVE_BASE_URL in .env.local or your shell.');
let failures = 0;
for (let attempt = 1; attempt <= 2; attempt++) {
    const checks = await Promise.all(['/api/health', '/'].map(async path => {
        try {
            const response = await fetch(base + path, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
            const body = await response.text();
            if (path === '/api/health') {
                const data = JSON.parse(body);
                return { path, httpStatus: response.status, status: data.status, sources: data.sources,
                    passed: response.status === 200 && data.status === 'ok' && data.sources === 7 };
            }
            return { path, httpStatus: response.status, passed: response.status === 200 && body.includes('PlacidWay Knowledge Assistant') };
        } catch (e) { return { path, passed: false, error: e.message }; }
    }));
    failures = checks.filter(c => !c.passed).length;
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), attempt, checks }, null, 2));
    if (!failures) break;
}
process.exitCode = failures ? 1 : 0;
