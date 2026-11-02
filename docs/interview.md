> **Historical document.** Written when this app was called "The Vault". The app is now **The Blueprint**, and the vault terminology, routes, and some features described here no longer exist. See `AGENTS.md` for current names and structure.

# The Vault — Interview Kit

**Subject:** Tracy
**Status:** Most architectural questions answered. One open question remains.

---

## ✅ Answered

### 1. The "done" gesture
- **Today**: delete (uses the `deleterow` macro).
- **Tracy's note**: "doesn't need to be that way" — she's open to a different default.
- **Build implication**: default to delete, but make it recoverable / soft-delete under the hood. A future archive view is on the table but not required for v1. Don't force the change; design so it can grow in.

### 2. Mid-day capture surface
- **Phone capture is required.** Not a nice-to-have.
- **Build implication**: the app must work on phone for at least *entry*. Web app (no install) is the path of least friction.

### 3. The daily plan artifact
- **The morning-generated daily plan doc is how Tracy mostly looks at tasks today.** It's not legacy; it's the primary surface.
- **Build implication**: this isn't an "export" feature — it's the centerpiece. Whatever we build, the daily plan view *is* the home. The vault tabs / sheet behind it become storage/capture, not the place she lives.

### 4. AI categorization
- **No AI.**
- **Build implication**: manual entry, but with smart defaults (last-used category, recent time estimates, recently-edited area code) so it feels effortless without being magic.

### Cross-cutting requirements (Tracy's words)
- **"Accessible anywhere"** → web app, phone + desktop + tablet, no install.
- **"Feels familiar"** → looks like a doc/plan she already knows (Calibri-style typography, headings, paper aesthetic). Not a kanban board, not a novel-looking task app. Closer to *Word doc* or *Google Doc* than to *Linear*.

---

## ⏳ Still open

### 5. The rejection list — what other apps got wrong
This one still matters because it shapes anti-requirements. *Why a Google Sheet and not Notion / Todoist / Things / Apple Reminders / Linear?*

Specifically, what is "familiar" pointing at? The Sheet is familiar in a few different ways at once:
- **Document-shaped** — rows, columns, no app-y chrome
- **Editable everywhere** — type into any cell, no forms
- **Yours forever** — your data, no platform lock
- **Plain text feel** — no rich UI, no animations

If we know which of those was load-bearing, it sharpens the design.

---

## Two cold async prompts (good even if you skip the live convo)

> **A. Morning forensics**
> Walk me through what you actually did between 7:00 and 9:30 this morning, minute by minute, including the parts you're a little embarrassed by. Don't edit it.

> **B. The done moment**
> What does it feel like the moment a task becomes "done"? Where do you put it, what do you tell yourself, and is there anything you wish happened that doesn't?

---

## Settings (not interview questions — defaults we'll pick)

- Businesses, tabs, categories — flexible tags, add/remove/rename.
- Budget tracking (500-hour year) — opt-in toggle, off by default.
- The 91-minute stressor threshold — adjustable.
- Two "today" mechanisms (column D ordering vs. morning doc) — both supported; doc is primary per Tracy's answer.
- Notification cadence, time defaults, etc.

---

## What we already know

- 14 tabs in the Sheet, all schemas documented. ADMIN: A=Area, B=minutes, C=Urgent, D=Today's order #, E=Must, F=description.
- "Done" in ADMIN = `deleterow` macro deletes. No archive today.
- C1/D1 are filter-toggle checkboxes (Urgent / Today's).
- 14 buttons in [macros.gs](macros.gs): all, ByTime, ByDrawer, per-category, urgent, TodaysOrder, must, All5to15, stress, deleterow.
- Lock tab = vault-door home-page art, not functional.
- `plan_day.py` rules: U+M=stressors, U=time-sensitive, M=must-do, neither=other. Energy-matched MENU. Stressor anchoring at 91 min.
- Notes manifesto: "container," URGENT-vs-IMPORTANT, morning window, 500-hour year split 40/96/120/246.
- Tracy runs ~8 concurrent businesses; treat business as a flexible tag.
