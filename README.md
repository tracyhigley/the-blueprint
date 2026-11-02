# The Blueprint

ADHD-friendly task manager built around a banking metaphor: **drop** thoughts in, triage to **boxes**, withdraw from the **ATM**, work through the **counter**, file **documents** for reference. Replaces a 14-tab Google Sheet + Python pipeline with a single Next.js app.

## Quick start

```bash
npm install
cp .env.local.example .env.local        # then fill it in
npm run dev                              # http://localhost:3000
```

Until Supabase env vars are set, pages render in empty-state mode (no items).

## Stack

- Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4
- Supabase (Postgres + Auth + RLS)
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
  supabase/         Server + client helpers
  types.ts          Domain types
scripts/
  apple-shortcut.md       Action Button setup recipe
supabase/migrations/      SQL schema (run in order)
docs/SPEC.md              Original app spec (historical)
```

## Going live

1. **Supabase** — create a project, run every migration in `supabase/migrations/` in order, drop the URL / anon key / service-role key into `.env.local`.
2. **Sign in once** at the deployed URL to seed the `auth.users` row, grab the uid.
3. **Review settings** — `/settings/boxes`, `/settings/documents`, `/settings/energies` — rename labels as needed.
4. **Configure the day** — `/settings` for default hours / end-of-day.
5. **Connect devices** — `/settings/connect` walks through iPhone Siri, Mac dock, and the bookmarklet.

## Tests

```bash
npm test                                 # daily-plan logic
npm run build                            # type-check + production build
```
