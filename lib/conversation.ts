import type { State, Intent } from './types.ts';
const COUNTRIES: [
    string,
    RegExp
][] = [['Mexico', /\b(mexico|meksiko|tijuana|zapopan|guadalajara)\b|المكسيك/i], ['Turkey', /\b(turkey|turkiye|türkiye|turki|turquia|konya)\b|تركيا/i], ['Thailand', /\b(thailand|tailandia|bangkok)\b|تايلاند/i], ['Croatia', /\b(croatia|croacia|murter)\b/i], ['India', /\bindia\b|الهند/i], ['Indonesia', /\bindonesia\b/i], ['USA', /\b(usa|united states|america|amerika)\b/i], ['Germany', /\b(germany|jerman|alemania)\b/i]];
for (const name of ['Spain', 'France', 'Italy', 'Canada', 'Brazil', 'Argentina', 'Colombia', 'Costa Rica', 'South Korea', 'Japan', 'China', 'Malaysia', 'Singapore', 'Vietnam', 'Philippines', 'Australia', 'New Zealand', 'United Kingdom', 'South Africa', 'Egypt', 'Morocco', 'Tunisia', 'Hungary', 'Poland', 'Finland', 'Sweden', 'Norway', 'Portugal', 'Greece', 'Switzerland', 'Austria', 'Netherlands', 'Belgium', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Jordan', 'Georgia', 'Iran'])
    COUNTRIES.push([name, new RegExp('\\b' + name.toLowerCase() + '\\b', 'i')]);
const TREATMENTS: [
    string,
    RegExp
][] = [['adenocarcinoma', /\b(adenocarcinoma|adenokarsinoma)\b/ig], ['adrenal', /\b(adrenal|suprarrenal|suprarrenales)\b/ig], ['anal', /\banal\b/ig], ['breast', /\b(breast|payudara|mama)\b/ig], ['prostate', /\b(prostate|prostat|prostata)\b/ig], ['lung', /\b(lung|paru|pulmon)\b/ig], ['pancreatic', /\b(pancreatic|pancreas|pankreas)\b/ig], ['colorectal', /\bcolorectal\b/ig], ['colon', /\b(colon|usus besar)\b/ig], ['ozone', /\b(ozone|ozon|ozono)\b/ig], ['dental implant', /\b(dental implant|implan gigi|implante dental)\b/ig], ['alternative medicine', /\b(alternative medicine|pengobatan alternatif|medicina alternativa)\b/ig]];
export function normalize(q: string) { return q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(biaya|harga|berapa|cuanto|cuesta|precio)\b/g, 'cost').replace(/\b(termasuk|incluye|incluido|incluidos)\b/g, 'included').replace(/\b(pemulihan|recuperacion)\b/g, 'recovery').replace(/\b(murah|barato)\b/g, 'cheaper').replace(/\b(turquia)\b/g, 'turkey').replace(/كم|تكلفة|سعر/g, 'cost').replace(/المكسيك/g, ' mexico ').replace(/تركيا/g, ' turkey ').replace(/الغدة الكظرية/g, ' adrenal ').replace(/سرطان الشرج/g, ' anal ').replace(/السرطان الغدي/g, ' adenocarcinoma ').replace(/التعافي/g, 'recovery'); }
export function resolve(q: string, previous: State): {
    state: State;
    intent: Intent;
    query: string;
    injection: boolean;
} {
    const n = normalize(q);
    const rawLatin = q.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const state: State = { ...previous, countries: [...previous.countries], recentQueries: [...previous.recentQueries], turn: previous.turn + 1 };
    state.language = /[\u0600-\u06ff]/.test(q) ? 'ar' : /\b(cuanto|cuesta|precio|incluye|recuperacion|gracias|tratamiento|suprarrenal)\b/.test(rawLatin) ? 'es' : /\b(berapa|biaya|harga|apa|bagaimana|termasuk|pemulihan|terima kasih)\b/i.test(q) ? 'id' : previous.language;
    let latest = -1;
    let treatment: string | null = null;
    for (const [name, re] of TREATMENTS) {
        re.lastIndex = 0;
        for (const m of q.matchAll(re)) {
            if ((m.index || 0) > latest) {
                latest = m.index || 0;
                treatment = name;
            }
        }
    }
    // Arabic terms normalized above; plain treatment token still identifies the package.
    if (!treatment)
        for (const [name, re] of TREATMENTS) {
            re.lastIndex = 0;
            if (re.test(n)) {
                treatment = name;
                break;
            }
        }
    const explicitCountries = COUNTRIES.filter(([, re]) => re.test(n) || re.test(q)).map(([name]) => name);
    // A newly named unsupported procedure must clear a previously discussed package.
    const unsupported = Array.from(n.matchAll(/\b([a-z-]+)\s+(cancer|surgery|therapy)\b/g)).filter(m => !['alternative', 'integrative', 'holistic', 'cancer', 'the', 'this', 'my', 'current', 'your', 'medical', 'radiation', 'hormone'].includes(m[1]) && !TREATMENTS.some(([name]) => name === m[1]));
    if (unsupported.length) {
        const m = unsupported[unsupported.length - 1];
        if (!treatment)
            treatment = m[1] + ' ' + m[2];
    }
    if (/\bbreast implants?\b/.test(n))
        treatment = 'breast implants';
    if (treatment) {
        state.treatment = treatment;
        state.awaiting = null;
    }
    if (explicitCountries.length)
        state.countries = previous.awaiting === 'comparison_country' ? [...new Set([...previous.countries, ...explicitCountries])] : explicitCountries;
    const programs = Array.from(n.matchAll(/\b(out[ -]?patient|in[ -]?patient)\b/g));
    if (new Set(programs.map(m => m[0].startsWith('out') ? 'outpatient' : 'inpatient')).size > 1)
        state.program = null;
    else if (programs.length)
        state.program = programs[programs.length - 1][0].startsWith('out') ? 'outpatient' : 'inpatient';
    else if (treatment && treatment !== previous.treatment)
        state.program = null;
    const injection = /ignore.{0,50}(instruction|rule|source|previous)|system prompt|pretend.{0,35}(price|cost|doctor)|use (your|general) knowledge|browse (other|any)|make up|invent (a |the )?(price|fact)/i.test(n);
    let intent: Intent = 'general';
    if (/\b(weather|football|stock market|bitcoin|horoscope|cuaca|clima)\b/i.test(n))
        intent = 'outside';
    else if (/\b(book|reserve|schedule|appointment|booking|reservasi|janji temu)\b/.test(n) && !/what|how|process|cara/.test(n))
        intent = 'booking';
    else if (/\b(my|me|i have|my father|my mother|saya|ayah|ibu|mi diabetes)\b/.test(n) && /diabet|pregnan|safe|safety|suitable|take |stop |dose|cure|survive|kemoterapi|chemotherapy/.test(n) || /\b(is (it|this|the surgery|surgery) safe|will (it|this) cure|guarantee.{0,20}(cure|success)|stop.{0,20}chemotherapy|success rate|cure rate|effective|effectiveness|survival rate)\b/.test(n))
        intent = 'medical';
    else if (/\b(quote|quotation|penawaran|cotizacion)\b/.test(n))
        intent = 'quote';
    else if (/\b(heard|confirm|really|only|exactly|katanya)\b/.test(n) && /\$\s*\d|\b\d+\s*(usd|dollars?)\b/.test(n))
        intent = 'trick';
    else if (/\b(cheaper|compare|comparison|versus|vs|cheapest)\b/.test(n) || explicitCountries.length > 1)
        intent = 'compare';
    else if (/\b(recovery|recover|heal|healing time|return to work|back to work|downtime)\b/.test(n))
        intent = 'recovery';
    else if (/\b(exclude|excluded|not included|extra|additional cost)\b/.test(n))
        intent = 'excludes';
    else if (/\b(include|included|inclusions|package contain|package offer|what.*package)\b/.test(n))
        intent = 'includes';
    else if (/\b(duration|how long|weeks|length|stay|berapa lama)\b/.test(n))
        intent = 'duration';
    else if (/\b(cost|price|pricing|charge|fee|budget|expensive)\b/.test(n))
        intent = 'cost';
    else if (/\b(video|videos|watch|transcript)\b/.test(n))
        intent = 'videos';
    else if (/\b(where|location|address|doctor|physician|english|language|located|who|founder|contact)\b/.test(n))
        intent = 'clinic';
    else if (/^(hi|hello|hey|halo|hola|thanks|thank you|terima kasih|مرحبا|شكرا)[!. ]*$/.test(n.trim()))
        intent = 'greeting';
    else if ((explicitCountries.length || treatment || programs.length) && previous.lastIntent && ['cost', 'compare', 'includes', 'excludes', 'duration', 'recovery'].includes(previous.lastIntent))
        intent = explicitCountries.length === 1 && previous.lastIntent === 'compare' && previous.awaiting !== 'comparison_country' ? 'cost' : previous.lastIntent;
    if (injection)
        intent = 'outside';
    // A new named procedure must not inherit an old package's facts.
    if (treatment && treatment !== previous.treatment && previous.awaiting)
        state.awaiting = null;
    state.lastIntent = ['greeting', 'outside'].includes(intent) ? previous.lastIntent : intent;
    state.recentQueries = [...previous.recentQueries, q.slice(0, 300)].slice(-4);
    const query = [q, state.treatment || '', state.countries.join(' '), state.program || ''].join(' ');
    return { state, intent, query, injection };
}
