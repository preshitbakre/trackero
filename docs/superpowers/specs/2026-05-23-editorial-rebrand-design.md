# Trackero — Editorial rebrand & responsive frontend

**Spec date:** 2026-05-23
**Source of truth:** `docs/Trackero _standalone_.html` (14-frame design canvas)
**Capture artifacts:** `frame-00-brand.png` … `frame-13-instance-users.png` at repo root

---

## 1. Why this exists

The current Trackero UI is a peppy pastel palette (mint page background, peri-blue
primary, soft cream sidebar). The new design canvas takes a completely different visual
direction: editorial, lilac + ink + off-white, big serif italic display type, vibrant
purple primary, ink-black hero blocks. `DESIGN.md` itself flags the risk that the current
system reads "bland / flat" — the new direction is the fix.

This spec captures the new direction and the work needed to land it across the frontend.

---

## 2. The new direction (what the design says)

### 2.1 Palette

| Token | Hex | Role |
|---|---|---|
| `--color-paper` | `#FAF8FD` | Page background (lilac-tinted off-white) |
| `--color-card` | `#FFFFFF` | Card / panel background |
| `--color-cream` | `#FAF7F2` | Sidebar background (kept from current) |
| `--color-ink` | `#1A1424` | Hero / ink-black background, primary text on light |
| `--color-lilac` | `#7C3AED` | Primary action color, brand accent |
| `--color-lilac-tint` | `#EFE7FD` | Lilac active-state background, hover tints |
| `--color-text` | `#1A1424` | Body text |
| `--color-mute` | `#6B6377` | Secondary text |
| `--color-faint` | `#A8A1B5` | Tertiary text / placeholder |
| `--color-rule` | `#E8E3F0` | Dividers, subtle borders |

Status, priority, and work-item-type colours are **kept** (they already encode meaning).
Avatar rotation moves to: lilac → ink-warm → peri → orchid.

### 2.2 Typography

| Role | Family | Size | Weight |
|---|---|---|---|
| Display (hero) | Editorial serif (`Georgia, "Iowan Old Style", "Charter", serif`) — italic | 48–72px | 400 |
| Page title | Editorial serif | 36px | 400 (italic for emphasis) |
| Section heading | Editorial serif | 22px | 400 |
| Body | System sans | 14–16px | 400 |
| Eyebrow / kicker | System sans, uppercase, letter-spaced | 11px | 600 |
| Metric (big number) | Editorial serif italic | 28–48px | 400 |

The system sans stack stays unchanged. **The serif is new** — it carries the brand.

### 2.3 Elevation

`box-shadow` only — no borders on cards. Hover lifts cards slightly. The cream sidebar
shadow and ink-black header rule stay.

### 2.4 Layout chrome

**Top bar** (frame 03, frame 04, frame 07, etc.):
- Project switcher pill on the left: `B Backstage v BST · 24 members` (chevron opens
  switcher dropdown — frame 02)
- Trackero wordmark + breadcrumb in the centre: `trackero. | Backstage v / Board`
- `Jump to anything…  ⌘K` button (right of centre)
- Notification bell

**Sidebar** (frames 02, 03, 04, 07, 08, 09, 12):
- WORK section: Today (home), Board, Backlog, Sprints, Epics, Charts, Retro
- PROJECT section: Members, Settings
- CURRENT SPRINT footer card: `Sprint 27 · d4/10`, progress bar, `14/38 DONE · MAY 30`

**Frame title bar** (the top strip with `B Backstage` on the left and the frame title
in the middle of `dc-card`):
- This belongs to the design canvas chrome, **not** the Trackero app. We do not render it.

### 2.5 Work-item type tags

Single-letter coloured squares: `T` task (slate), `B` bug (red), `S` story (orchid),
`E` epic (lilac). Consistent across board cards, backlog rows, task detail.

---

## 3. Frames captured (target screens)

| Frame | Maps to | Status |
|---|---|---|
| Brand · cover | mood board only | not built |
| Today · signature moment | `DashboardPage` / "Today" | rebuild |
| Project switcher | sidebar dropdown | new component |
| All projects · directory | new "All projects" route | new page |
| Board · Sprint 27 | `BoardPage` | rebuild |
| Cmd-K · command palette | `CommandPalette` | restyle |
| Task detail · BST-104 | `TaskDetailPanel` (drawer) | restyle |
| Backlog | `BacklogPage` | rebuild |
| Sprint planning | `SprintPlanningPage` | rebuild |
| Retrospective | `RetroPage` | rebuild |
| Login · split editorial | `LoginPage` | rebuild |
| First-run · admin setup | `RegisterPage` | rebuild |
| Project settings | `ProjectSettingsPage` | rebuild |
| Instance · users | `SettingsPage` (admin) | rebuild |

---

## 4. Implementation strategy

A pure top-down rewrite of 11K lines of TSX is not realistic in one session. The strategy:

**Phase 1 — Tokens (broad reach, low risk).** Update `colors.ts`, `index.css`
`@theme`, and `DESIGN.md`. Old token names like `peri`, `tan`, `mint`, `orchid` stay as
aliases so existing class names keep compiling, but the visual values shift to the new
palette. The lilac primary replaces peri-dark.

**Phase 2 — Layout shell.** Rewrite `TopBar.tsx` (project switcher pill, wordmark,
breadcrumb, jump-to-anything, bell) and `Sidebar.tsx` (WORK/PROJECT sections, current
sprint footer card). This change is visible on every page.

**Phase 3 — Headline pages.** Rebuild the pages that anchor the brand:
1. `LoginPage` (split editorial — ink hero left, form right)
2. `DashboardPage` / "Today" (greeting, three-card hero, sparkline stats)
3. `BacklogPage` (editorial title, dense list)
4. `BoardPage` (sprint label as eyebrow, columns with shadow cards)

**Phase 4 — Secondary pages.** Sprint planning, Retro, Task detail, Project Settings,
Stories, Epics. These benefit from token + shell changes; targeted CSS passes finish
them.

**Phase 5 — Responsive Playwright suite.**
- Breakpoints: `mobile 390×844`, `tablet 820×1180`, `laptop 1280×800`, `desktop 1440×900`.
- For each route + breakpoint: navigate, screenshot, assert no horizontal scrollbar on
  `<body>`, assert no element overflows viewport width.
- Snapshot screenshots committed under `e2e/visual/__screenshots__/`.

**Phase 6 — Iterate.** Run the suite, fix overflows / layout breaks, re-run until green.

---

## 5. What this spec does **not** cover

- Pixel-perfect 1:1 match for every flourish in the canvas (the sprint cell-row sparklines,
  the editorial illustration on Login). Pragmatic best-effort.
- The "All projects directory" page (frame 03) — created as new route only if a placeholder
  fits in the session budget; otherwise tracked as follow-up.
- Removing dark mode. Dark mode classes remain wired but visual fidelity in dark mode is
  not in scope for this pass.
- Backend changes. Pure frontend / docs work.

---

## 6. Acceptance

- `DESIGN.md` updated to reflect the new direction.
- `colors.ts` and the `@theme` block in `index.css` carry the new token values.
- `TopBar` + `Sidebar` match frames 02, 03, 04, 07 within reasonable tolerance.
- `LoginPage`, `DashboardPage`, `BacklogPage`, `BoardPage` rebuilt to match frames 10, 01,
  07, 04.
- Playwright responsive suite added, all routes pass at 4 breakpoints with no overflow
  or horizontal scrollbar.
- `npm run build` succeeds; existing `npm run test` (vitest) still green; existing
  `playwright test` still green.
