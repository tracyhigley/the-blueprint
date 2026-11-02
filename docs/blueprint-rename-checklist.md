> **Status (Nov 2026): rename completed.** The database (`vaults` → `blueprints`, `vault_id` → `blueprint_id`, `vault_members` → `blueprint_members`), code, repo (`the-blueprint`), Vercel project and live URL (tracy-blueprint.vercel.app) have all been renamed. Kept as a record of the old → new terms.

# Vault → Blueprint: terminology to reevaluate

Working checklist for the rename. Grounded in the actual shipped app (`AGENTS.md` glossary + live pages), not just `SPEC.md` — the spec drifted from what's actually live in a few places (noted below). Go through in any order, a few at a time; just tell me which rows you've decided and what to call them.

For each row: **current wording** → **your call**. Leave blank until decided.

---

## 1. Brand / identity

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 1.1 | "The Vault" (system name) | `app/layout.tsx` page title, `app/manifest.ts` name+description, top bar logo (`top-bar.tsx`), login page, onboarding placeholder, README title | |
| 1.2 | "a place for everything" | manifest description | |
| 1.3 | Vault door/dial mark (`vault-mark.tsx`, `vault-dial.tsx`) — literal graphic, not text | logo + sealed-screen art | *(visual, not wording — flag if you want a new icon concept)* |

## 2. The four "counter station" surfaces (core rename)

These are the biggest, most-referenced terms. Note: your `SPEC.md` names these Docket/Till/Drawer, but the **live app** actually calls them Today/ATM/Counter — decide based on what's shipped, not the old spec.

| # | Current (live app) | What it actually is | Where it lives | New wording |
|---|---|---|---|---|
| 2.1 | "The Drop" / Drop | Untriaged inbox | `/drop` page heading, nav label, `drop-triage-row.tsx`, `drop-keyboard-controller.tsx`, box key `DROP` | |
| 2.2 | "Today" (nav label) / "The Docket" (internal name, `app/page.tsx` comment) | Today's timed schedule, home page | `/` nav label, `docket-schedule.tsx`, `docket-day-range.tsx`, box key `DOCKET` | |
| 2.3 | "The ATM" | Energy-matched optional pulls (was "Till"/"MENU" in earlier docs) | `/atm` page heading, nav label "ATM", `atm-pick-button.tsx`, `atm-category-sortable-list.tsx`, `new-atm-item-row.tsx`, box key `ATM` | |
| 2.4 | "The Counter" | Obligations / admin (urgent+must filtering) — confusingly, this is what `SPEC.md` called "The Drawer"; `SPEC.md`'s "Counter" meant the whole 4-station zone | `/counter` page heading "The Counter", nav label, `counter-sectioned-lists.tsx`, `counter-done-button.tsx`, `new-counter-item-row.tsx`, box key `COUNTER` | |
| 2.5 | "Withdraw" | Verb for pulling an ATM item onto today (per `AGENTS.md` glossary; may not appear as literal button text right now — mostly a "+TODAY" toggle) | AGENTS.md glossary, spoken vocabulary | |
| 2.6 | "+ TODAY" toggle | Universal "add to today's plan" flag | Counter page, ATM page, build wizard step 5 | |

## 3. Storage zones

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 3.1 | "The Boxes" / "Deposit boxes" / "a box" | `/vault` page heading "The Boxes", `/vault/[box]`, `vault-boxes-section.tsx`, `box-card.tsx`, `box-storage-list.tsx`, `boxes-editor.tsx`, Settings → Boxes | |
| 3.2 | "Documents" | `/documents`, `/documents/[slug]`, `/documents/folders/[folder]`, Settings → Documents — this one's already generic/non-vault, may not need a change | |
| 3.3 | "Energies" | Settings → Energies, `energies-editor.tsx` — also generic, probably fine as-is | |
| 3.4 | "The Vault" as the storage interior itself (browse view) | `/vault` route/page — separate from "The Vault" as whole-app name (§1.1); these two uses currently share one word | |

## 4. Capture ("mail slot" system) — ✅ done

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 4.1 | "Deposit" (verb, button label) | `/deposit` page, ⌘K modal, capture button labels, `lib/actions.ts` comment | **Add** — button reads ADD, function renamed `depositText` → `addFieldNote` |
| 4.2 | "Mail slot" | ⌘K modal (`cmd-k.tsx`), `/deposit` eyebrow text, `sealed-screen.tsx`, `shortcuts.tsx`, `global-shortcuts.tsx`, AGENTS.md glossary | Dropped the separate object metaphor — surfaces are just called "Field Notes" / "quick-add" now |
| 4.3 | "Drop in Vault" | Bookmarklet/Shortcut label text, Raycast script title (`connect-device-cards.tsx`) — several literal copies of this exact phrase for different devices | **Add to Field Notes** (already shipped from the Field Notes rework; `scripts/apple-shortcut.md` brought in line) |
| 4.4 | "Deposit slot" | Sealed-screen placeholder text ("Deposit slot still works while sealed…") | "Adding field notes still works" |

