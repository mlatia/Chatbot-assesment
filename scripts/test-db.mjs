import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
/** Test-only local PostgreSQL engine, never used by deployed code. */
export async function createTestDatabase() {
    const db = new PGlite();
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    return db;
}
export function call(db, action, args = {}, role = 'service_role') {
    if (!['service_role', 'anon', 'authenticated'].includes(role)) throw new Error('Invalid test role');
    return db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        const { rows } = await tx.query('select public.pw_call($1, $2::jsonb) as value', [action, JSON.stringify(args)]);
        return rows[0].value;
    });
}
