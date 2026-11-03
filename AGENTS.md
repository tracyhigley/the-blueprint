# AGENTS.md — How to work in The Blueprint

This file tells coding assistants (Claude, Cursor, etc.) how to work in this repo on the user's behalf.

**The user is not a developer.** They speak in plain English. Your job is to translate.

---

## Who the user is

The Blueprint is an ADHD-friendly task manager. It replaces a 14-tab Google Sheet + Python pipeline with a single Next.js app. The user runs multiple businesses, has ADHD, and wants to keep customizing this app over time without learning developer vocabulary, running commands, or reading build errors.

When the user says something to you, **assume they're describing the goal in plain English** and you do the technical work. Confirm in plain English when you're done. Do not show command output unless they ask.

---

## How to interpret what they say

| If the user says… | Do this |
|---|---|
| "Try this locally" / "Show me before I commit" / "Let me see it" / "Test this" | Run `npm run dev`. Tell them: *"Local preview running at http://localhost:3000."* If port 3000 is in use, pick another and tell them. |
| "Show me on my phone" / "Try it on my phone first" | Push to a feature branch named `try/<short-description>`. Vercel builds a preview URL automatically. Tell them the URL when the build finishes. Don't push to `main`. |
| "Ship it" / "Make it live" / "Push this" / "Push this live" | `git add -A && git commit -m '<short summary>' && git push origin main`. Vercel auto-deploys (~60 sec). Tell them when it's live. |
| "Save my work" | Commit but do **not** push. *"Saved as a checkpoint, not live yet."* |
| "Undo my last change" | Uncommitted: `git restore <files>`. Committed but not pushed: `git reset --soft HEAD~1`. Pushed and live: open Vercel rollback (or `git revert`). Tell them in plain English what you did. |
| "What did I change?" | `git diff` — but **summarize in plain English**, don't paste the diff. |
| "Stop the preview" | Kill the running dev server. |
| "Make it look more like X" | Find the styling layer (Tailwind classes, CSS vars in `app/globals.css`) and adjust. Show them with a local preview before committing unless they said "ship it." |
| "Why is it doing X?" | Investigate, then explain in plain English. **Don't paste stack traces.** |
| "Add a new box" | The user adds boxes themselves in **Settings → Boxes**. If they're asking for code support, point them there. Boxes are user-configured data, never hardcoded. |
| "Add a new category" / "It's missing X on the menu" | Same — they edit it in **Settings → Boxes**. The ATM page categories are box keys; Settings is the source of truth. |
| "Add to today" (about an item) | Sets `today_order` on the item. The Counter page and the wizard's Step 5 review have a `+ TODAY` toggle for this. |
| "Pick this for today" (about an ATM item) | Same — the ATM page calls it "Withdraw"; same `today_order` mechanic. |
| "Move this to 3pm" / "Pin this at X" | Set `pinned: true` and `scheduledStart` to that time. Schedule auto-flows around pinned blocks. |
| "Done" / "Cross it off" | Mark `state: 'done'`. The item stays in its box. |
| "Skip this" / "Not doing this today" | Mark `state: 'skipped'`. The block stays visible but dimmed; remaining schedule shifts. |
| "Seal it" | Transition to the Sealed state (`/sealed`). Hides daily surfaces; adding field notes stays active. Doesn't change data. |
| "Unseal it" | Exit Sealed, return to Today. |
| "Add X to field notes" | Create an item with `box: 'DROP'`, `title: 'X'`. The user can dictate this from Siri, the bookmarklet, ⌘K, or the /deposit page. |
| "Move X to Y" | Update the item's `box` field. Triage from Drop sets destination + box at the same time. |

---

## Things the user never has to know

Don't make them think about:
- `git`, `npm`, `vercel`, branches, commits, hashes, rebases, merges
- Environment variables (already set up — never ask them)
- Stack traces, error codes, build logs
- TypeScript errors (you fix them silently)
- Linting (auto-fix on save — fix any remaining yourself)
- Database migrations (you run them — describe the change in plain English)

If a step requires technical knowledge, **you do it**. If something is genuinely a decision (e.g. "I see two ways — A or B?"), ask in plain English with no jargon.

---

## How to talk to the user

- One plain sentence at a time. No bullet lists unless they asked.
- Use their words back to them ("the heading" not "h1 element").
- Confirm before destructive actions: *"This will delete the row from your live Blueprint — okay?"*
- After a deploy: *"Live now. Want me to open it?"*
- After local: *"Running on your computer at localhost:3000."*
- **Never** describe a problem with the cause if you can describe it with the symptom and a fix. ("The deploy didn't work — let me try again" is better than "TypeScript error in app/page.tsx line 47.")

