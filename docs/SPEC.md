> **Historical document.** Written when this app was called "The Vault". The app is now **The Blueprint**, and the vault terminology, routes, and some features described here no longer exist. See `AGENTS.md` for current names and structure.

# The Vault — App Specification

A web app that replaces Tracy's 14-tab Google Sheet + `plan_day.py` pipeline with a single coherent system. The vault metaphor is hers; this spec refines it, doesn't reinvent it.

---

## 1. Vision in one paragraph

The Vault is an external brain for someone running eight concurrent businesses with ADHD. Tasks, ideas, references, and obligations live inside the vault so Tracy doesn't have to hold them in her head. Each morning, the vault produces a single document — today's plan — calibrated to her energy, time, and the day's pressures. The plan is the only place she "lives" during a workday; everything else is storage, accessible when she chooses to engage. Capture-from-anywhere keeps thoughts from being lost. The system is quiet by default — no badges, no alerts, no productivity meters. Its job is to remember so she doesn't have to.

---

## 2. Operating principles

These come directly from Tracy's manifesto and her interview answers. Every design decision should pass through these.

1. **The vault remembers so she doesn't have to.** The point is *not* keeping her engaged with the app — it's letting her stop carrying tasks in her head.
2. **The daily plan doc is the primary surface.** Not a card stream, not a kanban, not an inbox. A doc. Generated each morning, paper-feeling, scannable.
3. **Phone capture is required.** Mid-day thoughts must reach the vault from her phone with one or two taps, no decisions.
4. **No AI categorization.** Manual entry with smart defaults (last-used category, recent time estimates).
5. **Familiar, document-shaped UI.** Calibri-style typography, headings, paper aesthetic. Closer to a Word doc than to Linear.
6. **Soft delete by default.** Done = gone from the live vault. But recoverable for ~30 days under the hood, so an archive view can grow in later without retrofitting.
7. **Counts and progress meters are hidden by default.** "Stop creating standards I fall short of." The 500-hour budget is opt-in, not surfaced unprompted.
8. **One source of truth, multiple lenses.** Tracy needs to see items "in various ways" — categories, urgency, time-fit, energy. The data lives once; views are filters over it.
9. **Settings beat questions.** When in doubt, ship a default and let her change it.
10. **Anywhere access.** Web app, no install, works on phone + tablet + desktop. PWA-friendly.

---

## 3. Naming & metaphor

Tracy's vault is a real banking/storage metaphor — not aesthetic. We extend it consistently and replace the only piece that doesn't fit (`MENU`).

| Concept | Name | What it is |
|---|---|---|
| The whole system | **The Vault** | Everything stored. |
| The act of capturing | **Deposit** | Verb. Button label is **DEPOSIT** everywhere (not "drop a thought"). |
| Mid-day capture surface (in-app) | **Mail slot** | Text-only. Voice deposits happen via a separate Siri Shortcut, never inside the app UI. |
| The morning artifact | **Today** | The daily timed schedule. |
| Untriaged captures landing zone | **The Drop** | Counter station — has its own view. *Not* a deposit box. (Was `Inbox`.) New surface; replaces typing directly into a sheet tab. |
| Today's timed plan | **The Docket** | Counter station — the schedule that runs the day. Backed by the morning-generated `PLAN DAY.docx` in legacy. |
| Energy-matched picks for today | **The Till** | Counter station — has its own view. *Not* a deposit box. Backed by the legacy `MENU` tab. |
| Admin pulled onto the counter | **The Drawer** | Counter station — filtered ADMIN view (urgent / must / today / quick / by-area), the macros made interactive. *Different from a Box drilldown.* |
| The four counter stations together | **The Counter** | Where today's plan comes from. |
| Categorized **task** collections (variable) | **Deposit boxes** | PCS Ideas, SWB Plan, etc. Tracy adds/removes/renames. Items here are backlog; she moves into The Docket or works straight from the box. |
| Reference, logs, manifesto | **Notes & References** | Measurements, Lifting, PCS Misc, Notes. Don't roll up into Today's plan. Just live for lookup. |
| Done | **Filed** *(or just removed)* | Soft-deleted by default. |
| End-of-day close-up | **Sealed** | Surfaces hide; deposit slot still works; opens at morning generation time or on demand. |

### Three zones in the vault

Critical distinction Tracy called out: not every tab in her current sheet is the same thing. We organize the Vault Interior dashboard into three labeled zones:

