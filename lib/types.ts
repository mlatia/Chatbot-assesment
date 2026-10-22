export type Source = {
    id: string;
    label: string;
    url: string;
    title: string;
    fetchedAt: string;
    sha256: string;
    lines: string[];
};
export type Knowledge = {
    version: string;
    builtAt: string;
    sources: Source[];
};
export type Intent = 'cost' | 'compare' | 'includes' | 'excludes' | 'recovery' | 'duration' | 'clinic' | 'videos' | 'general' | 'quote' | 'booking' | 'medical' | 'outside' | 'greeting' | 'trick';
export type State = {
    treatment: string | null;
    countries: string[];
    program: 'outpatient' | 'inpatient' | null;
    language: 'en' | 'id' | 'es' | 'ar';
    lastIntent: Intent | null;
    disclaimerShown: boolean;
    awaiting: 'treatment' | 'comparison_country' | null;
    turn: number;
    recentQueries: string[];
};
export type Evidence = {
    id: string;
    sourceId: string;
    text: string;
    section: string;
    score: number;
};
export type Citation = {
    id: string;
    label: string;
    url: string;
    excerpt: string;
    fetchedAt: string;
};
export type Reply = {
    answer: string;
    status: 'answered' | 'clarification' | 'unknown' | 'declined' | 'quote' | 'medical';
    intent: Intent;
    citations: Citation[];
    state: State;
    disclaimer?: string;
    quoteUrl?: string;
    version: string;
    trace: string[];
    engine: string;
    evidenceIds: string[];
};
export const EMPTY_STATE: State = { treatment: null, countries: [], program: null, language: 'en', lastIntent: null, disclaimerShown: false, awaiting: null, turn: 0, recentQueries: [] };
