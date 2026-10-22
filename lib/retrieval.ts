import type { Evidence, Knowledge } from './types.ts';
const STOP = new Set('what which how much does do the a an in is are it for of and with at from me please this that can i about tell there to as by has have was be'.split(' '));
export function terms(s: string) { return (s.toLowerCase().normalize('NFKD').match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 1 && !STOP.has(w)); }
export function chunks(kb: Knowledge): Evidence[] {
    const result: Evidence[] = [];
    for (const s of kb.sources) {
        let section = s.label;
        s.lines.forEach((text, i) => {
            if (text.length < 145 && /^(included|excluded|optional|cost of|cost breakdown|.*\?$|.*program \(|.*considerations|.*itinerary|.*profile overview)/i.test(text))
                section = text;
            result.push({ id: `${s.id}:${i}`, sourceId: s.id, text, section, score: 0 });
        });
    }
    return result;
}
/** BM25; exact medical names, numbers, and table rows stay intact. */
export function retrieve(kb: Knowledge, q: string, allowed?: string[], limit = 6): Evidence[] {
    const all = chunks(kb).filter(x => !allowed || allowed.includes(x.sourceId));
    const query = terms(q);
    if (!query.length)
        return [];
    const tokens = all.map(x => terms(x.section + ' ' + x.text));
    const avg = tokens.reduce((a, x) => a + x.length, 0) / Math.max(1, tokens.length);
    const df = new Map<string, number>();
    for (const ts of tokens)
        for (const t of new Set(ts))
            df.set(t, (df.get(t) || 0) + 1);
    return all.map((c, i) => { let score = 0; for (const term of new Set(query)) {
        const f = tokens[i].filter(t => t === term).length;
        if (!f)
            continue;
        const idf = Math.log(1 + (all.length - (df.get(term) || 0) + .5) / ((df.get(term) || 0) + .5));
        score += idf * (f * 2.2) / (f + 1.2 * (.25 + .75 * tokens[i].length / Math.max(1, avg)));
    } return { ...c, score }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