---

## Repo conventions

- **Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind 4 · Postgres on Railway · Vercel. (Moved off Supabase on 2026-11-03; the old project is kept paused-not-deleted until Tracy says. Sign-in is our own signed cookie, not Supabase Auth.)
- **Files match URLs.** `app/drop/page.tsx` is `/drop`. Don't create routing config.
- **One file per concept.** A `TodayToggle` component lives in `components/today-toggle.tsx`. Don't bundle.
- **Server Actions** for mutations (in `lib/actions.ts`). Co-locate where it makes sense.
- **`/api/capture`** is the only REST route — the iPhone Shortcut and bookmarklet hit it with bearer auth.
- **Naming:** plain English. `daily-plan.ts` not `DPSchema.ts`.
- **Comments:** describe WHY, not what. Names make the what obvious.
- **No new abstractions** unless you can name three concrete uses. When in doubt, repeat code.
- **No new dependencies** unless the user asked for the feature they unlock. Adding a library is a decision, not a default.

---

## Repo layout

```
app/
  page.tsx                Today (the Docket — daily schedule)
  drop/                   Triage inbox
  atm/                    Energy-matched optional pulls
  counter/                Obligations
  documents/[slug]/       Markdown documents (Notes, Measurements, etc.)
  build/                  Morning wizard
  sealed/                 End-of-day ceremonial state
  settings/               Settings hub
    boxes/                User-configured box list
    documents/            User-configured document list
    energies/             User-configured energy list
    connect/              iPhone + Mac setup walkthrough
  api/capture/            Bearer-auth POST endpoint for shortcuts
  deposit/                /deposit?t=… quick-add landing for the bookmarklet
components/               UI (one file per concept)
lib/
  actions.ts              Every Server Action
  data.ts                 Read-side helpers
  daily-plan.ts           classify + buildSchedule (THE schedule logic)
  categories.ts           getBoxes / getDocuments / getEnergies + types
  shortcuts.tsx           Keyboard shortcut hook + cheat-sheet registry
  types.ts                Domain types
scripts/
  apple-shortcut.md       Action Button setup recipe
supabase/migrations/      SQL schema (run in order)
supabase/railway/         Railway-only setup SQL (before / after the migrations)
lib/db/ lib/auth/         Postgres client + sign-in cookie (lib/supabase/server.ts keeps the old names)
docs/
  SPEC.md                 Original app spec (historical)
```

---

## Invariants — DO NOT BREAK these

1. **Settings is the source of truth for labels.**
   - Pages must look up labels in `settings.boxes` / `settings.documents` / `settings.energies`. If the lookup misses, render "Uncategorized" or a not-found page. **Do not** prettify keys on the page side to fabricate a label.
   - All the "what's a category" lists come from settings — none hardcoded anywhere in the app.

2. **Reserved counter-station keys never appear in user-configurable lists.**
   - `DROP`, `ATM`, `COUNTER`, `DOCKET` are top-level pages, not categories. `RESERVED_BOX_KEYS` in `lib/categories.ts` filters them defensively at multiple gates.

3. **Counter items opt IN to today.**
   - `today_order` is the universal "on today's plan" flag. Default is `null` (not on today). The wizard's Step 5 review and the Counter page have a `+ TODAY` toggle. Don't reintroduce opt-out — at 35–40 maint items it's unworkable.

4. **The schedule starts at `dayStart` and clamps to `now`.**
   - `dayStart = endOfDay − hoursAvailable`. If "now" is later than dayStart on the same day, schedule starts at "now" (no past blocks). Don't reintroduce the old end-of-day-anchor mode.

5. **`otherMaint` (counter items with neither urgent nor must) is included in the schedule.**
   - Was being silently dropped in an earlier version. Make sure any change to `buildSchedule` keeps it in `maintPile`.

6. **Done doesn't delete.**
   - Marking a schedule block done sets `state: 'done'`. Items stay in their box. Don't change this behavior.

7. **No "Tracy"-style copy or hardcoded data.**
   - The app should work for any user out of the box. Box keys, documents, energies, day defaults are all configurable per-blueprint.

---

## The data model

