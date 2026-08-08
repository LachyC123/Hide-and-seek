-- FALSE SAFE room storage. Paste all of this into the Supabase SQL editor and Run.
-- Safe to run more than once.

create table if not exists fs_rooms (
  code text primary key, state jsonb not null,
  updated_at timestamptz not null default now());

create table if not exists fs_inputs (
  code text not null, player_id text not null, input jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (code, player_id));

-- A browser can never touch these tables. The one routine below is the only way in,
-- and it always needs the room code -- so nobody can list rooms or read a match
-- they were not invited to.
alter table fs_rooms  enable row level security;
alter table fs_inputs enable row level security;
revoke all on fs_rooms, fs_inputs from anon, authenticated;
drop function if exists fs_put_room(text,jsonb), fs_get_room(text), fs_drop_room(text),
  fs_put_input(text,text,jsonb), fs_list_inputs(text), fs_clear_inputs(text),
  fs_drop_input(text,text);

create or replace function fs_rpc(op text, room text, pid text default '', body jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(room);
begin
  if    op = 'put_room'     then insert into fs_rooms(code, state, updated_at)
                                 values (c, body, now()) on conflict (code)
                                 do update set state = body, updated_at = now();
  elsif op = 'get_room'     then return (select state from fs_rooms where code = c);
  elsif op = 'drop_room'    then delete from fs_inputs where code = c;
                                delete from fs_rooms  where code = c;
  elsif op = 'put_input'    then insert into fs_inputs(code, player_id, input, updated_at)
                                 values (c, pid, body, now()) on conflict (code, player_id)
                                 do update set input = body, updated_at = now();
  elsif op = 'list_inputs'  then return (select coalesce(jsonb_agg(input), '[]'::jsonb)
                                        from fs_inputs where code = c);
  elsif op = 'clear_inputs' then delete from fs_inputs where code = c;
  elsif op = 'drop_input'   then delete from fs_inputs where code = c and player_id = pid;
  end if;
  return null;
end $$;

grant execute on function fs_rpc(text, text, text, jsonb) to anon;
