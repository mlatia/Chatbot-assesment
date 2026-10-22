/** Supabase PostgREST RPC, used only by server modules. No browser client/key. */
export async function rpc<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
    const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!base || !secret || base.includes('YOUR_PROJECT_REF'))
        throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment.');
    const url = new URL(base);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new Error('Supabase requires HTTPS outside local development.');
    const headers: Record<string, string> = { apikey: secret, 'Content-Type': 'application/json' };
    // Modern sb_secret keys go in apikey, not Authorization: Bearer (not JWTs).
    if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`;
    const response = await fetch(`${base}/rest/v1/rpc/pw_call`, {
        method: 'POST', headers, body: JSON.stringify({ p_action: action, p_args: args }),
        signal: AbortSignal.timeout(10000), cache: 'no-store'
    });
    if (!response.ok) {
        // Do not put provider payloads, URLs or credentials in public errors/logs.
        throw new Error(`Supabase ${action} failed (HTTP ${response.status}). Check SQL setup, key and project status.`);
    }
    return await response.json() as T;
}
