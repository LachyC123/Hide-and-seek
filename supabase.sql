-- FALSE SAFE room storage. Run once in the Supabase SQL editor.
-- Safe to re-run, and safe to run over the older table-policy version.

create table if not exists fs_rooms (
  code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now());

create table if not exists fs_inputs (
  code text not null,
  player_id text not null,
  input jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (code, player_id));

create index if not exists fs_rooms_updated  on fs_rooms(updated_at);
create index if not exists fs_inputs_updated on fs_inputs(updated_at);

-- The tables are not reachable from a browser at all. Everything goes through the
-- functions below, and every one of them demands the room code. Nobody can list
-- rooms or read a match they were not invited to.
drop policy if exists fs_rooms_all  on fs_rooms;
drop policy if exists fs_inputs_all on fs_inputs;
alter table fs_rooms  enable row level security;
alter table fs_inputs enable row level security;
revoke all on fs_rooms  from anon, authenticated;
revoke all on fs_inputs from anon, authenticated;

create or replace function fs_put_room(p_code text, p_state jsonb) returns void
language sql security definer set search_path = public as $$
  insert into fs_rooms(code, state, updated_at) values (upper(p_code), p_state, now())
  on conflict (code) do update set state = excluded.state, updated_at = now();
$$;

create or replace function fs_get_room(p_code text) returns jsonb
language sql security definer set search_path = public as $$
  select state from fs_rooms where code = upper(p_code);
$$;

create or replace function fs_drop_room(p_code text) returns void
language sql security definer set search_path = public as $$
  delete from fs_inputs where code = upper(p_code);
  delete from fs_rooms  where code = upper(p_code);
$$;

create or replace function fs_put_input(p_code text, p_player text, p_input jsonb) returns void
language sql security definer set search_path = public as $$
  insert into fs_inputs(code, player_id, input, updated_at)
  values (upper(p_code), p_player, p_input, now())
  on conflict (code, player_id) do update set input = excluded.input, updated_at = now();
$$;

create or replace function fs_list_inputs(p_code text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(input), '[]'::jsonb) from fs_inputs where code = upper(p_code);
$$;

create or replace function fs_clear_inputs(p_code text) returns void
language sql security definer set search_path = public as $$
  delete from fs_inputs where code = upper(p_code);
$$;

create or replace function fs_drop_input(p_code text, p_player text) returns void
language sql security definer set search_path = public as $$
  delete from fs_inputs where code = upper(p_code) and player_id = p_player;
$$;

grant execute on function
  fs_put_room(text, jsonb), fs_get_room(text), fs_drop_room(text),
  fs_put_input(text, text, jsonb), fs_list_inputs(text),
  fs_clear_inputs(text), fs_drop_input(text, text)
to anon;