Route `/deposit` and internal values (box key `DROP`, `source: "mailslot"` enum) left unchanged — renaming those risks breaking already-installed bookmarklets/Shortcuts and is covered by §10 anyway.

## 5. Morning ritual

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 5.1 | "Build the day" / "Build today" / "BUILD TODAY" / "BUILD THE DAY" | `/build` wizard, `build-wizard.tsx`, `build-prompt-greeting.tsx`, home page CTA | |
| 5.2 | "What's heavy" (wizard step 5 label, per AGENTS.md glossary) | build wizard | |

## 6. End-of-day ritual ("Sealed")

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 6.1 | "Sealed" / "Seal it" / "Close the vault" | `/sealed` page, `seal-toggle.tsx`, `sealed-screen.tsx`, nav lock icon | |
| 6.2 | "Everything's safe. You can stop carrying it." | Sealed screen headline | |
| 6.3 | "— The Vault is closed —" / "— The Vault is open —" | Sealed screen sub-line | |
| 6.4 | "OPENS TOMORROW" | Sealed screen footer | |
| 6.5 | "LOCKED" / "OPEN" (dial label) | `vault-dial.tsx` | |
| 6.6 | "OPEN VAULT NOW" / "PEEK INSIDE" (per SPEC — verify these are live) | Sealed screen actions | |
| 6.7 | "Unseal" / "unsealed" | `unseal-glow.tsx`, route params `?just=sealed`/`?just=unsealed` | |

## 7. Schedule / task microcopy

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 7.1 | "Still safe in your vault" / "the item stays in your vault" | `schedule-block.tsx` toast + tooltip on marking done | |
| 7.2 | "Stressor" | Classification label (urgent+must), `schedule-block.tsx`, `docket-schedule.tsx`, Settings (stressor threshold) | |
| 7.3 | "OVERFLOW" / "TRIM COUNTER →" | `docket-schedule.tsx` overflow banner | |
| 7.4 | "DONE TODAY" / "CLEAR ALL DONE" / "MARK NOT DONE" | `docket-schedule.tsx` | |
| 7.5 | "SKIPPED TODAY" / "MOVE BACK TO TODAY" | `docket-schedule.tsx` | |
| 7.6 | "DRAG ⋮⋮ TO REORDER TODAY" | `docket-schedule.tsx` | |
| 7.7 | "Filed" (done state, per SPEC — verify still used anywhere) | conceptual, may already be superseded by "done"/"state" language | |

## 8. Membership / settings copy

| # | Current | Where it lives | New wording |
|---|---|---|---|
| 8.1 | "Vault membership" / `vault_id` | Settings → Members page | |
| 8.2 | "Add The Vault to your home screen" / "Dock The Vault as a desktop app" | `connect-device-cards.tsx` | |
| 8.3 | "Connect The Vault to your iPhone and Mac…" | `/settings/connect` intro copy | |
| 8.4 | "Your boxes are the categories you file thoughts into from The Drop…" | `/settings/boxes` intro copy | |

## 9. Visual/aesthetic language (optional — separate decision from wording)

Not text to reword, but the whole color/material vocabulary is vault-themed and you may want it to shift with the metaphor:

| # | Current | Notes |
|---|---|---|
| 9.1 | Brass, rust, patina accent colors (Tailwind tokens, `vault-panel`/`vault-line`/`vault-bg` CSS classes in `globals.css`) | Could become blueprint-blue / graphite / chalk-line if you want the palette to follow the rename |
| 9.2 | Parchment/brass-edged card styling | Same — cosmetic, not urgent |
| 9.3 | Vault dial + door illustration (sealed screen, logo) | Would need new artwork if the metaphor fully shifts |

## 10. Routes / URLs (code-level, not visible copy but worth deciding together)

`/vault`, `/vault/[box]`, `/drop`, `/counter`, `/atm`, `/sealed`, `/deposit`, `/build`, `/settings/boxes` — renaming these is optional (URLs aren't very visible in a PWA) but should be decided once so file/component names match. I'd handle this as a batch once the words above are locked in, not one at a time.

## 11. Docs that reference the old terminology

These describe the app rather than being the app — update after the live wording is settled, so they don't fight each other:

- `docs/SPEC.md` — already has some outdated names vs. the live app (see §2 above); worth a pass regardless of the rename.
- `docs/interview.md`
- `README.md`
- `AGENTS.md` — **this one matters most operationally**, since it's the file that tells Cursor/Claude how to interpret your plain-English commands ("deposit X," "seal it," etc.). Its glossary table needs to be rewritten to match whatever new vocabulary you land on, or future coding help will keep defaulting to vault language.

---

**How to use this:** tell me a row number or a group of them (e.g. "let's do 2.1–2.4" or "1.1 and 6.2") plus your new word, and I'll make just those changes.