1. **The Counter (4 stations, fixed):** **The Drop · The Docket · The Till · The Drawer.** Each has a distinct dedicated view. The Drop is triage. The Docket is today's timed schedule. The Till is energy-matched options to pull onto the day. The Drawer is the filtered ADMIN view (urgent / must / today / quick / by-area) — the legacy macros made interactive. The Drawer is *not* a Box drilldown; it's an action lens onto admin obligations.
2. **The Boxes (variable):** task backlog by category. PCS Ideas, PCS Delegation, Read & Research, Health Ideas, Misc Ideas, Ron's Queue, etc. Tracy adds / removes / renames. Items don't auto-feed Today — she manually moves them into The Docket or works straight from the box.
3. **The Documents (variable):** Notes, Measurements, Lifting, PCS Misc, SWB Plan, plus anything Tracy adds. **All documents are one shape: text-first / markdown.** Whatever structure (table, list, matrix, calendar) is just markdown she writes herself. Don't roll up into Today's plan. See §4D.5.

Vault Interior (§4C) renders these as three labeled zones — they look different and behave differently.

### Why "The Till" replaces "MENU"

Restaurant `MENU` is the only non-vault word in the system. **The Till** is a teller's cash tray — items pulled from the vault and laid out for picking. Banking-coherent, distinct from "vault" and "deposit boxes" (those are storage; the Till is what's at hand). Tone is slightly old-fashioned in a way that matches the paper/doc aesthetic.

In the daily plan output, the section heading goes from `Menu Choices` to **`From the Till`**.

Alternates considered:
- *The Float* — banking slang for available funds, but more obscure.
- *Today's Pull* — action-oriented, but reads more like a verb than a place.
- *The Reserve* — too withheld/formal; doesn't capture "browse and pick."

---

## 4. The five surfaces

The whole app is five screens. Anything more is a setting.

### A. Today (home)
**This is what Tracy sees when she opens the app.** The page is a *decision surface*: see what has to happen, pick from the Till, get a timed schedule that lands at end-of-day.

**Aesthetic note:** the page is an **atmospheric vault scene**, not a document. Deep slate vault wall, warm amber lamp glow, brass plaques, parchment, brass-edged cards. Calibri-substitute (Carlito) for body, Instrument Serif for atmospheric headings, JetBrains Mono for engraved labels. The metaphor is alive, not flat. (Earlier doc-paper exploration was rejected by Tracy in favor of this.)

**Layout — three zones:**

