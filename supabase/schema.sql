-- Run the entire file once in your own Supabase project's SQL Editor.
-- Re-running updates the function and leaves existing rows intact.
begin;
create schema if not exists pw_private;
revoke all on schema pw_private from public, anon, authenticated;
grant usage on schema pw_private to service_role;

create table if not exists pw_private.sessions (
  id text primary key, state jsonb not null, revision integer not null default 0,
  locked_until bigint not null default 0, lock_token text, updated_at bigint not null
);
create table if not exists pw_private.turns (
  id text primary key, session_id text not null, request_id text not null,
  question text not null, response jsonb not null, created_at bigint not null,
  unique (session_id, request_id)
);
create index if not exists turns_session_time on pw_private.turns (session_id, created_at desc);
create table if not exists pw_private.content_gaps (
  id text primary key, question text not null, reason text not null,
  version text not null, created_at bigint not null
);
create table if not exists pw_private.leads (
  id text primary key, session_id text not null, name text not null,
  email text not null, treatment text, consent_at bigint not null
);
create table if not exists pw_private.knowledge (
  id text primary key, payload jsonb not null, updated_at bigint not null
);
create table if not exists pw_private.rate_limits (
  key text primary key, count integer not null, expires_at bigint not null
);
alter table pw_private.sessions enable row level security;
alter table pw_private.turns enable row level security;
alter table pw_private.content_gaps enable row level security;
alter table pw_private.leads enable row level security;
alter table pw_private.knowledge enable row level security;
alter table pw_private.rate_limits enable row level security;
revoke all on all tables in schema pw_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema pw_private to service_role;

-- One server-only RPC, with a fixed allowlist of operations. No dynamic SQL.
-- INVOKER uses service_role's permissions; browser roles cannot execute it.
create or replace function public.pw_call(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_result jsonb;
  v_id text;
  v_count integer;
begin
  case p_action
  when 'health' then
    perform 1 from pw_private.sessions limit 1;
    return 'true'::jsonb;
  when 'knowledge' then
    select payload into v_result from pw_private.knowledge where id = 'active';
    return v_result;
  when 'session' then
    select jsonb_build_object('id', id, 'state', state, 'revision', revision)
      into v_result from pw_private.sessions
      where id = p_args->>'id' and updated_at >= v_now - 604800000;
    if v_result is not null then return v_result; end if;
    insert into pw_private.sessions(id, state, updated_at)
      values(p_args->>'new_id', p_args->'initial_state', v_now);
    return jsonb_build_object('id', p_args->>'new_id', 'state', p_args->'initial_state', 'revision', 0);
  when 'rate' then
    delete from pw_private.rate_limits where expires_at < v_now;
    insert into pw_private.rate_limits as r(key, count, expires_at)
      values(p_args->>'key', 1, v_now + 120000)
      on conflict(key) do update set count = r.count + 1 returning count into v_count;
    return to_jsonb(v_count <= 40);
  when 'turn' then
    select response into v_result from pw_private.turns where id = p_args->>'id';
    return v_result;
  when 'acquire' then
    update pw_private.sessions set locked_until = v_now + 45000, lock_token = p_args->>'token'
      where id = p_args->>'id' and locked_until < v_now
      returning jsonb_build_object('state', state) into v_result;
    return v_result;
  when 'commit' then
    -- Lock row, validate fencing token and lease, then save all changes together.
    select id into v_id from pw_private.sessions
      where id = p_args->>'session_id' and lock_token = p_args->>'token'
        and locked_until > v_now for update;
    if v_id is null then return 'false'::jsonb; end if;
    insert into pw_private.turns(id, session_id, request_id, question, response, created_at)
      values(p_args->>'turn_id', v_id, p_args->>'request_id', p_args->>'question', p_args->'response', v_now);
    update pw_private.sessions set state = p_args->'response'->'state', revision = revision + 1,
      locked_until = 0, lock_token = null, updated_at = v_now where id = v_id;
    if p_args->'response'->>'status' = 'unknown' then
      insert into pw_private.content_gaps(id, question, reason, version, created_at)
        values(p_args->>'gap_id', p_args->>'redacted_question', p_args->'response'->>'intent', p_args->>'version', v_now);
    end if;
    return 'true'::jsonb;
  when 'release' then
    update pw_private.sessions set locked_until = 0, lock_token = null
      where id = p_args->>'id' and lock_token = p_args->>'token';
    return 'true'::jsonb;
  when 'history' then
    select coalesce(jsonb_agg(jsonb_build_object('question', question, 'response', response) order by created_at, id), '[]'::jsonb)
      into v_result from (select * from pw_private.turns where session_id = p_args->>'id' order by created_at desc, id desc limit 30) t;
    return v_result;
  when 'reset' then
    -- Row lock serializes reset with the atomic commit operation.
    perform 1 from pw_private.sessions where id = p_args->>'id' for update;
    delete from pw_private.turns where session_id = p_args->>'id';
    delete from pw_private.sessions where id = p_args->>'id';
    return 'true'::jsonb;
  when 'lead' then
    insert into pw_private.leads(id, session_id, name, email, treatment, consent_at)
      values(p_args->>'id', p_args->>'session_id', p_args->>'name', p_args->>'email', p_args->>'treatment', v_now);
    return 'true'::jsonb;
  when 'refresh_lease' then
    insert into pw_private.rate_limits as r(key, count, expires_at) values('refresh-lock', 1, v_now + 300000)
      on conflict(key) do update set expires_at = excluded.expires_at where r.expires_at < v_now returning key into v_id;
    return to_jsonb(v_id is not null);
  when 'save_knowledge' then
    insert into pw_private.knowledge(id, payload, updated_at) values('active', p_args->'knowledge', v_now)
      on conflict(id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
    return 'true'::jsonb;
  when 'gaps' then
    select coalesce(jsonb_agg(to_jsonb(g) order by created_at desc), '[]'::jsonb) into v_result
      from (select question, reason, version, created_at from pw_private.content_gaps order by created_at desc limit 100) g;
    return v_result;
  else
    raise exception 'Unknown application operation';
  end case;
end;
$$;
revoke all on function public.pw_call(text, jsonb) from public, anon, authenticated;
grant execute on function public.pw_call(text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
