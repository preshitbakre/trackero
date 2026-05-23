# Trackero — Design System

> **Single source of truth for Trackero's visual design.** Read this before any UI work
> and follow it. If a rule here ever conflicts with code, the code review decides —
> then update this file.

---

## 1. Design principles

Trackero's look is **editorial, deliberate, and ink-on-paper** — depth comes from light
and shadow, brand comes from typography and lilac.

- **Editorial typography carries the brand.** A serif italic display face on top of a
  clean sans-serif body. Headlines lean into the italic; numbers and figures may go
  serif for character.
- **Lilac + ink + paper.** A small primary palette: lilac for action, ink for surface
  contrast, paper for the page. Four legacy hues encode meaning (status, priority,
  type) — never decoration.
- **Depth, not flatness.** Elevation is expressed with `box-shadow`. Visible borders are
  the exception, not the default.
- **Explicit control.** Font sizes and key dimensions are set in explicit pixels, never
  via framework-named size classes.
- **One component for one job.** Every input, button, dialog, and notification comes from
  a shared component. Raw HTML form/control elements are not used.

The canonical visual reference is `docs/Trackero _standalone_.html` — open it in a
browser to see all 14 frames. The captured-state screenshots `frame-00…frame-13.png`
sit at the repo root.

---

## 2. Colour system

All colours live in `frontend/src/lib/colors.ts`. **Import from there — never redefine
colour constants locally.** For badges and avatars, apply colours via inline styles to
guarantee exact values.

### 2.1 Editorial brand tokens (the primary palette)

| Name | Hex | Used for |
|---|---|---|
| Paper | `#FAF8FD` | Page background — lilac-tinted off-white |
| Card | `#FFFFFF` | Card / panel surface |
| Cream | `#FAF7F2` | Sidebar background — warm cream |
| Ink | `#1A1424` | Hero block background, primary text on light |
| Lilac | `#7C3AED` | Primary action colour, brand accent |
| Lilac dark | `#6326D6` | Lilac active state |
| Lilac tint | `#EFE7FD` | Selected row / hover background |
| Mute | `#6B6377` | Secondary text |
| Faint | `#A8A1B5` | Tertiary text / placeholder |
| Rule | `#E8E3F0` | Dividers, faint borders |

Primary action colour is **lilac `#7C3AED`** (not the legacy peri-dark). Hero blocks
(Login left panel, marketing call-outs) use **ink `#1A1424`**.

### 2.2 Legacy palette — kept to encode meaning

| Name | Hex | Used for |
|---|---|---|
| Tan | `#D6B588` | In-progress status, medium priority, warm accents |
| Mint | `#88D68E` | Done status, success |
| Peri | `#88A9D6` | Todo status, low priority |
| Orchid | `#D688D0` | In-review status, story type |

Each has light tints (`-light`), dark variants (`-dark`), and dark-mode versions
(`-dm`) in the CSS theme. **Do not use these for decoration.** They encode state;
that's their job.

### 2.3 Semantic colours (from `lib/colors.ts`)

**Priority** — `PRIORITY_BADGE_COLORS` / `PRIORITY_BORDER_COLORS` / `PRIORITY_DOT_COLORS`:
`urgent #E05252` · `high #E88A48` · `medium #D6B588` · `low #88A9D6` · `none #A8A1B5`

**Status** — `STATUS_BADGE_COLORS` (each has `bg`, `color`, `dot`):
`backlog` · `todo` · `in_progress` · `in_review` · `done` · `cancelled #E05252`

**Work-item type** — single-letter coloured square tags (`T B S E`):
`task` slate · `bug` red · `story` orchid · `epic` lilac. See `TYPE_TAG_BG` and
`TYPE_ICON_COLORS`.

**Avatars** — `AVATAR_COLORS` rotates lilac → orchid → peri → mint → tan.

**Project dots** — `PROJECT_DOT_COLORS` rotates lilac → peri → mint → tan → orchid.

---

## 3. Typography

The brand is carried by an **editorial serif** used for display headings and numeric
flourish, alongside a clean sans-serif for body and UI text.

