# Trackero — Design System

> **Single source of truth for Trackero's visual design.** Read this before any UI work
> and follow it. It consolidates rules previously scattered across eight separate notes.
> If a rule here ever conflicts with code, the code review decides — then update this file.

---

## 1. Design principles

Trackero's look is **fresh, peppy, and soft** — depth comes from light and shadow, not
from hard lines.

- **Depth, not flatness.** Elevation is expressed with `box-shadow`. Visible borders are
  the exception, not the default.
- **A small, deliberate palette.** Exactly four brand colours, chosen once. No ad-hoc
  shade scales, no local colour constants.
- **Explicit control.** Font sizes and key dimensions are set in explicit pixels, never
  via framework-named size classes.
- **One component for one job.** Every input, button, dialog, and notification comes from
  a shared component. Raw HTML form/control elements are not used.

> ⚠️ Honest note: this system is intentionally soft and pastel. If UI feedback is
> "bland / flat", revisit this section first — the fix may be the *system*, not the
> execution. Use the `ui-ux-pro-max` skill to explore a bolder direction before editing
> the values below.

---

## 2. Colour system

All colours live in `frontend/src/lib/colors.ts`. **Import from there — never redefine
colour constants locally.** For badges and avatars, apply colours via inline styles to
guarantee exact values.

### 2.1 Brand palette (tetradic — exactly 4)

| Name | Hex | Used for |
|---|---|---|
| Tan | `#D6B588` | In-progress status, medium priority, story points, warm accents |
| Mint | `#88D68E` | Done status, success, completed sprint, normal workload |
| Peri | `#88A9D6` | Todo status, low priority, links, buttons, active states |
| Orchid | `#D688D0` | In-review status, story type, retro "to improve", notification accents |

Each has light tints (`-light`), dark variants (`-dark`), and dark-mode versions (`-dm`)
in the CSS theme. Primary action colour is **peri-dark `#3F5E8E`**.

### 2.2 Layout colours

| Surface | Hex | Notes |
|---|---|---|
| Sidebar background | `#FAF7F2` | Warm cream (a dark sidebar was rejected) |
| Page background | `#F2F9F3` | Faint mint green — set on `AppShell` |
| Header background | `#DFF0E0` | Pista green, slightly darker than the page |
| Sidebar text | `#5C5650` / `#7E7770` | On cream |
| Sidebar active item | bg `#88A9D618`, text `#3F5E8E` | Peri tint |

Project dots rotate peri → mint → tan → orchid. Logo lives in the header (left); the
sidebar has no logo. The drawer starts below the header (`top: 3.5rem`).

### 2.3 Semantic colours (from `lib/colors.ts`)

**Priority** — `PRIORITY_BADGE_COLORS` / `PRIORITY_BORDER_COLORS`:
`urgent #E05252` · `high #E88A48` · `medium #D6B588` · `low #88A9D6` · `none #D1CCC7`

**Status** — `STATUS_BADGE_COLORS` (each has `bg`, `color`, `dot`):
`backlog` · `todo` · `in_progress` · `in_review` · `done` · `cancelled #E05252`

**Work-item type** — `TYPE_ICONS` / `TYPE_ICON_COLORS`:
`task ○ #A8A19A` · `bug ● #E05252` · `story ◆ #D688D0`

**Avatars** — `AVATAR_COLORS` rotates peri → orchid → mint → tan.

---

## 3. Typography

All text sizes are explicit pixels: **`text-[Npx]`**. **Never** use `text-xs`, `text-sm`,
`text-lg`, etc. (A global 20% size bump was applied 2026-05-19; the scale below is
post-bump.)

| Role | Size |
|---|---|
| Minimum text (smallest allowed) | `text-[14px]` |
| Small metadata (table headers, badges) | `text-[14px]` |
| Body / default | `text-[16px]` |
| Section heading | `text-[18px]` |
| Page title | `text-[22px]` |
| Large heading | `text-[28px]` |

