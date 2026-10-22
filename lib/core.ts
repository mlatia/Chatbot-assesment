import { EMPTY_STATE } from './types.ts';
import type { Knowledge, State, Reply, Evidence, Source } from './types.ts';
import { resolve, normalize } from './conversation.ts';
import { chunks, retrieve, terms } from './retrieval.ts';
import { QUOTE_URL, SOURCE_URLS } from './config.ts';
const PKG = new Set(['adenocarcinoma', 'adrenal', 'anal']);
const NO = 'I could not find that information in the seven approved pages. Please contact PlacidWay for a free, personalized quote.';
const LABELS: Record<string, string> = { adenocarcinoma: 'adenocarcinoma cancer', adrenal: 'adrenal cancer', anal: 'anal cancer', breast: 'breast cancer', prostate: 'prostate cancer', lung: 'lung cancer', pancreatic: 'pancreatic cancer', colon: 'colon cancer', colorectal: 'colorectal cancer', ozone: 'ozone therapy', 'alternative medicine': 'alternative medicine' };
const disclaimer = 'These are website descriptions, not a medical recommendation or a guarantee of results. Discuss treatment options with your licensed oncologist.';
function lang(s: State, en: string, id: string, es: string, ar: string) { return s.language === 'id' ? id : s.language === 'es' ? es : s.language === 'ar' ? ar : en; }
function unknown(s: State) { return lang(s, NO, 'Informasi tersebut tidak ditemukan dalam tujuh halaman sumber. Hubungi PlacidWay untuk meminta penawaran gratis sesuai kebutuhan Anda.', 'No encontré esa información en las siete páginas autorizadas. Contacta con PlacidWay para solicitar un presupuesto personalizado gratuito.', 'لم أجد هذه المعلومات في الصفحات السبع المعتمدة. تواصل مع PlacidWay للحصول على عرض سعر شخصي مجاني.'); }
function section(source: Source, re: RegExp) { const i = source.lines.findIndex(x => re.test(x)); if (i < 0)
    return []; const out: number[] = []; for (let j = i + 1; j < source.lines.length; j++) {
    if (/^(Included in|Optional Specialized|Excluded Services|The ITC Philosophy|Who Should|3-Week|FAQs|Start Your)/i.test(source.lines[j]))
        break;
    out.push(j);
} return out; }
export function answerQuestion(kb: Knowledge, q: string, prior: State = EMPTY_STATE): Reply {
    if (!q.trim() || q.length > 2000)
        throw new Error('Question must contain 1–2000 characters.');
    if (kb.sources.length !== 7 || new Set(kb.sources.map(x => x.url)).size !== 7 || kb.sources.some(x => !SOURCE_URLS.includes(x.url)))
        throw new Error('Knowledge base must contain exactly the seven approved URLs.');
    const { state, intent, query, injection } = resolve(q, prior);
    const trace = ['resolve_context', 'route_intent'];
    const all = chunks(kb);
    let used: Evidence[] = [];
    const src = (id: string) => kb.sources.find(s => s.id === id)!;
    const take = (id: string, indices: number[]) => indices.map(i => all.find(c => c.id === `${id}:${i}`)).filter((x): x is Evidence => !!x);
    const relevant = PKG.has(state.treatment || '') ? state.treatment! : 'clinic';
    function finish(answer: string, status: Reply['status'] = 'answered', evidence: Evidence[] = used): Reply {
        const safe = evidence.filter(x => src(x.sourceId)?.lines.includes(x.text));
        const sourceIds = [...new Set(safe.map(x => x.sourceId))];
        if (!sourceIds.length && status !== 'answered')
            sourceIds.push(relevant);
        const citations = sourceIds.map(id => { const s = src(id); return { id, label: s.label, url: s.url, excerpt: safe.filter(e => e.sourceId === id).map(e => e.text).join(' ').slice(0, 500), fetchedAt: s.fetchedAt }; });
        const show = !state.disclaimerShown && status === 'answered' && intent !== 'greeting' && intent !== 'videos';
        if (show)
            state.disclaimerShown = true;
        return { answer, status, intent, citations, state, disclaimer: show ? lang(state, disclaimer, 'Ini deskripsi website, bukan rekomendasi medis atau jaminan hasil. Diskusikan pilihan terapi dengan onkolog berlisensi Anda.', 'Son descripciones del sitio web, no recomendaciones médicas ni garantías de resultados. Consulta las opciones con un oncólogo autorizado.', 'هذه أوصاف الموقع وليست توصيات طبية أو ضماناً للنتائج. ناقش الخيارات مع اختصاصي أورام مرخص.') : undefined, quoteUrl: ['unknown', 'quote'].includes(status) || intent === 'booking' ? QUOTE_URL : undefined, version: kb.version, trace: [...trace, 'validate_source_ids', 'compose'], engine: 'extractive', evidenceIds: safe.map(e => e.id) };
    }
    if (intent === 'greeting')
        return finish(lang(state, 'Hello! Ask about ITC package prices, what is included, clinic details, or information on the seven approved PlacidWay pages.', 'Halo! Silakan tanyakan harga paket ITC, isi paket, detail klinik, atau informasi dari tujuh halaman PlacidWay.', '¡Hola! Pregunta por precios de ITC, inclusiones del paquete o información de las siete páginas autorizadas.', 'مرحباً! اسأل عن أسعار برامج ITC وما تتضمنه أو معلومات العيادة في الصفحات المعتمدة.'), 'answered', take('clinic', [0]));
    if (intent === 'outside')
        return finish(lang(state, injection ? 'I can answer only using the seven approved PlacidWay pages. I cannot follow instructions to invent facts, reveal private instructions, or use other websites.' : 'I cover the approved PlacidWay treatment and clinic pages. Weather and other unrelated topics are outside this knowledge base.', 'Saya hanya menjawab berdasarkan tujuh halaman PlacidWay yang diizinkan. Pertanyaan atau instruksi di luar cakupan tersebut tidak dapat saya penuhi.', 'Solo puedo responder con las siete páginas autorizadas de PlacidWay. Esa solicitud está fuera de su alcance.', 'يمكنني الإجابة فقط من صفحات PlacidWay السبع المعتمدة. هذا الطلب خارج نطاقها.'), 'declined');
    if (intent === 'booking')
        return finish(lang(state, 'I cannot book appointments or check live availability. Use the PlacidWay free-quote/contact form to ask about your preferred date; an appointment is not confirmed by this chat.', 'Saya tidak dapat membuat janji atau memeriksa jadwal langsung. Gunakan formulir penawaran/kontak PlacidWay untuk menanyakan tanggal yang Anda inginkan. Chat ini tidak mengonfirmasi janji.', 'No puedo reservar citas ni consultar disponibilidad en tiempo real. Usa el formulario de PlacidWay para consultar la fecha; este chat no confirma una cita.', 'لا يمكنني حجز المواعيد أو التحقق من التوفر المباشر. استخدم نموذج PlacidWay للاستفسار عن التاريخ المطلوب؛ هذه المحادثة لا تؤكد حجزاً.'), 'quote');
    if (intent === 'quote')
        return finish(lang(state, 'You can request a free, personalized quote from PlacidWay using the link below. If you choose the contact form here, your name and email are saved only in this assessment demo; they are not sent to PlacidWay.', 'Anda dapat meminta penawaran gratis melalui tautan resmi PlacidWay di bawah. Jika memakai formulir di sini, nama dan email hanya disimpan dalam demo asesmen ini dan tidak dikirim ke PlacidWay.', 'Solicita un presupuesto gratuito con el enlace oficial. El formulario de este sitio solo guarda tus datos en esta demostración; no los envía a PlacidWay.', 'اطلب عرض سعر مجاني عبر الرابط الرسمي. نموذج هذا الموقع يحفظ بياناتك في العرض التجريبي فقط ولا يرسلها إلى PlacidWay.'), 'quote');
    if (intent === 'medical') {
        const risks = retrieve(kb, 'risks avoid delaying standard treatments consult oncologist safety', ['clinic'], 2);
        state.disclaimerShown = true;
        return finish(lang(state, 'I cannot assess whether a treatment is safe or suitable for your diabetes or other personal health conditions, diagnose you, or recommend changing medication or cancer treatment. Please discuss this with your treating doctor or oncologist. Website descriptions and patient stories do not establish effectiveness or guarantee a cure.', 'Saya tidak dapat menilai keamanan atau kecocokan terapi untuk diabetes maupun kondisi pribadi Anda, mendiagnosis, atau menyarankan perubahan obat/pengobatan kanker. Diskusikan dengan dokter atau onkolog yang menangani Anda. Deskripsi website dan kisah pasien tidak membuktikan efektivitas atau menjamin kesembuhan.', 'No puedo evaluar la seguridad o idoneidad de un tratamiento para tu diabetes u otras condiciones, diagnosticarte ni recomendar cambios de medicación. Consulta a tu médico u oncólogo. Los testimonios no demuestran eficacia ni garantizan una cura.', 'لا يمكنني تقييم أمان العلاج أو ملاءمته لحالتك أو السكري، أو التشخيص أو تغيير الأدوية. استشر طبيبك أو اختصاصي الأورام. أوصاف الموقع وقصص المرضى لا تثبت الفعالية ولا تضمن الشفاء.'), 'medical', risks);
    }
    trace.push('retrieve_approved_sources');
    if (['cost', 'compare', 'includes', 'excludes', 'duration', 'recovery', 'trick'].includes(intent) && !state.treatment) {
        state.awaiting = 'treatment';
        return finish(lang(state, 'Which treatment or package do you mean—for example, adrenal cancer, anal cancer, adenocarcinoma, or ozone therapy? Please also specify the country if relevant.', 'Terapi atau paket apa yang Anda maksud—misalnya kanker adrenal, kanker anal, adenokarsinoma, atau terapi ozon? Sebutkan juga negaranya bila relevan.', '¿Qué tratamiento o paquete quieres consultar? Por ejemplo, cáncer suprarrenal, cáncer anal, adenocarcinoma u ozonoterapia. Indica también el país.', 'ما العلاج أو البرنامج الذي تقصده؟ مثلاً سرطان الغدة الكظرية أو الشرج أو السرطان الغدي أو الأوزون. حدد البلد أيضاً.'), 'clarification');
    }
    const treatment = state.treatment || '';
    const label = LABELS[treatment] || treatment;
    const nonMexico = state.countries.filter(c => c !== 'Mexico');
    if (intent === 'compare' && state.countries.length < 2 && !(/in[ -]?patient/i.test(q) && /out[ -]?patient/i.test(q))) {
        state.awaiting = 'comparison_country';
        return finish('Which two countries would you like to compare for ' + label + '? I will compare only matching treatment information available in the approved pages.', 'clarification');
    }
    const optionalPatterns = [/\b(lak|lymphocytes activated killer)\b/i, /\bspecific killer cell antibody\b/i, /\bethanol (tumor )?ablation\b/i, /\b(mca|mononuclear cell activation)\b/i, /\bintratumoral immunotherapy\b/i];
    const optional = optionalPatterns.find(re => re.test(q));
    if (optional && ['cost', 'trick', 'includes', 'excludes'].includes(intent)) {
        const explicit = [...PKG].filter(id => new RegExp('\\b' + id + '\\b', 'i').test(q));
        const ids = explicit.length ? explicit : PKG.has(prior.treatment || '') ? [prior.treatment!] : [...PKG];
        const evidence = ids.flatMap(id => take(id, src(id).lines.map((l, i) => optional.test(l) && /\$/.test(l) ? i : -1).filter(i => i >= 0))).filter(e => !/^\d+\./.test(e.text));
        if (nonMexico.length)
            return finish(unknown(state), 'unknown', evidence.slice(0, 1));
        if (evidence.length)
            return finish((intent === 'trick' ? 'I cannot confirm a quoted amount without matching it to the listed fee.\n\n' : '') + 'The approved ITC package page(s) list this as an optional procedure at additional cost:\n\n' + [...new Set(evidence.map(e => '• ' + e.text))].join('\n') + '\n\nThese are add-on fees, not the base program price. Confirm eligibility, the applicable program, and the final quote with the clinic.', 'answered', evidence);
    }
    if (PKG.has(treatment)) {
        if (nonMexico.length && ['includes', 'excludes', 'duration', 'recovery'].includes(intent))
            return finish('The available ' + label + ' package page covers Tijuana, Mexico. I do not have the requested package information for ' + nonMexico.join(' or ') + '. ' + unknown(state), 'unknown', take(treatment, [0]));
        const s = src(treatment);
        const tableHead = s.lines.findIndex(x => /Program Type.*Total Cost \(USD\)/.test(x));
        const priceRows = tableHead >= 0 ? [tableHead + 1, tableHead + 2].filter(i => /^(Out-Patient|In-Patient).*\$[\d,]+/.test(s.lines[i] || '')) : [];
        const priceEvidence = take(treatment, [tableHead, ...priceRows]);
        const rows = priceRows.filter(i => !state.program || (state.program === 'outpatient' ? /^Out-Patient/ : /^In-Patient/).test(s.lines[i]));
        function prices() { return rows.map(i => { const cells = s.lines[i].split('|').map(x => x.trim()); return `• ${cells[0]}: USD ${cells[2].replace('$', '')} — ${cells[1]}`; }).join('\n'); }
        if ((intent === 'cost' || intent === 'trick' || intent === 'compare') && nonMexico.length) {
            const mention = lang(state, `The approved ${label} package page covers Tijuana, Mexico. I do not have a comparable ${label} price for ${nonMexico.join(' or ')} in the approved pages.`, `Halaman paket ${label} yang tersedia mencakup Tijuana, Meksiko. Tidak ada harga ${label} yang sebanding untuk ${nonMexico.join(' atau ')} dalam sumber.`, `La página autorizada del paquete de ${label} corresponde a Tijuana, México. No tengo un precio comparable para ${nonMexico.join(' o ')}.`, `تغطي صفحة البرنامج المعتمدة تيخوانا بالمكسيك. لا يتوفر سعر مماثل للعلاج في ${nonMexico.join(' أو ')}.`);
            return finish(mention + (intent === 'compare' ? '\n\nListed Mexico programs:\n' + prices() : '') + '\n\n' + unknown(state), 'unknown', priceEvidence);
        }
        if (['cost', 'trick', 'compare'].includes(intent)) {
            if (!rows.length)
                return finish(unknown(state), 'unknown');
            const supplied = Array.from(q.matchAll(/\$\s*([\d,]+(?:\.\d+)?)|\b([\d,]+(?:\.\d+)?)\s*(?:usd|dollars?)\b/gi)).map(m => Number((m[1] || m[2]).replaceAll(',', '')));
            const actual = rows.map(i => Number((s.lines[i].match(/\$([\d,]+)/) || [])[1]?.replaceAll(',', '')));
            const prefix = intent === 'trick' ? (supplied.length && supplied.every(x => actual.includes(x)) ? 'That amount appears among the listed program prices.\n\n' : 'I cannot confirm that amount as the package price.\n\n') : '';
            const intro = lang(state, `The PlacidWay ${label} package page lists these ITC programs in Tijuana, Mexico:`, `Halaman paket ${label} PlacidWay mencantumkan program ITC berikut di Tijuana, Meksiko:`, `La página de PlacidWay para ${label} indica estos programas de ITC en Tijuana, México:`, `تسرد صفحة PlacidWay البرامج التالية في ITC بتيخوانا، المكسيك:`);
            return finish(prefix + intro + '\n\n' + prices() + '\n\n' + lang(state, 'These are listed program prices, not an all-inclusive trip total. Optional procedures and excluded services cost extra. Confirm the current, case-specific price with PlacidWay.', 'Ini harga program yang tercantum, bukan total seluruh perjalanan. Prosedur opsional dan layanan yang dikecualikan dikenakan biaya tambahan. Konfirmasikan harga terbaru sesuai kasus dengan PlacidWay.', 'Son precios de los programas, no el total del viaje. Los procedimientos opcionales y servicios excluidos cuestan aparte. Confirma el precio actual y personalizado con PlacidWay.', 'هذه أسعار البرامج المدرجة وليست التكلفة الكاملة للسفر. الخدمات المستثناة والإجراءات الاختيارية بتكلفة إضافية. أكد السعر الشخصي الحالي مع PlacidWay.'), 'answered', [...priceEvidence, ...take(treatment, [s.lines.findIndex(x => /^Optional Specialized/.test(x)), s.lines.findIndex(x => /^Excluded Services/.test(x))])]);
        }
        if (intent === 'recovery') {
            const recoveryIndices = s.lines.map((x, i) => /^Recovery (?:time|period|duration)\s*:/i.test(x) ? i : -1).filter(i => i >= 0);
            if (recoveryIndices.length)
                return finish('The package page states:\n\n' + recoveryIndices.map(i => '• ' + s.lines[i]).join('\n') + '\n\nAsk your treating clinician about the expected recovery for your individual case.', 'answered', take(treatment, recoveryIndices));
            const ids = s.lines.map((x, i) => /^Follow-up Care:|^(Out-Patient|In-Patient).*Weeks/.test(x) ? i : -1).filter(i => i >= 0);
            const ev = take(treatment, ids);
            const intro = lang(state, `The approved ${label} package page does not specify a recovery-time estimate. The entries below describe program duration and follow-up; neither is a recovery-time estimate.`, `Halaman paket ${label} tidak mencantumkan perkiraan waktu pemulihan. Entri berikut menjelaskan durasi program dan tindak lanjut; keduanya bukan perkiraan pemulihan.`, `La página no especifica un tiempo de recuperación. Las siguientes entradas describen el programa y el seguimiento, no una estimación de recuperación.`, `لا تحدد صفحة البرنامج مدة للتعافي. البيانات التالية تصف مدة البرنامج والمتابعة وليست تقديراً للتعافي.`);
            return finish(intro + '\n\n' + ev.map(e => '• ' + e.text).join('\n') + '\n\n' + unknown(state), 'unknown', ev);
        }
        if (intent === 'duration') {
            const followup = s.lines.map((x, i) => /^Follow-up Care:/.test(x) ? i : -1).filter(i => i >= 0);
            return finish('The package page lists these program durations:\n\n' + priceRows.map(i => { const cells = s.lines[i].split('|').map(x => x.trim()); return '• ' + cells[0] + ': ' + cells[1]; }).join('\n') + '\n\n' + [...new Set(followup.map(i => s.lines[i]))].join('\n') + '\n\nThese are program and follow-up timings, not recovery estimates.', 'answered', [...priceEvidence, ...take(treatment, followup)]);
        }
        if (intent === 'includes' || intent === 'excludes') {
            const indices = intent === 'excludes' ? section(s, /^Excluded Services/) : state.program ? section(s, state.program === 'outpatient' ? /^Included in the Out-Patient/ : /^Included in the In-Patient/) : [...section(s, /^Included in the Out-Patient/), ...section(s, /^Included in the In-Patient/)];
            if (!indices.length)
                return finish(unknown(state), 'unknown');
            const ev = take(treatment, indices);
            const heading = intent === 'excludes' ? 'The package page lists these exclusions / extra costs:' : `According to the ${label} package page${state.program ? ' (' + state.program + ')' : ''}:`;
            return finish(heading + '\n\n' + ev.map(e => '• ' + e.text).join('\n') + '\n\nConfirm the final inclusions and exclusions with PlacidWay before booking.', 'answered', ev);
        }
    }
    if (intent === 'videos') {
        const ev = retrieve(kb, query, ['videos'], 4).filter(e => !e.text.startsWith('Medical Center Videos:'));
        if (!ev.length)
            return finish(unknown(state), 'unknown');
        return finish('The approved ITC video page lists these titles:\n\n' + ev.map(e => '• ' + e.text).join('\n') + '\n\nThe page provides video listings, not transcripts. I cannot infer clinical facts or outcomes from titles or patient stories.', 'answered', ev);
    }
    if (['cost', 'trick', 'compare'].includes(intent)) {
        const p = src('prices');
        const aliases: Record<string, string> = { breast: 'Breast Cancer', prostate: 'Prostate Cancer', lung: 'Lung Cancer', pancreatic: 'Pancreatic Cancer', colorectal: 'Colorectal Cancer', colon: 'Colon Cancer' };
        if (aliases[treatment] && !nonMexico.length) {
            const i = p.lines.findIndex(x => x.startsWith(aliases[treatment] + ' |'));
            if (i >= 0) {
                return finish(`The ITC price list in Tijuana, Mexico lists:\n\n${p.lines[i]}\n\nCurrency: USD (as stated in the table heading). This row does not specify a complete package, program duration, or all inclusions. Request a personalized quote to confirm the applicable price.`, 'answered', take('prices', [p.lines.findIndex(x => /Price in USD/.test(x)), i]));
            }
        }
        if (treatment === 'ozone') {
            const s = src('comparison');
            const indices = s.lines.map((l, i) => /\| Ozone Therapy, Alternative Medicine/.test(l) ? i : -1).filter(i => i >= 0);
            const selected = indices.filter(i => !state.countries.length || state.countries.some(c => s.lines[i].includes(c)));
            if (!selected.length || state.countries.some(c => !selected.some(i => s.lines[i].includes(c))))
                return finish('A matching clinic listing for each requested country was not found. ' + unknown(state), 'unknown', take('comparison', selected));
            return finish('The alternative-medicine comparison page lists:\n\n' + selected.map(i => '• ' + s.lines[i]).join('\n') + '\n\nThe page labels its pricing in USD. These are individual clinic listings. Equivalent session counts and package inclusions are not established in the visible table, so these amounts do not prove a like-for-like or country-wide price comparison. Ask for matching quotes.', 'answered', take('comparison', [...selected, ...s.lines.map((x, i) => /Average Price \(USD\)|Price Range \(USD\)/.test(x) ? i : -1).filter(i => i >= 0)]));
        }
        if (treatment === 'alternative medicine' && !state.countries.length) {
            const ev = retrieve(kb, 'Alternative Medicine costs average price range estimates', ['comparison'], 3);
            return finish('For alternative medicine broadly, the comparison page states:\n\n' + ev.map(x => '• ' + x.text).join('\n') + '\n\nThese are broad category estimates, not a quote for a specific cancer treatment, procedure, clinic, or country.', 'answered', ev);
        }
        return finish(unknown(state), 'unknown', retrieve(kb, query, [relevant], 1));
    }
    if (['includes', 'excludes', 'recovery', 'duration'].includes(intent))
        return finish(unknown(state), 'unknown', retrieve(kb, query, [relevant], 1));
    // Open-ended retrieval is limited to neutral logistical/descriptive facts.
    const allowed = intent === 'clinic' ? ['clinic'] : PKG.has(treatment) ? [treatment] : ['clinic', 'prices', 'comparison'];
    const ev = retrieve(kb, query, allowed, 8).filter(e => !/(cure|remission|non-toxic|non toxic|safe|safety|healing|success|re-train|attack.*cancer|cancer.*attack|malignant|guarantee|toxin|detoxification|stem cell)/i.test(e.text));
    const significant = terms(normalize(q));
    const exact = ev.filter(e => significant.some(t => e.text.toLowerCase().includes(t)));
    if (!exact.length)
        return finish(unknown(state), 'unknown');
    used = exact.slice(0, 3);
    return finish('The approved page states:\n\n' + used.map(e => '• ' + e.text).join('\n') + '\n\nThis is an attributed website description. Contact PlacidWay for details specific to your situation.', 'answered');
}
