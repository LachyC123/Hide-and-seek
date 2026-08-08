# FALSE SAFE

A real-world pixel-art manhunt with a hidden imposter. Players run and hide outdoors; the phone
supplies the map, the shrinking zone, the roles, the votes and the catches.

**Play:** open the deployed https link on your phone. Location and street data need https —
`file://` will not work. To play with other people, see
[Playing with other people](#playing-with-other-people) — it takes about five minutes, once.

## Setting it up on GitHub Pages

1. Create a repo, drop these files in, push to `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. That's it. Every push builds, runs the tests, and deploys only if they pass.
   Your link will be `https://<you>.github.io/<repo>/`.

## Playing with other people

Two phones can only see each other through something on the internet. FALSE SAFE uses a free
Supabase project for this — plain REST calls, no SDK, still one static file.

**You only do this once.** After that the join link carries the connection, so nobody else has
to set anything up.

1. **Make a project.** [supabase.com](https://supabase.com) → sign in with GitHub → *New project*.
   Any name, any nearby region, free plan. Wait a minute or two while it builds.
2. **Make the tables.** Left sidebar → **SQL Editor** → *New query*. Paste the block below and
   press **Run**. "Success. No rows returned" is what success looks like. Safe to re-run.
3. **Copy two values.** Left sidebar → **Project Settings** → **API**. You want the **Project
   URL** and the key labelled **anon / public** (newer projects say **publishable**).
   Never the one marked `service_role` or `secret` — that is a master key and must not go in a
   game or a link. If you paste it by mistake, reset it in Supabase.
4. **Paste them in.** In the game: home screen → **Multiplayer setup** → both boxes →
   *Save & test connection*. That does a real write-and-read against your project and tells you
   exactly what is wrong if anything is.
5. **Play.** Create a game. The lobby shows a **join link** — send it to everyone. Opening it
   sets their phone up automatically, so you are the only person who ever sees the setup screen.

<details>
<summary>The SQL for step 2</summary>

```sql
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
```

This is the same text the game shows on its Multiplayer setup screen and writes to
`supabase.sql` at build time — it lives in `MP_SQL` in `src/game.js`. Harness tests fail if the
client ever sends an operation this block has no branch for.
</details>

Steps 1-4 are already done for this repo: `MP_DEFAULT` in `src/game.js` holds the project the
deployed page uses, so players only ever type a room code. Point it at your own project by
replacing those two values and rebuilding; the setup screen still overrides it per device, and a
join link overrides both.

### What the anon key does and does not protect

The anon key is designed to ship inside client apps, and it is in the served page whether or not
it is in the repo — anyone playing can read it out of devtools. It is not a secret.

The security therefore comes from the schema, not the key. The browser cannot touch `fs_rooms`
or `fs_inputs` directly; it can only call one routine, which always takes a room code. So holding the key
gets you nothing without a code, and you cannot list rooms to go looking for one. A room's state
does contain who the imposter is, so treat the 5-character code the way you would treat the
answer: don't paste a live one anywhere public.

Two practical notes. A long match with eight players moves a few hundred MB of state, so a busy
month can eat a free project's egress. And finished rooms are never tidied up, so occasionally
run this in the SQL editor:

```sql
delete from fs_inputs where updated_at < now() - interval '1 day';
delete from fs_rooms  where updated_at < now() - interval '1 day';
```

Without any of this the game still runs — **Solo test run** works offline, and *Create game*
will tell you plainly that it has nowhere to put a room rather than handing you a code nobody
can join.

## Working on it locally

```bash
npm install
npm run serve     # http://localhost:8080 — GPS works on localhost
npm test          # 292 logic tests + 7 browser-simulated runs
```

`test/smoke7.js` is worth knowing about: it boots the real built file in two windows against a
fake Supabase and plays a networked match — join by code, roles dealt, a vote sent from the
guest and counted on the host, a mid-match reload that rejoins, and a phone that stops reporting.

Edit `src/game.js` or `src/shell.html`, never `index.html` — it's generated by `build.js`.

## Testing without friends or a 45-minute wait

During a real match the host gets **Host controls** on the map: pause the game (everyone gets a
STAND STILL screen and nothing moves — for road crossings and toilet breaks) or end it early
and go straight to results. If the host's phone dies, the other phones notice and one of them
takes the match over.

Home screen → **Solo test run** spawns five bots. The green **DEV** tab on the right edge jumps
phases, forces any of the three victories, triggers votes, moves the zone and fakes catches.
**Map & GPS check** on the home screen tells you exactly what your browser is and isn't allowing.

## Notes for Claude Code

See `CLAUDE.md`. It carries the architecture, the invariants the tests protect, and the reasons
behind decisions that look arbitrary in the code.