```ts
// One row in the items table — anything that gets stored.
type Item = {
  id: string
  box: BoxKey                      // 'DROP' | 'ATM' | 'COUNTER' | 'DOCKET' | <user key>
  title: string

  // Counter-shape (obligations)
  area?: string | null             // box key — the category axis on counter rows
  urgent: boolean
  must: boolean

  // ATM-shape (energy-matched options)
  category?: string | null         // box key — same category axis, on ATM items
  energy?: string | null           // user-defined energy key (CREATIVE, PROB-SOLV, …)

  // Common
  minutes?: number | null
  todayOrder?: number | null       // null = not on today's plan; rank when present
  potential?: 1 | 2 | 3 | 4 | 5 | null
  person?: string | null
  tag?: string | null
  notes?: string | null

  // Documents (text-first content)
  body?: string | null             // markdown when item is a document category

  // Schedule placement (set when on today's plan)
  scheduledStart?: string | null
  scheduledEnd?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  state?: 'upcoming' | 'active' | 'done' | 'skipped' | 'overrun' | null
  pinned: boolean

  createdAt: string
  modifiedAt: string
  deletedAt?: string | null        // soft delete; reversible from DB
}
```

`settings` row holds `boxes`, `documents`, `energies` (all jsonb arrays of `{key, label, ...}`), plus `default_hours`, `default_end_of_day`, `stressor_anchor_minutes`, `capture_token`, `sealed`.

---

## The daily plan logic (don't drift)

Defined once in `lib/daily-plan.ts`:

- Stressors = `urgent && must`
- Time-sensitive = `urgent && !must`
- Must-do = `must && !urgent`
- Other maint = neither flag (long tail)
- Stressor anchor threshold (default 91 min, configurable): when stressors hit this, maint runs first thing in the morning; otherwise ATM picks come first and maint lands after.
- Both branches start at `dayStart` (or `now` if later, same day).
- ATM picks selected by `pickAtmCandidates` based on `creative` / `probSolv` / `tieBreak` from the wizard.

Changing this logic requires a deliberate, named change. Don't tweak for cosmetic reasons.

---

## Common workflows

### Going live (first time)

1. Create a Railway Postgres; `node scripts/railway-setup.mjs <backup-folder>` runs the setup SQL and every migration in order.
2. Create their login with `node scripts/set-password.mjs <email>` (password typed hidden; no sign-up page, no email links).
3. They review **Settings → Boxes / Documents / Energies**, rename labels.
4. They set **Settings → General** (default hours, end of day).
5. They walk through **Settings → Connect** to wire iPhone Siri / Mac dock / bookmarklet.

### Tests / build

```bash
npm test          # vitest — daily-plan logic
npm run build     # type-check + production build
```

If `npm test` fails, the failing case usually points at one of the invariants above.

### Pushing changes

The user almost never wants you to push without their explicit "ship it" / "push it" / "make it live." Unless they say so, commit locally and offer to preview.

---

## Glossary — the user's vocabulary

The user's words are deliberate; map them back to code precisely.

| User says | In the app |
|---|---|
| **The Blueprint** | The whole app. In the database each user's data belongs to one `blueprints` row — every table carries `blueprint_id`, membership is in `blueprint_members`, and RLS uses `is_blueprint_member()` / `is_blueprint_owner()`. (These were `vaults` / `vault_id` before Nov 2026.) |
| **The drop** | `/drop`. Untriaged inbox. New captures land here as `box: 'DROP'`. |
| **The counter** | `/counter`. Obligations — `box: 'COUNTER'`, with `urgent` / `must` flags. |
| **The ATM** | `/atm`. Energy-matched optional pulls — `box: 'ATM'`, with `energy` + `category`. |
| **The docket** / **today** | `/` (home). Today's timed schedule. |
| **A box** | A user-configured category (`settings.boxes`). The same box can hold both Counter and ATM items. |
| **A document** | A user-configured text-first category (`settings.documents`). Routed to `/documents/<slug>`. |
| **An energy** | A user-configured tag on ATM items (`settings.energies`) — Creative, Prob-Solv, etc. |
| **Build the day** / **build today** | The morning wizard at `/build` (5–6 questions). Persists to `day_inputs`. |
| **Seal it** | Set `settings.sealed = true`. The Sealed page hides daily surfaces; adding field notes stays open. |
| **Add a field note** | Create an item in `box: 'DROP'`. Surfaces: ⌘K, `/deposit`, Siri Shortcut, bookmarklet. |
| **+ TODAY** / **on today's plan** | Sets `today_order` (rank). Default is null (not on today). Universal flag for both Counter and ATM. |
| **Withdraw** | ATM-specific phrasing for the same `today_order` toggle. |
| **Stressor** | An item with both `urgent` and `must` set. |
| **What's heavy** | Wizard step 5 — the counter-items review. Where she opts in via `+ TODAY`. |
| **Quick-add (⌘K)** | The capture popup, available everywhere. |
| **Mark done** | Set `state: 'done'` on a schedule block. Item stays in its box. |