Nothing renders below **14px**.

---

## 4. Elevation & borders

**Cards, panels, dropdowns, and elevated surfaces use `box-shadow` for depth — never a
visible border.** Global CSS auto-applies a shadow to `[class*="rounded"][class*="bg-white"]`.

Borders are allowed **only** on: form inputs, table row dividers (`border-b`/`border-t`),
focus rings, danger-zone red borders, and toast left bars (`border-l-4`).

Layout shadow tokens:

| Element | Shadow |
|---|---|
| Sidebar | `shadow-[4px_0_12px_rgba(0,0,0,0.06)]` (replaces `border-r`) |
| Header | `shadow-[0_4px_12px_rgba(0,0,0,0.06)]` (replaces `border-b`) |
| Drawer | `shadow-[-8px_0_24px_rgba(0,0,0,0.08)]` (left-side) |
| Cards | `shadow-sm` / `shadow-md` / `shadow-lg` or custom `rgba` shadows |

---

## 5. Sizing

- **Inputs:** minimum height **30px**.
- **Buttons:** height always **30px**.

---

## 6. Component library

**Never use raw HTML form/control elements.** Always use the shared components.

### UI controls — `frontend/src/components/ui/`

| Need | Component |
|---|---|
| Text / email / search | `Input` |
| Password | `PasswordInput` |
| Number | `NumberInput` |
| Story points | `StoryPointsInput` |
| Multi-line text | `Textarea` |
| Dropdown | `Select` |
| Searchable dropdown | `Combobox` |
| Action button | `Button` |
| Label chip / picker | `LabelBadge` / `LabelPicker` |

### Common components — `frontend/src/components/common/`

`ConfirmDialog` · `Toast` · `Tooltip` · `Drawer` · `RoleGate` · `AssigneeMultiSelect` ·
`CommandPalette` · `CreateItemDialog` · `CreateProjectDialog` · `ErrorState` ·
`ReadOnlyBanner` · `SaveStatusIndicator` · `ShortcutsHelp` · `Skeleton`

### Button — `components/ui/Button.tsx`

Height **30px**. Variants: `primary` (peri-dark `#3F5E8E` bg, white text), `secondary`
(gray), `danger` (red), `ghost` (transparent), `success` (mint). Sizes: `sm` (`px-2`,
14px text) and `md` (`px-4`, 16px text). All create buttons read **`+ Create [Thing]`**
(e.g. "+ Create Task").

---

## 7. Dialogs & feedback

- **Destructive actions** → `<ConfirmDialog>` (state toggle, rendered via portal).
- **Messages** → `toast()` — a floating, auto-dismissing (3s) notification:
  `toast('Saved')` green · `toast('Heads up', 'warning')` yellow · `toast('Failed', 'error')` red.
- **Never** use browser `confirm()` / `alert()`, and **never** inline-toast patterns
  (`useState` + `<span>` on the page, `setToast`, `showToast`, `{toast && <div>}`).
  API responses surface as floating popups, not page text.

---

## 8. Anti-patterns — do not do these

- ❌ Raw `<input>`, `<select>`, `<textarea>`, `<button>` — use the shared components.
- ❌ `text-xs` / `text-sm` / `text-lg` and other named size classes.
- ❌ Any text below 14px.
- ❌ Visible borders on cards, panels, or dropdowns.
- ❌ `border-r` on the sidebar or `border-b` on the header — use the shadow tokens.
- ❌ Local colour constants — import from `lib/colors.ts`.
- ❌ Browser `confirm()` / `alert()` or inline toasts.

---

## 9. Extending the system

This is a *living* document, but the palette and core rules were chosen deliberately —
do not change them casually. To explore a new or bolder direction, run the
`ui-ux-pro-max` skill, capture the proposal, and only then revise this file with a
conscious decision. Keep `lib/colors.ts` and this document in sync.
