import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDatabase, call } from '../scripts/test-db.mjs';
import { EMPTY_STATE } from '../lib/types.ts';

test('PostgreSQL storage: permissions, locks, commit, isolation, retry and reset', async () => {
    const db = await createTestDatabase();
    try {
        assert.equal(await call(db, 'health'), true);
        for (const role of ['anon', 'authenticated'])
            await assert.rejects(call(db, 'history', {}, role), /permission denied/);
        assert.equal(await call(db, 'knowledge'), null);
        const s = await call(db, 'session', { new_id: 's-one', initial_state: EMPTY_STATE });
        const resumed = await call(db, 'session', { id: s.id, new_id: 'unused', initial_state: EMPTY_STATE });
        assert.equal(resumed.id, s.id);
        const leases = await Promise.all([
            call(db, 'acquire', { id: s.id, token: 'owner' }),
            call(db, 'acquire', { id: s.id, token: 'other' })
        ]);
        assert.ok(leases[0]); assert.equal(leases[1], null);
        await call(db, 'release', { id: s.id, token: 'wrong-owner' });
        assert.equal(await call(db, 'acquire', { id: s.id, token: 'intruder' }), null);
        const response = { state: { ...EMPTY_STATE, treatment: 'adrenal', turn: 1 }, status: 'unknown', intent: 'cost' };
        const args = { session_id: s.id, token: 'owner', turn_id: 's-one:request-one', request_id: 'request-one',
            question: 'question', response, gap_id: 'gap-one', redacted_question: 'redacted', version: 'v-test' };
        assert.equal(await call(db, 'commit', { ...args, token: 'wrong-owner' }), false);
        assert.deepEqual(await call(db, 'history', { id: s.id }), []);
        assert.equal(await call(db, 'commit', args), true);
        assert.deepEqual(await call(db, 'turn', { id: args.turn_id }), response);
        assert.equal((await call(db, 'gaps')).length, 1);
        assert.equal((await call(db, 'history', { id: s.id })).length, 1);
        const other = await call(db, 'session', { new_id: 's-two', initial_state: EMPTY_STATE });
        assert.deepEqual(await call(db, 'history', { id: other.id }), []);
        const next = await call(db, 'acquire', { id: s.id, token: 'next' });
        assert.equal(next.state.treatment, 'adrenal');
        // A duplicate INSERT rolls back the whole RPC, including state and gap writes.
        await assert.rejects(call(db, 'commit', { ...args, token: 'next' }), /duplicate key/);
        assert.equal((await call(db, 'gaps')).length, 1);
        assert.equal((await db.query<{ revision: number }>('select revision from pw_private.sessions where id = $1', [s.id])).rows[0].revision, 1);
        await call(db, 'reset', { id: s.id });
        assert.equal(await call(db, 'commit', { ...args, token: 'next' }), false);
        assert.deepEqual(await call(db, 'history', { id: s.id }), []);
        await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
        assert.ok(await call(db, 'session', { id: other.id }));
    } finally { await db.close(); }
});

test('PostgreSQL rate limit, refresh cooldown and snapshot replacement', async () => {
    const db = await createTestDatabase();
    try {
        for (let i = 0; i < 40; i++) assert.equal(await call(db, 'rate', { key: 'network:minute' }), true);
        assert.equal(await call(db, 'rate', { key: 'network:minute' }), false);
        assert.equal(await call(db, 'rate', { key: 'other-network:minute' }), true);
        assert.equal(await call(db, 'refresh_lease'), true);
        assert.equal(await call(db, 'refresh_lease'), false);
        const kb = { version: 'stored-version', sources: [] };
        await call(db, 'save_knowledge', { knowledge: kb });
        assert.deepEqual(await call(db, 'knowledge'), kb);
        await assert.rejects(call(db, 'arbitrary SQL'), /Unknown application operation/);
        assert.deepEqual(await call(db, 'knowledge'), kb);
    } finally { await db.close(); }
});
