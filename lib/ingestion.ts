import { SOURCE_URLS, CRAWLER_UA } from './config.ts';
import type { Knowledge, Source } from './types.ts';
const IDS = ['clinic', 'adenocarcinoma', 'adrenal', 'anal', 'videos', 'prices', 'comparison'];
const LABELS = ['ITC clinic profile', 'Adenocarcinoma treatment package', 'Adrenal cancer treatment package', 'Anal cancer treatment package', 'ITC clinic videos', 'ITC price list', 'Alternative medicine price comparison'];
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decodeHTML(t: string) { return t.replace(/&#(x[\da-f]+|\d+);/gi, (_, v: string) => String.fromCodePoint(v.startsWith('x') ? parseInt(v.slice(1), 16) : Number(v))).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g, (_, n: string) => ENTITIES[n] || ' '); }
export function extractHTML(html: string, id: string): {
    title: string;
    lines: string[];
} {
    const title = decodeHTML(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    let clean = html.replace(/<(script|style|noscript|svg|nav|footer|header|form|button|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    const rows: string[] = [];
    clean = clean.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner: string) => { const cells = Array.from(inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(m => decodeHTML(m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())); rows.push(cells.join(' | ')); return '\nPWROW' + (rows.length - 1) + 'PWEND\n'; });
    clean = clean.replace(/<t[dh]\b[^>]*>/gi, ' | ').replace(/<\/(p|li|h[1-4]|tr|dt|dd)>/gi, '\n').replace(/<(p|li|h[1-4]|tr|dt|dd)\b[^>]*>/gi, '\n');
    const lines = [...new Set(decodeHTML(clean.replace(/<[^>]*>/g, ' ')).split('\n').map(s => s.replace(/PWROW(\d+)PWEND/g, (_, i: string) => rows[Number(i)]).replace(/\s+/g, ' ').trim().replace(/^\|\s*/, ''))).values()].filter(s => s.length >= 15 && s.length <= 1500);
    const markers: Record<string, string> = { clinic: 'ITC Immunity Therapy Center - Alternative Cancer Treatment in Tijuana, Tijuana, Mexico Profile Details', adenocarcinoma: 'Related Experiences:', adrenal: 'Related Experiences:', anal: 'Related Experiences:', videos: 'Explore : Stories, Testimonials, and Procedures', prices: 'Explore : Stories, Testimonials, and Procedures', comparison: 'Trusted Medical Tourism Platform Since 2007' };
    const end = lines.findIndex(s => s.startsWith(markers[id]));
    let primary = end < 0 ? lines : lines.slice(0, end);
    if (id === 'clinic')
        primary = primary.filter(l => !['No slots available', 'Virtual Consultation', 'Request a video call', 'Book a consultation'].some(t => l.includes(t)));
    if (id === 'prices') {
        const a = primary.findIndex(l => l.endsWith('Reviews'));
        const b = primary.findIndex(l => l.startsWith('Price Range:'));
        if (a >= 0 && b > a)
            primary = [...primary.slice(0, a), ...primary.slice(b)];
    }
    if (id === 'clinic')
        primary.push(...lines.filter(l => /^(Location:|Speciality:|Associated Doctors:)/.test(l)).slice(0, 3));
    return { title, lines: primary };
}
/** Robots longest-match allow/disallow with grouped User-agent rules. Fail closed. */
export function robotsAllows(text: string, url: string, userAgent = CRAWLER_UA): boolean {
    const groups: {
        agents: string[];
        rules: {
            allow: boolean;
            path: string;
        }[];
    }[] = [];
    let group = { agents: [] as string[], rules: [] as {
            allow: boolean;
            path: string;
        }[] };
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.split('#')[0].trim();
        if (!line)
            continue;
        const split = line.indexOf(':');
        if (split < 0)
            continue;
        const key = line.slice(0, split).trim().toLowerCase();
        const val = line.slice(split + 1).trim();
        if (key === 'user-agent') {
            if (group.rules.length) {
                groups.push(group);
                group = { agents: [], rules: [] };
            }
            group.agents.push(val.toLowerCase());
        }
        else if ((key === 'allow' || key === 'disallow') && group.agents.length && val)
            group.rules.push({ allow: key === 'allow', path: val });
    }
    if (group.agents.length)
        groups.push(group);
    const specific = groups.filter(g => g.agents.some(a => a !== '*' && userAgent.toLowerCase().includes(a)));
    const active = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
    if (!active.length)
        return false;
    const path = new URL(url).pathname;
    let best = -1, allow = true;
    for (const g of active)
        for (const r of g.rules) {
            const esc = r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
            if (new RegExp('^' + esc).test(path) && (r.path.length > best || (r.path.length === best && r.allow))) {
                best = r.path.length;
                allow = r.allow;
            }
        }
    return allow;
}
export function validateSource(s: Source) {
    if (!SOURCE_URLS.includes(s.url) || s.lines.length < 5 || s.lines.join(' ').length < 300 || /access denied|just a moment|verify you are human/i.test(s.title))
        throw new Error(`Invalid or blocked source: ${s.id}`);
    if (['adenocarcinoma', 'adrenal', 'anal'].includes(s.id) && (!s.lines.some(l => /Program Type.*Total Cost \(USD\)/.test(l)) || !s.lines.some(l => /^Out-Patient.*\|.*\$/.test(l))))
        throw new Error(`Primary price table missing: ${s.id}`);
}
export async function refreshKnowledge(fetcher: typeof fetch = fetch, wait: (n: number) => Promise<void> = n => new Promise(r => setTimeout(r, n))): Promise<Knowledge> {
    let last = 0;
    async function get(url: string) { if (url !== 'https://www.placidway.com/robots.txt' && !SOURCE_URLS.includes(url))
        throw new Error('URL not allowlisted'); const pause = Math.max(0, 1100 - (Date.now() - last)); if (pause)
        await wait(pause); last = Date.now(); const r = await fetcher(url, { headers: { 'User-Agent': CRAWLER_UA, Accept: 'text/html,text/plain' }, redirect: 'manual', signal: AbortSignal.timeout(20000) }); if (r.status !== 200)
        throw new Error(`Source fetch failed: ${r.status}; last-good snapshot preserved`); const body = await r.text(); if (body.length > 5000000)
        throw new Error('Page too large'); return body; }
    const robots = await get('https://www.placidway.com/robots.txt');
    const sources: Source[] = [];
    for (let i = 0; i < SOURCE_URLS.length; i++) {
        const url = SOURCE_URLS[i];
        if (!robotsAllows(robots, url))
            throw new Error('robots.txt disallows ' + url);
        const html = await get(url);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
        const { title, lines } = extractHTML(html, IDS[i]);
        const source = { id: IDS[i], label: LABELS[i], url, title, lines, fetchedAt: new Date().toISOString(), sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
        validateSource(source);
        sources.push(source);
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sources)));
    return { version: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16), builtAt: new Date().toISOString(), sources };
}
