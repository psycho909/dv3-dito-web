create table public.forge_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  schema_version integer not null default 1 check (schema_version = 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.forge_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  resulting_revision bigint not null check (resulting_revision > 0),
  request_hash bytea not null,
  actions jsonb not null check (jsonb_typeof(actions) = 'array'),
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id),
  unique (user_id, resulting_revision)
);
create index forge_mutations_user_time_idx on public.forge_mutations (user_id, created_at desc);
alter table public.forge_states enable row level security;
alter table public.forge_mutations enable row level security;
revoke all on public.forge_states, public.forge_mutations from public, anon, authenticated;
grant select on public.forge_states, public.forge_mutations to authenticated;
create policy own_state on public.forge_states for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_mutations on public.forge_mutations for select to authenticated
  using (user_id = (select auth.uid()));

create function public.commit_forge_state(
  p_expected_revision bigint, p_mutation_id uuid, p_state jsonb,
  p_actions jsonb, p_revive_deleted boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_deleted_at timestamptz;
  v_hash bytea;
  v_prior public.forge_mutations;
  v_action jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991
    or p_mutation_id is null or p_revive_deleted is null then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or p_state->'schemaVersion' is distinct from '1'::jsonb
    or octet_length(p_state::text) > 524288 then
    raise exception 'INVALID_STATE' using errcode = '22023';
  end if;
  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'INVALID_ACTIONS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_actions) not between 1 and 200 or octet_length(p_actions::text) > 524288
    or exists (select 1 from jsonb_array_elements(p_actions) a where
      jsonb_typeof(a) <> 'object' or a->>'type' is null or a->>'type' not in (
        'CONFIRM_FULL_DECK','RECORD_DRAW','UNDO_DRAW','REDO_DRAW','FINISH_ROUND','START_ROUND',
        'CONFIRM_CYCLE_OBSERVATION','VERIFY_REMAINING','MANUAL_RESET','CORRECT_HISTORY',
        'IMPORT_OVERWRITE','OVERWRITE_CLOUD_FROM_LOCAL')) then
    raise exception 'INVALID_ACTIONS' using errcode = '22023';
  end if;
  for v_action in select value from jsonb_array_elements(p_actions) loop
    if jsonb_typeof(v_action->'eventId') is distinct from 'string'
      or v_action->>'eventId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_action->'at') is distinct from 'string'
      or v_action->>'at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      or not (v_action ? 'payload') then
      raise exception 'INVALID_ACTIONS' using errcode = '22023';
    end if;
    begin
      perform (v_action->>'at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'INVALID_ACTIONS' using errcode = '22023';
    end;
  end loop;
  -- Lock by UID before inserting: an absent state row cannot be row-locked.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  v_hash := sha256(convert_to(jsonb_build_array(p_expected_revision,p_state,p_actions,p_revive_deleted)::text,'UTF8'));
  select * into v_prior from public.forge_mutations where user_id = v_uid and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'MUTATION_ID_REUSED' using errcode = '22023'; end if;
    return jsonb_build_object('status','COMMITTED','revision',v_prior.resulting_revision);
  end if;
  select revision, deleted_at into v_revision, v_deleted_at from public.forge_states where user_id = v_uid;
  v_revision := coalesce(v_revision,0);
  if p_expected_revision <> v_revision then
    return jsonb_build_object('status','VERSION_CONFLICT','revision',v_revision);
  end if;
  if v_deleted_at is not null and not p_revive_deleted then
    return jsonb_build_object('status','DATA_DELETED','revision',v_revision);
  end if;
  insert into public.forge_states(user_id,revision,state)
    values(v_uid,v_revision+1,p_state)
    on conflict(user_id) do update set revision=excluded.revision,state=excluded.state,
      deleted_at=null,updated_at=now();
  insert into public.forge_mutations(user_id,mutation_id,resulting_revision,request_hash,actions)
    values(v_uid,p_mutation_id,v_revision+1,v_hash,p_actions);
  return jsonb_build_object('status','COMMITTED','revision',v_revision+1);
end;
$$;

create function public.delete_forge_data(p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_revision bigint;
  v_deleted_at timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  select revision,deleted_at into v_revision,v_deleted_at from public.forge_states where user_id=v_uid;
  v_revision := coalesce(v_revision,0);
  if p_expected_revision <> v_revision then
    return jsonb_build_object('status','VERSION_CONFLICT','revision',v_revision);
  end if;
  if v_deleted_at is not null then return jsonb_build_object('status','DELETED','revision',v_revision); end if;
  delete from public.forge_mutations where user_id=v_uid;
  insert into public.forge_states(user_id,revision,state,deleted_at)
    values(v_uid,v_revision+1,'{}',now())
    on conflict(user_id) do update set revision=excluded.revision,state='{}',deleted_at=now(),updated_at=now();
  return jsonb_build_object('status','DELETED','revision',v_revision+1);
end;
$$;
revoke all on function public.commit_forge_state(bigint,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.delete_forge_data(bigint) from public,anon,authenticated;
grant execute on function public.commit_forge_state(bigint,uuid,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.delete_forge_data(bigint) to authenticated;
