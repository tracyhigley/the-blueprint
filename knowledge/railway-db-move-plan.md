# Moving The Blueprint's database from Supabase to Railway — plan

Written 2026-11-03. **Nothing in here has been done to the live Blueprint.** No Railway service exists yet, no Vercel or Supabase setting was touched, nothing was written to the live database. The only thing done so far is a read-only backup (section 6).

## 1. The short version

- Supabase gives The Blueprint **two** things: the **data** (14 tables) and the **login**. It does not give us file storage, live updates, or background functions — checked, none are used.
- Both can move to Railway. The data move is easy (about 2,500 rows, 14 MB). The login is the bigger piece of work because the whole app asks Supabase "who is signed in?" on every page.
- **Money:** Supabase costs **$0 today** (free plan). Railway will cost **about $2–5 a month more** than you pay now, on top of the $5 Hobby plan the hub already has. So this move buys "one provider, one bill", not savings.
- **Downtime:** about 20–30 minutes, in the evening, once.
- **Undo:** Supabase stays exactly as it is, untouched, until you say to remove it.
- Rough size of the job: 3–4 working sessions of coding and rehearsal, then a 30-minute cut-over with you.

## 2. What Supabase gives The Blueprint today

| Piece | Used? | What it does for us | How many places in the code |
|---|---|---|---|
| Database (Postgres 17) | Yes | 14 tables: items, projects, settings, captures, day plans, future tasks, routine days, calendar weeks/days, members, Google Calendar link. 14 MB. | ~170 queries in 25 files |
| Login (Supabase Auth) | Yes | Email + password, "magic link" email, forgot-password email, invite-a-member email, the "who am I" check in `proxy.ts` that guards every page. 2 accounts. | ~19 calls |
| Row-level security (RLS) | Yes — important | The database itself refuses to show one blueprint's rows to a non-member. This is the app's main safety net, not just a convenience. | every table; 4 helper functions |
| File storage | **No** | 0 buckets, 0 files | — |
| Live updates (realtime) | **No** | no tables published | — |
| Edge functions | **No** | none deployed | — |
| Scheduled jobs inside Supabase | **No** | The daily job runs on Vercel (`vercel.json`) and calls the app | — |
| Secrets vault | **No** | 0 secrets (the Google Calendar token is an ordinary table) | — |
| Extensions | Only `pgcrypto` and `uuid-ossp` — both ship with Railway's Postgres | | |

Where the app talks to Supabase:
- **Signed-in user's queries** (use the user's login, RLS decides what they see): all pages and actions.
- **"Admin" queries** (skip RLS): the iPhone/bookmarklet capture (`/api/capture`), the daily job (`/api/cron/calendar-to-drop`), the Future Tasks API, **the hub's three routes** (`/api/hub-todos`, `/api/hub-todos/close`, `GET /api/hub-todos`), and the Members page (invite/role/remove).

## 3. What replaces each piece