| Family | Stack | Where |
|---|---|---|
| Serif (display) | `'Iowan Old Style', Georgia, Charter, 'Times New Roman', serif` | Page titles, hero numbers, italic flourishes |
| Sans | `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Body, labels, table contents, buttons |

Apply the serif via the `font-serif` or `font-display` Tailwind utility (mapped to the
serif stack in `@theme`). Add `italic` for the editorial italic flourish.

All text sizes are explicit pixels: **`text-[Npx]`**. **Never** use `text-xs`, `text-sm`,
`text-lg`.

| Role | Size | Notes |
|---|---|---|
| Hero display (Login, marketing) | `text-[48px]` to `text-[64px]` | Serif italic, weight 400 |
| Page title | `text-[28px]` to `text-[36px]` | Serif italic on emphasized page (`Backlog`, `Settings`) |
| Section heading | `text-[18px]` to `text-[22px]` | Serif when leading a section, sans when inside a card |
| Body / default | `text-[14px]` to `text-[16px]` | Sans |
| Eyebrow / kicker | `text-[11px]` | Sans, uppercase, letter-spaced `tracking-widest` |
| Metric (big number) | `text-[28px]` to `text-[48px]` | Serif italic, no separator |
| Structural minimum (anything you can read as a sentence) | `text-[14px]` | Sans |
| Small UI affordances (badge text, table headers, avatar initials) | `text-[9px]`–`text-[13px]` | Sans |

**Read-as-a-sentence text is never below 14px.** Body copy, labels, button text, field
labels, descriptions, comment bodies, list items — all 14px or up.

---

## 4. Elevation & borders

**Cards, panels, dropdowns, and elevated surfaces use `box-shadow` for depth — never a
visible border.** Global CSS auto-applies a shadow to rounded white / card surfaces.

Borders are allowed **only** on: form inputs, table row dividers (`border-b`/`border-t`),
focus rings, danger-zone red borders, and toast left bars (`border-l-4`).

Layout shadow tokens:

| Element | Shadow |
|---|---|
| Sidebar | `shadow-[4px_0_12px_rgba(26,20,36,0.04)]` |
| Header | `shadow-[0_1px_0_rgba(232,227,240,1)]` (1px rule under header) |
| Drawer | `shadow-[-8px_0_24px_rgba(26,20,36,0.10)]` (left-side) |
| Cards | `0 1px 3px rgba(26,20,36,0.04), 0 8px 24px rgba(26,20,36,0.06)` (auto-applied) |

---

## 5. Sizing

- **Inputs:** minimum height **32px**.
- **Buttons:** height always **32px**. Padding `px-3` (sm) / `px-4` (md).

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

Height **32px**. Variants: `primary` (lilac bg, white text), `secondary` (card bg, ink
text, rule border), `danger` (red), `ghost` (transparent, lilac-tint on hover),
`success` (mint-dark). Sizes: `sm` (`px-3`, 13px text) and `md` (`px-4`, 14px text).
All create buttons read **`+ Create [Thing]`**.

---

## 7. Dialogs & feedback

- **Destructive actions** → `<ConfirmDialog>` (state toggle, rendered via portal).
- **Messages** → `toast()` — a floating, auto-dismissing (3s) notification.
- **Never** use browser `confirm()` / `alert()`.

---

## 8. Layout chrome

The application chrome consists of a **TopBar** and a **Sidebar** anchored by the
`AppShell` component.

**TopBar (height 56px):**
- Left: Project switcher pill — `B Backstage v BST · 24 members`. Tap → switcher
  dropdown (frame 02).
- Centre: `trackero.` wordmark (lilac period) · `|` rule · breadcrumb
  (`Backstage / Board`).
- Right: `Jump to anything…  ⌘K` search button → opens command palette · notification
  bell · avatar menu.

**Sidebar (width 240px):**
- WORK section: `Today · Board · Backlog · Sprints · Epics · Charts · Retro`.
- PROJECT section: `Members · Settings`.
- Footer card: `CURRENT SPRINT — Sprint 27 · d4/10`, progress bar, `14/38 DONE · MAY 30`.
- The sidebar background is **cream `#FAF7F2`**, the active item is **lilac-tint
  `#EFE7FD` with lilac-dark text `#6326D6`**.

**Drawer:** Task detail opens as a right-side drawer at `width 720px` (clamped to
viewport).

---

## 9. Anti-patterns — do not do these

- ❌ Raw `<input>`, `<select>`, `<textarea>`, `<button>` — use the shared components.
- ❌ `text-xs` / `text-sm` / `text-lg` and other named size classes.
- ❌ Any read-as-a-sentence text below 14px.
- ❌ Visible borders on cards, panels, or dropdowns.
- ❌ Local colour constants — import from `lib/colors.ts`.
- ❌ Browser `confirm()` / `alert()` or inline toasts.
- ❌ Peri-blue or mint backgrounds for the page — paper (`#FAF8FD`) is the page.