If she uses a word that isn't in this table, **mirror it back to her** — don't invent new app terminology.

---

## Patterns to follow

These were established the hard way; preserve them.

### Server Actions: always try/catch + toast

Every `startTransition(async () => await someAction(...))` must wrap the await in try/catch and toast on error. Without this, Server Action failures bubble as silent `unhandledRejection` events that the user never sees.

```tsx
startTransition(async () => {
  try {
    await someAction(args);
    toast.success("Saved.");
  } catch (e: any) {
    toast.error(e?.message ?? "Couldn't save.");
  }
});
```

The unhandled-rejection guard in `components/unhandled-rejection-guard.tsx` exists as a backstop, but **it deliberately silences null/undefined rejections** (framework noise from Next.js prefetcher with stale client bundles). Don't rely on it to surface real errors — wrap at the call site.

### Server Component ≠ event handlers

A Server Component file (no `"use client"` at top) can't have `onChange` / `onClick` handlers — they're no-ops in the browser. If you need interactivity, extract to a client component. (The Members page Role select had this exact bug.)

### Focus-gated keyboard shortcuts

When a shortcut should only fire for the focused row (Drop triage, Counter row), use the `useShortcut` hook with `enabled: focused` and track focus with a `focusin`/`focusout` listener:

```tsx
const wrapperRef = useRef<HTMLDivElement>(null);
const [focused, setFocused] = useState(false);
useEffect(() => {
  const check = () => setFocused(!!wrapperRef.current?.contains(document.activeElement));
  document.addEventListener("focusin", check);
  document.addEventListener("focusout", check);
  return () => { /* …remove listeners */ };
}, []);

useShortcut("u", () => toggleUrgent(), {
  label: "Toggle Urgent",
  group: "Drop",
  options: { enabled: focused },
});
```

Pattern is in `components/drop-triage-row.tsx` — copy if extending to Counter rows.

### Settings dictates the view

If you find yourself writing `prettify(key)` in a page component as a label fallback, **stop**. Look up the label in `settings.boxes` / `settings.documents` / `settings.energies`. If it's not there, render "Uncategorized" (and don't link). Pages display data; settings own labels; the import seeds settings.

### Confirm before destructive things — except where speed matters

The Drop dismiss action skips the confirm prompt because at 35–40 untriaged thoughts the prompt was the bottleneck (soft-delete is reversible from the DB anyway). The Members remove action keeps a confirm because the consequence is harder to undo. Pick deliberately based on reversibility + frequency.

### Keyboard shortcut registration

Every `useShortcut` call with a `label` auto-registers in the cheat sheet (`?` key). When adding a new binding, give it a clear `label` + `group` so it shows up. Use `hidden: true` only for pure key aliases (e.g. arrow-down as alias for `j`).

---

## Common gotchas

- **"Failed to fetch RSC payload" + bare `undefined` rejections in dev** — almost always a stale client bundle after dev-server restart. The guard silences these. If they persist after the user hard-refreshes (⌘⇧R), then it's real.
- **Dev server returning 500 after a clean restart** — clear `.next/` (`rm -rf .next`) and restart. Turbopack's incremental cache can desync after backslash-deep edits.
- **A change works locally but not in deployed Vercel build** — usually a missing migration the user hasn't run in the Railway database. Check `supabase/migrations/` for any new files vs. what's been run, and run them against `DATABASE_URL` yourself — never ask the user to.
- **iOS Safari standalone detection** — uses both `window.matchMedia('(display-mode: standalone)').matches` AND iOS-specific `(navigator as any).standalone`. The `connect-device-cards.tsx` component does both.
- **Captures vs items** — the `captures` table holds raw capture history; `items` are the actual rows. `captures.item_id` is `on delete set null`, so wiping items leaves capture history intact (this is intentional for audit).
- **`getAllItems()` returns everything, not just storage** — when displaying a count, filter out counter-station boxes (`DROP`, `ATM`, `COUNTER`, `DOCKET`) unless you specifically mean "every row."

---

## When in doubt

Ask the user. Use their words. Make the smallest change that achieves the goal. Don't refactor.