**Top: Day-input control panel.** Five pills, exactly matching Tracy's five daily questions:
1. `HOURS AVAILABLE` — total task time today (e.g. 7 hrs)
2. `CREATIVE` — energy 1–5 (visualized as 5 brass tabs)
3. `PROBLEM-SOLV` — energy 1–5
4. `IF EQUAL` — tie-break preference (dimmed when energies aren't equal)
5. `END OF DAY` — anchor time (e.g. 4:30 PM)

Tracy answers these once each morning. Editing them re-runs the schedule.

**Left column: configuration (~600px).**
- **What has to happen** panel (read-only, scannable):
  - Threshold callout at top: *"Stressors at X min — over the 91-min threshold. Admin goes first today."* (or its inverse: *"Stressors anchor to end-of-day"*).
  - Three subgroups: `STRESSORS` (rust dot) / `TIME-SENSITIVE` (often empty) / `MUST-DO` (brass square). Each row: dot, title, area-tag chip (ECO/SWB/HEALTH/FF/TRAVEL), duration.
  - Tracy doesn't pick from this — these items are commitments and always go into the schedule.
- **From the Till** panel (interactive picking):
  - Filtered to today's energy match (per script logic in §6).
  - 2-column grid of brass-edged cards. Each card: category · duration, title, unchecked checkbox.
  - Selected items show a **PICKED** brass tab on the corner.
  - Counter at top: "2 picked · 60 min · 10 available."

**Right column: the timed schedule (the centerpiece).**
- Header: brass clock icon, "Today's Schedule," `9:30 AM → 4:30 PM · 7 HRS`, and a `FILLED` counter showing time consumed vs total.
- **Editable hint** below header: *"This is your starting plan. Drag, edit, add, or remove anything — the vault just lays out a first draft."* with a `RESET` link.
- **Vertical timeline**: brass rail running down the page. Each block has:
  - Time on the left in serif gold (computed cumulatively from start)
  - Brass rail-dot on the timeline
  - Block content with section-color left-edge: stressors `#C25426`, must-do `#B5853A`, till picks `#2E5E58`
  - Title, area-tag (centered), duration on the right
- **Section dividers** between Stressors / Must-Do / From-the-Till, each with a small color-coded glyph.
- `+ ADD A CUSTOM BLOCK` dashed-brass button between till picks and the End-of-Day anchor.
- **`END OF DAY · ANCHOR`** row at the bottom, locked to Tracy's stated end-of-day. The schedule works *backwards* from this anchor: total minutes + start = anchor. The last block always ends here.

**Schedule editability (every block):**
- Drag handle (brass 2×3 dot grid) on the left → reorder
- Pencil icon on the right → edit title / time / duration / area
- Rust × on the right → delete (with undo)
- Drop a Till card onto the schedule to insert it
- Click `+ ADD A CUSTOM BLOCK` to create an ad-hoc block (anything not in the vault)
- The End-of-Day anchor is locked; everything else flexes

**Mobile:** same architecture, single column. Required panel stacks above the schedule. Capture is one tap from a floating brass `+` button.

### B. Mail slot (capture)
**iPhone-first.** Three layers of capture, fastest to friction-iest:

**Layer 1 — Apple Shortcut (talk or type, fastest possible)**
- A custom Shortcut that POSTs a thought to the vault's `/api/capture` endpoint with a long-lived personal token in the header.
- The Shortcut **opens with a single dialog** that accepts either:
  - **Voice** (mic icon → speak → auto-transcribed via iOS dictation)
  - **Text** (keyboard appears below the mic — type if she'd rather)
- Bound to whichever surfaces fit her phone:
  - **Action Button** (iPhone 15 Pro / 16 / Pro Max) — single press from anywhere, including Lock Screen
  - **Siri** — *"Hey Siri, drop in the vault"* → speak → done
  - **Lock Screen widget** — tap once to open the dialog
  - **Home Screen icon** — works on any iPhone, large tap target
- Total time: <3 seconds end-to-end. No app to open.
- The Shortcut is a single file we'll generate and AirDrop / iCloud-link to her once.

**Layer 2 — PWA on the Home Screen (one-tap, text-only)**
- Installed via Safari → "Add to Home Screen." Looks and behaves like a native app, no App Store.
- **Single full-screen text input** with optional one-tap chips for the last 3 boxes used. **No voice/transcription in the app UI** — that's the Siri Shortcut's job.
- Submit lands the item in The Drop with a timestamp.
- Primary button: **DEPOSIT** (not "drop in the vault").

```
┌─────────────────────────────┐
│  Drop a thought…            │
│  [_____________________]    │
│                             │
│  [home] [eco] [swb]   [⏎]  │
└─────────────────────────────┘
```

**Layer 3 — Share Sheet target (later)**
- "Save to Vault" appears in the iOS Share Sheet from any app — captures the link/text/quote.

**On desktop:** `⌘K` from anywhere opens the same input as a centered modal.

All capture works while the vault is "sealed" — items land in The Drop without re-engaging the rest of the system.

### C. Vault interior (browse)
Three labeled zones, each rendering its members differently:

**Zone 1 — The Counter** (top, accent rust): The Drop / The Docket / The Till.
Cards show count + a status indicator (e.g. The Drop `3 NEW`, The Docket `STRESSORS ↑`, The Till `10 ELIGIBLE TODAY`). Click → opens that station's dedicated view (different per station, see below).

**Zone 2 — Deposit Boxes** (middle, accent brass): variable task collections.
Cards show count + last-edited. `+ NEW BOX` tile in the row. Click → opens the generic Drawer view (Surface D).

**Zone 3 — Documents** (bottom, accent patina): Notes, Measurements, Lifting, PCS Misc, SWB Plan, + anything Tracy adds.
Visually slightly dimmer / less prominent than the task zones. All documents share the same text-first shape — click → opens the unified Documents view (D.5).

Search bar across the top spans all three zones.

### D. Surface views (per-type)

**D.1 The Drop view** — triage list. Each slip shows status (`▸ NEW`, `2 DAYS`, `STALE`, `OLD`), timestamp, deposit source (`via Siri` / `via PWA`), and one-tap **send-to-box chips** (Docket / a few likely boxes / `⋯` menu / dismiss). Speed-sort affordance for backlog clearing. Designed.

**D.2 The Docket view** — drawer with filter chips. Filter chips map the Apps Script buttons (ALL / STRESS / URGENT / MUST / TODAY / QUICK 5–15 / by area). Items table with urgent/must checkboxes, today-order, area-tag, time, description. Drag to reorder, edit inline, delete (soft). Designed.

**D.3 The Till view** — category-grouped energy-matched cards. Today's energy panel at top. Each card has a check-circle that fills brass when picked. Picked cards get a rust left-edge accent. Counter: `X picked · Y min`. Designed.

**D.4 Generic Box view (deposit boxes)** — list of items in the box's native schema. PCS Ideas keeps its richer 5-column shape (Potential stars / Time / Person / Tag / Category / Task). Filter chips appropriate to that box's schema. Each row has a `→ DOCKET` promote action. Designed using PCS Ideas as the example; generalizes to all Boxes.

**D.5 Documents view** — **one shape: text-first, like Notes.** No type picker. No per-document bespoke schemas. Tracy names a document and types whatever she needs into it: prose, markdown lists, markdown tables, dated section breaks, whatever structure she imposes herself. Same parchment-page shell with a left-side entry index, regardless of what the document contains.

This means:
- Documents are infinitely extensible — `+ NEW DOCUMENT` is just "name it, start typing."
- One view to maintain. One pattern.
- Existing documents (Measurements / Lifting / PCS Misc / SWB Plan / Notes) all import as text. The structure that's there gets preserved as markdown.
- If Tracy ever wants a document to *compute* (e.g. body-comp deltas), that's a deliberate one-off code change for that document — not a framework decision.

**Per-document metadata Tracy can set:**
- Name (any string)
- Optional small icon / color (purely cosmetic)
- Pinned / unpinned in the Documents zone

**SWB Plan note:** SWB Plan items are *strategic backlog*, not pure prose. If she wants to promote a specific cell into The Docket as a real task, the Documents view has a `→ DOCKET` action available on selected text (works for any document). She doesn't need a special matrix view to do this — markdown formatting preserves the 4-column structure just fine.

### E. Settings
Everything tunable. See §11.

### F. Sealed (close-and-leave)
A reachable state, not a surface Tracy lives in. When she clicks **Close the Vault** (or hits the keyboard shortcut), the daily surfaces collapse into a quiet locked-vault scene:

- Hushed dark wall, distant amber glow.
- Centered: the **sealed door** — bolts engaged, brass dial pointing to `LOCKED`, padlock icon at the hub.
- Headline (italic Instrument Serif): *"Everything's safe. You can stop carrying it."*
- Sub-line: how many items in storage and when the next morning generation happens.
- **Deposit slot stays active** below the door (`⌘K · DEPOSIT`) — captures still land in The Drop while sealed.
- Two actions: **OPEN VAULT NOW** (primary brass) and **PEEK INSIDE** (secondary, opens a read-only browse).
- Footer: *"OPENS TOMORROW · 6:00 AM"* (from settings).

The vault auto-opens at the morning generation time, or any time Tracy clicks Open Vault Now. Sealing doesn't archive or change anything — it's just a UI state that hides the noise.

---

## 5. Data model

One item type, with optional fields. The same item can live in any deposit box.

```
Item {
  id: string
  box: string                    // "ADMIN" | "PCS IDEAS" | "RESERVE" | …
  title: string                  // the description
  area: string?                  // ADMIN's col A — "ECO", "SWB", etc.
  minutes: number?               // estimated time
  urgent: boolean                // C1-equivalent flag
  must: boolean                  // E-equivalent flag
  todayOrder: number?            // D-equivalent — manual rank for today
  energy: enum?                  // CREATIVE | PROB-SOLV | LEISURE | PHYSICAL  (RESERVE only)
  category: string?              // sub-category within a box
  potential: 1..5?               // PCS IDEAS schema
  person: string?                // PCS IDEAS schema (delegate target)
  tag: enum?                     // PCS IDEAS schema — Admin | Creative | Numbers | Ron
  notes: string?                 // freeform

  // Schedule placement (only set when item is on today's schedule)
  scheduledStart: timestamp?     // computed start time
  scheduledEnd: timestamp?       // computed end time
  actualStart: timestamp?        // captured when block goes 'active'
  actualEnd: timestamp?          // captured when block goes 'done'
  state: 'upcoming' | 'active' | 'done' | 'skipped' | 'overrun'?
  pinned: boolean                // if true, manual position locks against auto-adjust

  createdAt: timestamp
  modifiedAt: timestamp
  deletedAt: timestamp?          // soft-delete
}
```

**Boxes** are themselves data, not code. `box.name`, `box.color`, `box.schema` (which fields are exposed in entry forms). Boxes can be added/removed/renamed in Settings.

**Tags** are flexible labels (e.g. business: PCS / Qcom / book-writing / etc). Multi-valued. User-managed. No hardcoded list.

---

## 6. Daily plan generation

Kept whole-cloth from `plan_day.py`. The logic works; we just port it.

**Inputs** (the equivalent of `Answer_First.txt`):
- Hours available today
- Creative energy 1–5
- Problem-solving energy 1–5
- End-of-day time
- Tie-break preference (only required if creative == problem-solving)

**Classification (The Docket — backed by `ADMIN` sheet tab in legacy data):**
| Urgent | Must | Bucket |
|---|---|---|
| ✓ | ✓ | STRESSORS |
| ✓ | | TIME-SENSITIVE |
| | ✓ | MUST-DO |
| | | OTHER ADMIN |

**Stressor anchoring:**
- Total stressor minutes < `STRESSOR_THRESHOLD` (default 91, configurable) → `start_time = end_of_day − stressor_minutes`
- ≥ threshold → "do admin first"

**Till selection (was MENU):**
- `creative + problem-solving < 6` → include `LEISURE` and `PEOPLE` items
- `creative > problem-solving` → include `CREATIVE` items
- `creative < problem-solving` → include `PROB-SOLV` items
- equal → use tie-break preference
- only items where `minutes ≤ available_minutes_left`
- group by category, sort by minutes ascending

**Output document structure** — identical to current `PLAN DAY.docx` plus the rename `Menu Choices` → `Till`.

The plan is generated:
- Automatically each morning at a configurable time (default 6:00 AM)
- On-demand via "Re-generate" button (when energy/hours changed)
- Every regeneration replaces today's plan; previous days are kept for archive.

---

## 6.5. Live progress & schedule auto-adjust

The schedule isn't static after generation — it tracks reality through the day and reflows when actual time differs from estimated time.

**Block states:**
- `Upcoming` — default. Time slot shown in gold.
- `Active` — Tracy clicked "start" or it's the current time-slot. A faint brass glow pulses; a "now" line crosses the timeline at the current time.
- `Done` — Tracy marked it complete. Block dims, gets a brass checkmark. Captures the actual completion time.
- `Skipped` — Tracy explicitly chose to skip. Block goes patina-gray with a strike-through.
- `Overrun` — block's scheduled end-time has passed but it's not done. Outlined in rust.

**Auto-adjust logic:**
When a block changes state, the schedule recomputes from that point:
- **Finished early** (actual < scheduled) → all subsequent blocks shift earlier by the delta. The `END OF DAY · ANCHOR` row stays fixed; a `BREATHING ROOM · X min` slot appears before the anchor.
- **Finished late** (actual > scheduled) → subsequent blocks shift later by the delta. If the schedule now overflows the End-of-Day anchor, the overflow blocks get a rust `OVERFLOW · X min` indicator and Tracy is asked: *"Push to tomorrow, drop one, or extend end-of-day?"*
- **Skipped** → the block is removed from the live timeline and shifts to a `Skipped today` strip at the bottom of the schedule.

**Live status indicators (top-right of the schedule header):**
- "On time" — pulsing patina dot
- "12m ahead" — brass dot
- "23m behind" — rust dot
- "Overflow: 45m past end-of-day" — rust glow

**Interactions that trigger auto-adjust:**
- Marking a block done (with actual duration captured)
- Editing a block's duration
- Inserting a Till card or custom block
- Deleting a block
- Reordering blocks via drag

**What stays locked:**
- The End-of-Day anchor row (4:30 PM in this example) doesn't move automatically. If Tracy wants a longer day, she edits the End-of-Day pill at the top — that's a deliberate gesture.

**Manual override always wins.** If Tracy drags a block to a specific time, that time is pinned and the auto-adjust flows around it. Pinned blocks get a tiny brass pin icon.

**Visual language for time-flux:**
- Subtle slide animation when blocks shift (~200ms ease)
- The "now" line drops with a faint amber glow
- Time labels on the left flicker briefly when they update

This is a v0.3+ feature, not v0.1. The MVP can ship a static schedule. But the data model and block component should be designed so this layers on top later without rework.

---

## 7. Lensing

Tracy needs to see items multiple ways. The mechanism:

1. **Filter chips on the Drawer view** — toggle Urgent, Today's, Quick (5-15 min), Stress, Must, plus per-category. Multiple chips compose (AND).
2. **The Today doc** is itself a lens — auto-filtered to the day's plan.
3. **Universal search** (`/` or `⌘F`) — full-text across all boxes. Returns inline results with the box label.
4. **Saved views** (later) — Tracy can name and save a chip combination.

The Apps Script's 14 buttons map to chip combinations and sort options on the Drawer view. Nothing is lost in translation; the buttons just become chips.

---

## 8. Capture flow (the mail slot)

The single most important UX. Optimized for "I'm in the kitchen, I had a thought, I have 5 seconds."

**On phone:**
1. Open via PWA icon, share-sheet, or saved bookmark.
2. The screen *is* a single input. No menu, no settings visible.
3. Type. Optional: tap a recent-category chip.
4. Submit. Item lands in The Drop with a timestamp. Confirmation is a brief toast and the field clears.
5. Total taps to capture: **1 tap to focus, type, 1 tap to submit. = 2 taps + typing.**

**On desktop:**
- `⌘K` from anywhere opens the same input as a centered modal.
- Same flow.

**Defaults that fire automatically (no AI needed):**
- Last category used (per-session memory)
- Last time estimate used (15 min default if never set)
- Default destination: The Drop
- Default urgent/must: off

**Triage happens later**, in The Drop view. She sends items to boxes or to The Docket (with urgent/must flags) when she's at the desk.

---

## 9. The Till (formerly MENU)

The Till is energy-matched options for today. Not a to-do list — a *pull pile*.

**Schema:**
- `energy`: CREATIVE | PROB-SOLV | LEISURE | PHYSICAL
- `category`: free-text label (PLD, CC, NP, HG, READ/WATCH, PEOPLE, PCS, QCOM, SWB, ECOSHIP, ADVERT, …)
- `minutes`: time estimate
- `title`: task

Till items don't have urgent/must flags by design — they're explicitly *not* obligations.

**Behavior:**
- Till items get filtered into the day's plan by the rules in §6.
- Till items don't get "completed" in the same way as ADMIN items — they're recurring options. Doing them once doesn't remove them. (TBD: confirm with Tracy whether reserve items should ever leave.)
- New reserve items can be captured the same way as anything else; box defaults to Till and energy defaults to last-used.

---

## 10. Migration from the existing system

Tracy's 14-tab Sheet maps to boxes:

| Sheet tab | New box | Notes |
|---|---|---|
| ADMIN | **Admin** | The active obligation pile |
| MENU | **Till** | Renamed |
| SWB PLAN | **SWB Plan** | **Imports into Documents as text.** Markdown preserves the 4-column structure. Cells can be promoted to The Docket. |
| PCS DELEGATION | **PCS Delegation** | |
| PCS IDEAS | **PCS Ideas** | Keeps the 5-column richer schema (Potential / Time / Person / Tag / Category) |
| READ/RESEARCH | **Read & Research** | |
| HEALTH IDEAS | **Health Ideas** | Empty today; carry forward as a box |
| MISC IDEAS | **Misc Ideas** | |
| Ron | **Ron's Queue** | A delegation-target box |
| measurements | **Measurements** | Reference/log box, not a task box |
| lifting | **Lifting** | Reference/log box |
| PCS misc | **PCS Misc** | |
| Notes | **Notes** | Manifesto + reference, read-only-ish |
| Lock | *(dropped)* | Was decoration — replaced by app's vault aesthetic |

The migration is a one-time import. After that, the Sheet can be retired or kept read-only as a backup.

---

## 11. Settings

Everything Tracy might want to change without rebuilding.

**Vault structure**
- Boxes: add / remove / rename. Each box has color, schema, default sort.
- Tags (businesses): add / remove / rename. Multi-valued on items.

**Daily plan**
- Plan generation time (default 6:00 AM)
- Auto-regenerate when ADMIN changes? (default off)
- Stressor threshold in minutes (default 91)
- Default end-of-day time (default 4:30 PM)
- Plan doc style: typography, color, font sizes
- Show plan as DOCX export? (default off — the in-app view *is* the doc)

**Till**
- Tie-break preference for equal energy days (creative / problem-solving / leisure)
- Till item lifecycle: never expire / hide for N days after pull / etc.

**Capture**
- Default destination for new captures (default The Drop)
- Recent-category chips count (default 3)
- Confirmation style (toast / silent / haptic)

**Schedule behavior**
- Auto-adjust schedule when blocks complete/skip (default on) — see §6.5
- Show "now" line on schedule (default on)
- Pulse animation on active block (default on)
- Block-state captures actual times (default on) — needed for auto-adjust to work
- "Breathing room" insertion when ahead of schedule (default on)
- Overflow handling when behind: prompt vs silent push (default prompt)

**Optional features (off by default)**
- 500-hour budget tracking
- Stale-highlighting for items >N days old
- Activity log / who edited what
- DOCX export of the daily plan (preserves macOS xattr / custom icon, like today's pipeline)

**Privacy & sync**
- Account / auth method
- Data export (JSON / CSV)
- Soft-delete retention (default 30 days)

---

## 12. What we're explicitly NOT building

- **AI categorization** — Tracy said no. Smart defaults instead.
- **Notifications / badges / push reminders** — quietness is core.
- **Multi-user collaboration** — single-user app.
- **Native iOS / Android apps initially** — PWA covers it.
- **Calendar integration v1** — out of scope; revisit later.
- **Time tracking against tasks** — out of scope.
- **Subtasks / hierarchies** — single flat items. Tracy decomposes in the title text today; we don't change that.
- **Priority numbers beyond what's there** — Urgent / Must / today-order / Till-energy is enough.
- **Dependencies between tasks** — out of scope.
- **Multiple projects / workspaces** — one vault.

---

## 13. Tech stack proposal

Picked specifically so **Cursor** can read and modify the code with simple natural-language commands from Tracy. Every choice optimizes for AI legibility over cleverness.

- **Frontend:** Next.js 14+ (App Router) + TypeScript strict + Tailwind.
  - One file per concept. Plain types. No exotic patterns.
  - Server Components for layouts; Client Components for anything interactive — clearly marked with `'use client'`.
- **Backend:** Next.js Server Actions for mutations (simpler than API routes, single-file definitions). `/api/capture` route stays a route because the Apple Shortcut hits it.
- **Database:** Supabase (Postgres + auth). Tables: `items`, `boxes`, `tags`, `daily_plans`, `settings`. One row per concept; nothing fancy.
- **ORM-ish:** Supabase JS client directly. No Prisma / Drizzle / etc — fewer abstractions for Cursor to stumble on.
- **Forms:** plain HTML `<form>` + Server Actions where possible. React Hook Form + Zod only for forms that genuinely need it.
- **Auth:** Supabase magic-link email. Single user.
- **Hosting:** Vercel. Auto-deploys from GitHub on every push to `main`. Auto-builds preview URLs for every other branch.
- **iPhone capture endpoint:** `/api/capture` POSTs JSON `{title, box?, tags?}` with `Authorization: Bearer <personal-token>`. Token is stored in Vercel env vars + the Apple Shortcut.
- **Document rendering:** the daily plan is rendered as HTML/CSS that *looks* like the docx (Calibri-style fonts, red headings, paper background). Optional DOCX export uses `docx` npm library server-side.
- **Migration tool:** A one-shot script in `/scripts/import-sheet.ts` reads the current Sheet via the service account JSON and seeds Supabase.

### Why these choices help Cursor specifically

- **One language (TypeScript) everywhere** — no context-switching between Python/SQL/JS.
- **No code generation** — what's in the repo is what runs. No `generated/` folders, no codegen steps.
- **Files match URLs** — `app/today/page.tsx` is `/today`. Cursor doesn't have to chase routing config.
- **Server Actions co-locate UI + mutation** — when Tracy says "change how X gets saved," Cursor opens one file.
- **Plain Tailwind classes inline** — Cursor reads "what does this look like" by reading the JSX.
- **Comments describe WHY** — the WHAT is in the types and the names.

---

## 14. Customization, local testing, and deploy story

Tracy works in **Cursor**. The whole customization loop is built around Cursor doing the technical work in response to natural-language commands. Tracy never has to know what `git push` is.

### Layer 1 — In-app Settings (no code, no deploy, instant)

~80% of customization is data, not code. Editable from inside the app:

- Box names, colors, schemas (which fields each box exposes)
- Category labels and lists (per-box)
- Tags (businesses): add / remove / rename
- Section headings on the daily plan (`STRESSORS` → whatever)
- Stressor threshold (default 91 min)
- Plan generation time
- Default end-of-day, tie-break preferences
- Soft-delete retention period
- Most copy on screens

Stored in a single `settings` row in Supabase. Edits take effect immediately. No deploy, no code.

### Layer 2 — Cursor as the deploy interface

The repo ships with an `AGENTS.md` file (see §15) that tells Cursor how to interpret Tracy's natural-language asks. Tracy says things; Cursor does the technical work.

**Tracy's vocabulary → what Cursor does**

| Tracy says… | Cursor runs |
|---|---|
| *"Try this locally"* / *"Let me see it"* / *"Show me before I commit"* | `npm run dev` — opens `http://localhost:3000` |
| *"Show me on my phone"* / *"Try it on my phone"* | Pushes current changes to a `preview` branch — Vercel auto-builds a URL that works on any device |
| *"Ship it"* / *"Make it live"* / *"Push this live"* | `git add . && git commit -m '<auto message from Cursor>' && git push origin main` — Vercel auto-deploys to the live URL in ~60 sec |
| *"Undo my last change"* / *"Roll back"* | Either reverts the last commit, or in Vercel dashboard rolls back to previous deploy — Cursor picks based on whether change is committed |
| *"What did I change?"* | `git diff` — Cursor reads it back in plain English |
| *"Save my work"* | Commits but doesn't push — checkpoint without going live |
| *"Stop the local preview"* | Kills the dev server |

The point: **Tracy talks like a person; Cursor does the technical work. No vocabulary required.**

### Layer 3 — The local preview loop

The fastest iteration loop, for when Tracy wants to play before committing:

1. Tracy: *"Let me try changing the heading color to blue."*
2. Cursor: edits the file, then says *"Want me to start a local preview so you can see it?"*
3. Tracy: *"Yes."*
4. Cursor: runs `npm run dev` and opens `localhost:3000` in her browser.
5. Tracy looks at it. *"Make it a darker blue."*
6. Cursor edits, the dev server hot-reloads — she sees the change instantly.
7. Tracy: *"I like it. Ship it."*
8. Cursor: commits, pushes, confirms when Vercel build succeeds.

Total time from "I want to change something" to "it's live": **~2 minutes**, and Tracy never types a command.

### Layer 4 — Phone testing without committing

For changes Tracy wants to try on her phone before going live (especially capture-flow tweaks):

1. Tracy: *"Try this on my phone first."*
2. Cursor: pushes the working branch to GitHub as a feature branch (e.g. `try/blue-headings`).
3. Vercel auto-builds a preview URL like `vault-try-blue-headings.vercel.app`.
4. Cursor: gives Tracy the URL or opens it in her browser. She can text it to her phone.
5. Tracy tests on her iPhone. Likes it → *"Ship it."* / Doesn't → *"Go back to how it was."*

### Failure recovery

- Vercel keeps every previous deploy. One Cursor command rolls back.
- Every commit is a recoverable checkpoint.
- A change that breaks the live site can be rolled back in <30 seconds without redeploying.

### What Tracy never has to do

- Run a terminal command directly
- Install Node, npm, or any CLI
- Type `git`, `npm`, or `vercel`
- Deal with environment variables (Rachel sets up once)
- Manage branches manually
- Read a build error
- Fight with merge conflicts (single-branch + single-user)

---

## 15. The `AGENTS.md` instruction file

The repo ships with `AGENTS.md` (drafted alongside this spec — see [AGENTS.md](AGENTS.md)) that tells Cursor how to interpret Tracy's plain-English commands. This file is the bridge between her and the technical work. It covers:

- Plain-English vocabulary mapping (what "ship it" means, what "show me on my phone" means, etc.)
- Things Tracy never has to know (git, npm, env vars, stack traces, etc.)
- How to talk back to her (no jargon, summarize don't paste)
- Repo conventions (file structure, naming, no-new-abstractions rule)
- The data model and daily-plan logic that Cursor must not drift from

Keeping `AGENTS.md` up to date is part of the project. When Tracy says "I always say X but you don't know what I mean," that's a sign to add a row to the vocabulary table.

---

## 16. MVP / phasing

**v0.1 (~1 week of build)** — the smallest thing Tracy can use end-to-end.
- Today view (the doc, generated from seed data)
- Mail slot (capture)
- The Drop + The Docket + The Till (the three Counter stations)
- Daily plan generation logic ported from `plan_day.py`
- Soft delete
- Web + phone (PWA)

**v0.2 (~1 week)**
- All 14 boxes migrated from the Sheet
- Drawer view with filter chips for the Apps Script button equivalents
- Universal search
- Settings: stressor threshold, plan generation time, tie-break preference

**v0.3 (~1 week)**
- PCS IDEAS richer schema (5-col)
- Tags / businesses
- DOCX export (optional)
- Recent-categories chips on capture

**v1.0**
- Saved views
- Stale-highlighting
- Activity log
- 500-hour budget tracking (opt-in)

Past v1.0 is intentionally vague — see how Tracy uses v0.x first.

---

## 17. Open questions before build starts

1. **Metaphor confirmation** — is "Till" the right replacement for MENU? Fallbacks: "Float" or "Today's Pull."
2. **Why-the-Sheet** — what specifically was familiar about the Sheet? Determines whether the in-app doc view should be cell-grid-editable or paragraph-style. Default assumption: paragraph-style doc.
3. **iPhone model** — does Tracy have an iPhone 15 Pro / Pro Max / 16 (any)? Determines whether the Action Button capture flow is viable in v0.2 or has to wait. PWA and Siri Shortcut work on any iPhone.
4. **Domain & hosting account** — Vercel + Supabase free tiers cover everything we need, but we need an account for each in Tracy's name (or a shared admin account) so she's not locked out of her own infrastructure.

Everything else can ship as a default and be tuned in Settings.
