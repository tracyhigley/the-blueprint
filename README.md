# The Blueprint

ADHD-friendly task manager built around a banking metaphor: **drop** thoughts in, triage to **boxes**, withdraw from the **ATM**, work through the **counter**, file **documents** for reference. Replaces a 14-tab Google Sheet + Python pipeline with a single Next.js app.

## Quick start

```bash
npm install
cp .env.local.example .env.local        # then fill it in
npm run dev                              # http://localhost:3000
```

Without `DATABASE_URL` and `SESSION_SECRET` set, sign-in and the data pages will not work.

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4
- Postgres on Railway (row-level security kept) with our own sign-in (signed cookie, `lib/auth/`)
- Vercel
- Apple Shortcut + bookmarklet for capture

## Working in this repo

**See [AGENTS.md](AGENTS.md)** — how a coding assistant should work here, the data model, invariants that mustn't break, and how to translate the user's plain-English requests into code actions.

## Layout

```
app/                Routes — one per surface
components/         UI primitives
lib/
  daily-plan.ts     classify + buildSchedule (the schedule logic)
  actions.ts        Server Actions
  data.ts           Read-side helpers
  categories.ts     Boxes / Documents / Energies (configured per-blueprint)
  shortcuts.tsx     Keyboard shortcut hook + cheat sheet
  db/               Postgres client (Supabase-shaped calls) + SQL builder
  auth/             Signed sign-in cookie
  supabase/server.ts  Keeps the old names (supabaseServer / supabaseAdmin) over lib/db
  types.ts          Domain types
scripts/
  apple-shortcut.md       Action Button setup recipe
supabase/migrations/      SQL schema (run in order)
supabase/railway/         Railway-only setup (stand-in auth schema before, app_user role after)
docs/SPEC.md              Original app spec (historical)
```

## Going live

1. **Database** — create a Postgres on Railway, then `DATABASE_URL=… node scripts/railway-setup.mjs <backup-folder>` builds it (stand-in schema, every migration, app_user role) and loads a backup. Put `DATABASE_URL` and a 32+ character `SESSION_SECRET` in `.env.local` / Vercel.
2. **Create a login** — `DATABASE_URL=… node scripts/set-password.mjs you@example.com` (asks for the password, hidden). There is no sign-up page.
3. **Review settings** — `/settings/boxes`, `/settings/documents`, `/settings/energies` — rename labels as needed.
4. **Configure the day** — `/settings` for default hours / end-of-day.
5. **Connect devices** — `/settings/connect` walks through iPhone Siri, Mac dock, and the bookmarklet.

## Tests

```bash
npm test                                 # daily-plan logic
npm run build                            # type-check + production build
```