| Today (Supabase) | After (Railway) |
|---|---|
| Postgres database | A new **Postgres service on Railway**, same version (17). Same tables, same migrations 0001–0026, same ids. |
| RLS rules and `auth.uid()` | **Kept.** The app connects as a limited database user (not the owner), and at the start of each request tells the database "this request is user X". A small replacement for `auth.uid()` reads that. All existing RLS rules and the 4 helper functions then work unchanged — so the safety net stays in the database, not in "remember to filter" code. |
| Supabase user table (`auth.users`) | A small `auth.users` table of the same shape in the new database (keeps your user ids, so every row's owner stays correct and the existing links between tables keep working). |
| Email + password login | Our own: password check + a signed, secure cookie. Needs one small library to hash passwords (a new dependency — your call, section 9). |
| Magic link / forgot password / invite emails | Needs a way to send email. **Decision for you** (section 9): a small email service (needs an account and a secret key from you), or drop those three and use simpler options (see below). |
| `proxy.ts` "who is signed in" | Reads our cookie instead of asking Supabase. Same redirects to `/login` and `/onboarding`. |
| Query code (`sb.from("items").select()…`) | A thin layer with the **same shape** as the Supabase calls but talking straight to Postgres, so the ~170 call sites barely change. Rewriting each one by hand is the alternative; it is bigger and riskier. |
| Hub routes, capture, cron | Switched to the same layer. **Same URLs, same bearer tokens, same replies** — the hub changes nothing. |
| File storage / realtime / functions | Nothing to replace. |

Simpler email choices if you don't want a new email service for 2 people: (a) password reset by me running a one-line script when you ask, (b) invites show a link you send yourself, (c) drop the magic link. Your call.

## 4. Code changes (all on a branch, nothing live)

1. Add a Postgres connection (`pg` library — needed, new dependency) with the per-request "who am I" setting.
2. New `lib/db/` layer that offers the same calls the code uses today (`from / select / insert / update / upsert / delete / eq / is / in / order / limit / single`, plus the two "join" selects `blueprint:blueprints(id,name)`).
3. Replace `lib/supabase/server.ts`, `client.ts` and `proxy.ts` auth with our own session; replace the login, magic, reset, callback and sign-out pages and the Members invite.
4. `lib/hub-todos-api.ts`, `hub-todos-db.ts`, capture, cron, future-tasks routes switch to the new layer. The existing hub tests (`lib/hub-todos.test.ts`) must keep passing.
5. A new migration `0027` that creates the small `auth` schema, the "who am I" function and the limited database user.
6. Tests: run the existing `npm test`, add tests for the query layer and for "a non-member sees nothing".
7. Environment variables change at cut-over only (listed in section 7 — I'll ask before touching any).

The plan sits on branch `plan/railway-db-move`; the code work would go on `try/railway-db`; `main` and the live site are not affected until you say "ship it".

## 5. Rehearsal first (no effect on the live site)

1. **You say yes** to creating a Railway Postgres service for the rehearsal (adds a little to the Railway bill — a few cents for a day).
2. I run migrations 0001–0027 on it and load the backup into it.
3. I compare row counts table by table with Supabase (section 8).
4. I run the branch against the rehearsal database on my computer, and (with your OK) as a **Vercel preview** URL, not the live address. We click through Today, Field Notes, Counter, ATM, Projects, Future Tasks, Routine, Settings, sign-in and sign-out with your account.
5. I send a **test** to-do through the three hub routes against the rehearsal copy and check create / update / close / list give the same replies as today.
6. I time the load so the real cut-over has a known length. Expect under 5 minutes of copying.
7. Repeat until it's boring. Then the same rehearsal database is wiped and reused (or kept as the real one — see below).

## 6. Backup (done)

Taken 2026-11-03, read-only, from the live Supabase using the app's own admin access. Saved in **`~/Documents/Blueprint-backups/supabase-2026-11-03/`** — outside the repo, folder locked to your user only.

- One JSON file per table (14), the list of 2 users (emails and ids — **not** passwords), plus a copy of all the migration files and `row-counts.json`.
- Row counts matched live Supabase exactly: items 1,020 · captures 785 · day_inputs 96 · projects 68 · future_tasks 60 · routine_days 6 · calendar_week_assignments 27 · calendar_day_overrides 244 · calendar_drop_imports 122 · settings 1 · blueprints 1 · blueprint_members 2 · google_calendar_connections 1 · google_calendar_secrets 1 · users 2.
- **This folder holds your Google Calendar token and your capture token. Treat it like a password: don't put it in git, email or a shared drive.**
- Passwords cannot be exported this way (Supabase keeps only a scrambled version in a place I can't read without the database password). So: **both users set a new password at first sign-in** after the move. That avoids needing the database password at all.
- Supabase's free plan keeps **no automatic backups of its own**, so this file is currently the only backup. I'd redo it right before the cut-over.

## 7. Cut-over (a short window, evening)

Needs you present for the yes/no steps. Times are Eastern; pick a quiet evening, e.g. start 9:00 PM, done by 9:30 PM.

1. Last rehearsal passes; fresh backup taken. (No downtime yet.)
2. **Your yes.** I put the live site into a "back in a few minutes" page (this is where the downtime starts; the hub's to-do posts get a polite "try again" and the hub retries — I will check how the hub handles that before this night).
3. Final copy: export from Supabase, load into Railway Postgres (a rehearsed, timed script).
4. Check row counts per table match exactly (section 8). If anything is off → stop and go to Undo.
5. **Your yes.** Change the app's settings in Vercel to point at Railway (database address, the new login secret; the old Supabase keys stay stored but unused) and deploy the branch.
6. Test with you: sign in (set new password), open Today, add a field note, tick a to-do, send a hub to-do from the hub, check the home-page pointer, Google Calendar, the iPhone capture shortcut.
7. Reopen the site. Downtime ends. Expected total: 20–30 minutes.
8. Watch for a day. Daily 9:00 job (`0 9 * * *`) runs once against Railway; I check its result.

Settings that will change in Vercel (names only; I never print values): the Supabase URL/keys stop being used; new `DATABASE_URL` and a session secret are added. The hub's `HUB_TODO_TOKEN`, `HUB_TODO_BLUEPRINT_ID` and `CAPTURE_TOKEN` stay as they are, and the blueprint id doesn't change (the data is copied with the same ids).

One thing to know: the app runs on Vercel and the database on Railway, so the database must be reachable from the internet (Railway's public address) with a pooled connection. That adds a small data-transfer charge and ~10–30 ms to each page. Fine for this size. (If the Blueprint itself later moved to Railway too, the database could be private and free of that charge — not part of this plan.)

## 8. How we know nothing was lost

- **Row counts per table**, Supabase vs Railway, compared automatically after every load — all 14 tables must match to the row (numbers in section 6).
- **Fingerprints**: for each table a hash of all rows (ordered by id) on both sides must match, which catches changed values and not just missing rows.
- **Spot checks**: today's schedule and your Field Notes list look identical on both; the hub test to-do round-trips.
- **Constraint check**: every link between tables (blueprint, user, item) points at something that exists; the unique "hub key" indexes (`items_hub_key_idx`, `future_tasks_hub_key_idx`) are present.
- Anything off → no cut-over.

## 9. Money

| | Today | After |
|---|---|---|
| Supabase | **$0** (free plan, project "The Blueprint", 14 MB). Free plans pause after a week of no use and have no backups. | $0, left alone and paused, not deleted. |
| Railway | Hobby plan $5/mo (hub) | Same $5 plan, plus the Postgres service's usage. A database this small idle is roughly **$2–5 a month**; Railway meters memory, CPU, disk and outgoing data separately and the $5 plan includes $5 of usage that the hub is already using part of. Treat **$2–5/mo extra** as an estimate, not a quote. I'll read the real number from the Railway usage page after a few days and tell you. |
| Email service (only if you pick it) | — | Free tier usually enough for 2 people, plus a one-time account setup. |
| Rehearsal | — | pennies (a day of the same service) |

So: this move **adds cost**; its value is one provider, one bill, no weekly-pause worry, and backups you control (Railway's own backup option is an extra I'd price before you decide).
Sources for the price ranges are third-party summaries — I'd confirm on railway.com/pricing before you say yes.

## 10. Undo

- Before cut-over: nothing live has changed, so undo = delete the rehearsal service.
- After cut-over: Vercel keeps the previous deployment, and Supabase still has all the data up to the moment of the window. Undo = put the old Vercel settings back and redeploy the old version (about 5 minutes). Anything entered **after** the cut-over would be copied back from Railway into Supabase by a script before undoing, so nothing you typed is lost.
- Supabase is **paused, not deleted**, and stays that way (for 30 days at least) until you say "remove it". Pausing is also a change in your Supabase settings, so I'll ask first.

## 11. Decisions I need from you

1. Go-ahead to create **one Railway Postgres service** for the rehearsal (small added cost). Same project as the hub, or a new Railway project for The Blueprint? (Separate project = cleaner bills to read; same bill either way.)
2. Email: use a small email service for magic-link / forgot-password / invites, or the simpler choices in section 3?
3. OK to add two small libraries: `pg` (database) and a password-hash one (`bcryptjs`)?
4. Do you still want this given it costs more than $0 today? (Totally fair to say "wait"; the alternative is staying on free Supabase.)
5. Which evening for the cut-over, after rehearsal passes.

## 12. Decisions recorded

- 2026-11-03: Plan only; no production action until Tracy says yes in chat. (Tracy, 2026-11-03)

## 13. Rehearsal log

- 2026-11-03: Tracy said yes to one rehearsal Postgres service. Created Railway project `the-blueprint-rehearsal` (separate from the hub's project) with one Postgres service. (Tracy, 2026-11-03)
- All migrations 0001–0026 ran cleanly on a plain Railway Postgres (with a stand-in `auth` schema and `auth.uid()`), and the backup loaded with **every table's row count matching** Supabase (14/14).
- A temporary public database address was opened only for the load and then removed. The rehearsal copy holds real data (including the Google Calendar token): delete the project when the rehearsal is finished.
- Not yet done: fingerprint check, the code branch, the click-through, and the hub-route test.

## 14. Code branch `try/railway-db` (built, not live)

Decisions (Tracy, 2026-11-03): no email service — passwords are set by Claude with `scripts/set-password.mjs`, no magic link, no forgot-password email, no self sign-up, invites need a login created first. Add libraries `pg` and `bcryptjs`.

What's on the branch:
- `lib/db/` — Supabase-shaped query layer over Postgres (`sql.ts` builds the SQL, `client.ts` runs it). User queries run as the limited `app_user` role with the signed-in person's id, so the existing row-level rules still apply.
- `lib/auth/session.ts` — signed cookie sign-in; `/api/auth/login` checks the password. Needs two new settings at cut-over: `DATABASE_URL` and `SESSION_SECRET` (32+ characters).
- `lib/supabase/server.ts` keeps its old names but now returns the new client, so ~170 call sites are unchanged. Hub, capture, cron and future-task routes are unchanged and still use the owner client.
- `supabase/railway/00_base.sql` and `99_app_user.sql`, plus `scripts/railway-setup.mjs` (builds a database from scratch, loads a backup, checks all 14 row counts + users) and `scripts/set-password.mjs`.
- Tested against the rehearsal copy: a member sees their rows, a stranger and a signed-out visitor see none and can't write; joins, dates and numbers come back in the same shape; the hub's create/update/close/list work. 89 tests pass. Type check clean.
- Still to do: click-through of the real screens with your account, a Vercel preview, and the maintenance-page step.

## 15. Click-through result (2026-11-03, local app on the rehearsal copy)

- Signed in with a throwaway password on the copy; wrong password refused. Signed-out visitors go to `/login`.
- 17 main pages opened with your real data and no errors (Field Notes, Maint Tasks, Future Tasks, Project Plans, Project Tasks, This Week, Routine, Sealed, Settings pages, Documents, Build). Adding a Field Note saved to the right blueprint and owner.
- Hub routes over HTTP: no token → 401; create → `created`; same key → `updated`; dated one lands in Future Tasks; list; close; list again — all as expected. Capture without a token → 401.
- **Speed is the thing to watch.** From my laptop, pages took 2.5–4 s because each database round trip was about 1.6 s over the internet. Vercel and Railway are in data centers, so it should be far quicker, but it must be measured on a Vercel preview before cut-over. Two fixes if slow: put the new database in Railway's US-East region (Supabase was US-East-2) and/or pin the Vercel functions to the same area. Choosing the Railway region matters, so do it when the real database is created.
- The rehearsal copy's temporary public address is closed, the local app is stopped, and the throwaway password lives only in that copy.

## 16. Vercel preview result (2026-11-03)

- Preview of `try/railway-db` built on Vercel (Virginia, `iad1`) with two preview-only, branch-only settings (`DATABASE_URL` pointing at the rehearsal copy, `SESSION_SECRET`). Live site's settings were not touched. (Tracy, 2026-11-03)
- Sign-in works; Field Notes, Maint Tasks, Future Tasks, Project Plans, This Week, Routine, Settings and Build all open with the real data. Wrong password refused.
- Speed from my laptop through the preview: most pages 1.4–2.5 s on a first try, 4–5 s on a second try, Build 5.5 s. The rehearsal database was created in Railway's default region (not US East), so Vercel (Virginia) is talking across the country, and every database call costs three trips. That is the likely cause.
- Before cut-over: create the real database in a Railway **US East** region, rerun this timing, and if pages are still slow cut the trips per query (batching the setup step into the query). Target: pages within about a second of today's.

## 17. Region check and speed-up (2026-11-03)

- Correction to section 16: the rehearsal database's disk is already in Railway's **Ashburn, Virginia** data center — the same area as Vercel's functions (`iad1`). So distance is not the cause I guessed. My own internet to the database measures 0.2–0.5 s per round trip, which explains the slow numbers I saw from my laptop; I can't tell the true Vercel-to-database time from here.
- Cut database round trips per signed-in query from three to two (the "clean up" step now runs in the background and the connection is thrown away if it fails). All 89 tests pass, including the "stranger sees nothing" checks.
- Still to do: re-time the preview once its database setting points at the current temporary address; then decide whether the Railway project's own address (private, no internet hop) would need the app itself to move to Railway — not part of this plan.
