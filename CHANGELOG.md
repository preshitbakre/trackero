# Changelog

All notable changes to Trackero are tracked here. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0-capacity] — 2026-05-24

Phase 5. Burndown becomes reproducible by reading from daily snapshots
instead of replaying scope-change deltas against a moving target. Sprint
Planning shows per-assignee load with an over-capacity flag, and the
Save-draft + Start-sprint buttons are now wired to real handlers.

### Added
- Migration **034** — new `sprint_daily_snapshots` table
  `(sprint_id, snapshot_date, total_points, completed_points,
  in_progress_points, scope_added_points, scope_removed_points,
  item_counts_by_status, created_at)` with UQ `(sprint_id, snapshot_date)`
  and a (sprint_id, snapshot_date DESC) read index.
- `SprintSnapshotsService` — `@Cron('5 0 * * *')` writes one row per
  active sprint per UTC day, guarded by `pg_try_advisory_lock(991003)`
  so only one instance runs in a multi-process deploy. ON CONFLICT DO
  UPDATE keeps the same-day rewrite idempotent.
- `SprintCapacityService` — `(sprint days / 14) * sprintAverageVelocity`
  heuristic with a default of 8 points / 2 weeks when the project has
  no completed sprints to learn from; per-assignee committed totals;
  `isOver` flag.
- `GET /api/projects/:id/sprints/:sid/capacity` — returns
  `{ totalPoints, totalCommitted, totalRemaining, perAssignee }`.

### Changed
- `getBurndown` rewritten to read from snapshots; on-read fallback
  materializes today's row inline when the cron hasn't run yet, so the
  chart never serves a gap. Output shape (`sprintName, startDate,
  endDate, totalPoints, dataPoints[]`) is unchanged — no FE migration
  required for the existing consumer.
- SprintPlanningPage gained a per-assignee row ("MH 5/6 · JK 6/6 · AP
  9/7 (over)") fed from `/capacity`; over-capacity initials render in
  the danger color.
- SprintPlanningPage Save-draft / Start-sprint buttons now call real
  endpoints (PUT sprint metadata; POST `/sprints/:id/start`) with toast
  feedback; Start-sprint is disabled outside the `planning` state.

### Testing
- New regression pack `e2e/regression/phase-5/` — burndown shape,
  burndown read-idempotency, capacity shape with isOver invariant.

## [1.5.0-search] — 2026-05-24

Phase 4. The ⌘K command palette becomes a real product surface: sectioned
results (Work items / Projects / Sprints / People / Quick actions / Go to),
Tab-cycled type filter, scope chip flipping current-project ↔ entire
instance, item-key open-by-ID (PROJ-12 + Enter), and trigram-backed
people / project search.

### Added
- Migration **033** — `pg_trgm` extension + GIN trigram indexes on
  `users.display_name`, `users.email`, `projects.name`. Lets people /
  project search rank by similarity rather than substring.
- `SearchService.search(...)` rebuilt to return
  `{ workItems, projects, sprints, people, quickActions, goTo, total }`
  per backend spec §Search. `Promise.all` over the four DB rails;
  membership-scoped for non-admins; deterministic `quickActions` derived
  from the query ("New bug: <tail>", "New task: <query>"), and `goTo`
  entries that prefix-match the editorial keyword registry.
- `?v=1` query param keeps the legacy `{ list, total }` shape alive for
  one release of back-compat.
- `CommandPalette` rebuilt per frame 5: sectioned UI with section
  headers + counts, scope chip ("in <ProjectName>" ↔ "in entire instance"),
  Tab-cycled type filter, `↑↓ / ↵ / Tab / Esc` kbd footer, "N of M
  results" status, mouse-hover-keeps-cursor-sync, and item-key
  open-by-ID (typing `PROJ-12` and Enter resolves via search).

### Changed
- Phase 1 palette regression spec updated to match the new empty-state
  copy ("Type at least 2 characters to search.").

### Testing
- New regression pack `e2e/regression/phase-4/` — sectioned shape,
  `?v=1` back-compat, short-query empty sections, deterministic quick
  actions, item-key probe, project-scoped goTo entries.

## [1.4.0-directory] — 2026-05-24

Phase 3. The project directory becomes a first-class surface: pinned + recent
projects in the sidebar switcher, a `/projects` browse page with status
inference and search, and a server-recorded project-visits log that powers
the Recent rail and last-activity column.

### Added
- New page **`/projects`** — full directory with filter chips (All / Active /
  Planning / Archived), search by name or prefix, "Mine only" toggle, status
  badges (on track / ending soon / idle / no sprint / planning / archived),
  inline sprint progress meter, role chip, last-activity timestamp, and a
  per-card pin star.
- New endpoints powering it:
  - `GET /api/directory/projects` — counts + project rows with status,
    activeSprint summary, memberCount, role, lastActivityAt, isPinned.
  - `GET /api/me/pinned-projects` / `POST` / `DELETE /:id` — pin roundtrip.
  - `POST /api/me/project-visits/:projectId` — fire-and-forget visit ping.
  - `GET /api/me/projects/recent` — pinned-first, last-visit-DESC, capped at 8.
- Sidebar project switcher now opens to **Pinned** + **Recent** sections
  (fed by `/me/projects/recent`), with an in-dropdown search box, an "All
  projects" list below, and a "Browse all projects…" link to `/projects`.

### Changed
- AppShell fires a visit ping when the active project ID changes (route
  transition), keeping the Recent rail honest.
- DirectoryService listens to `work_item.{created,updated}`, `comment.added`,
  `board.moved`, and `sprint.{started,completed}` and bumps the project's
  `last_activity_at` so the directory + sidebar reflect live work.

### Database
- Migration **031** — adds `projects.last_activity_at` and `projects.archived_at`
  with a backfill (greatest of recent work-item / comment / activity-log /
  sprint timestamps for `last_activity_at`).
- Migration **032** — new `pinned_projects(user_id, project_id)` and
  `project_visits(user_id, project_id, visited_at)` tables, CASCADE FKs,
  composite PKs, supporting indexes.

### Testing
- New regression pack `e2e/regression/phase-3/` — directory shape, filter
  disjointness, search narrowing, pin roundtrip, visit-ping reflection.

## [1.3.0-today] — 2026-05-24

Phase 2 — Today aggregator + presence + activity granularity.

### Added
- New `/api/today` endpoint: single-call aggregator returning greeting,
  summary, triage top-3, reviewing, due soon, current sprint, presence,
  and activity feed. Server-side composition per backend spec §2.1.
- New TodayPage at `/today` (canonical) — editorial frame-01 layout with
  hero, three things, reviewing, due-soon, and a right rail (Sprint
  card + Live presence + Activity feed). `/dashboard` renders the same
  page for one release of back-compat; the legacy DashboardPage stays
  reachable at `/dashboard-legacy`.
- New `PresenceModule` — in-memory PresenceService + @Cron reaper;
  EventsGateway broadcasts presence:joined/left/state on socket
  join/leave/disconnect; `GET /api/projects/:id/presence` returns the
  snapshot.
- Granular activity rows: `WorkItemsService.update` now emits a
  `previous` map of changed fields; `ActivityService` writes one row per
  field change (title, priority, story_points, assignee, sprint,
  start_date, end_date, status) with proper fieldChanged + oldValue +
  newValue. The Today activity feed renders human-readable sentences
  off these rows ("Alice raised priority to high").
- `GET /api/projects/:id/sprints/active` — admin-detected dead endpoint
  the Sidebar footer was hitting; now returns the active sprint or null.
- Migration 030 — composite `IDX_activity_user_field (user_id,
  field_changed)` for the new granular-filter queries.
- Phase 2 regression e2e spec at `e2e/regression/phase-2/`.

### Changed
- Sidebar Retro link deep-links to the active sprint's retro
  (`/projects/:id/sprints/:sprintId/retro`) — falls back to the sprints
  list when no active sprint exists. Closes the dead-link bug that the
  un-walked-route sweep surfaced.

### Internal
- TodayService composes section helpers inline; the per-folder spec
  (greeting/, summary/, triage/, etc.) is deferred in favor of a flat
  service for v1. Phase 5 will swap the live burndown computation for
  reads from `sprint_daily_snapshots`; Phase 7 will tighten
  ReviewingService once `reviewer_id` ships.

## [1.2.0-shell-finish] — 2026-05-23

The Phase 1 release. Editorial shell finish: brand handoff completed, the
two orphaned global modals (CommandPalette, ShortcutsHelp) wired into the
running tree, the dead Members sidebar link fixed, and a shared-primitive
library introduced so later phases can stop reaching for inline styles.

### Changed
- Decorative peri / mint / tan / orchid tokens swept across 33 files; lilac
  is now the only primary accent. Semantic uses (status, priority, type,
  retro columns, project + avatar rotations) stay on the legacy palette.
  Dark-mode tokens (`peri-dm`, etc.) preserved.
- TopBar avatar swept to the new shared `<Avatar>` primitive. Remaining
  callers move incrementally as later phases touch each surface.

### Added
- `⌘K` / `Ctrl+K` opens the command palette from any authenticated page.
  AppShell owns the listener and the modal state; the TopBar "Jump to
  anything…" button dispatches the same event.
- `?` opens the keyboard-shortcuts help modal. Content is driven by the
  new `frontend/src/lib/keymap.ts` registry so help + wiring stay in
  lockstep.
- Single-key navigation: `T` → /dashboard, `B` → board, `L` → backlog,
  `S` → sprints. `G + B/L/S/E` chord stays for muscle-memory back-compat.
- 8 shared editorial primitives under `frontend/src/components/ui/`:
  `KbdKey`, `Eyebrow`, `TypeTag`, `Avatar`, `StatusPill`, `RoleBadge`,
  `MetricNumber`, plus `EmptyState` under `components/common/`. All
  wired via `lib/colors.ts` for canonical colour values.
- Opt-in `.lift-on-hover` global CSS class so card surfaces that should
  rise on hover (board cards, retro cards, dashboard project cards) can
  declare the intent without re-implementing the rule.
- Two Playwright regression specs at `e2e/regression/phase-1/` covering
  the palette and the shortcuts modal.

### Fixed
- Sidebar Members link no longer 404s. Routes to
  `/projects/:id/settings?tab=members` (Settings already had a Members
  tab). Active-state logic distinguishes Members vs Settings so they
  never both highlight; both are gated to PM / admin.
- `ShortcutsHelp` and `CommandPalette` no longer exist as orphan
  components — they mount under `AppShell` exactly once.

### Internal notes
- `docs/DESIGN.md` §2.4 codifies the decorative-vs-semantic palette rule,
  and §6 lists the new shared primitives.
- Phase 4 will rebuild the CommandPalette internals to match the
  sectioned design in frame 5; the current Phase 1 work only un-breaks
  what was already shipped.

## [1.1.0-fixforward] — 2026-05-23

The Phase 0 release. Closes every audit-found bug in the bridging
infrastructure between the application and the database, and re-establishes
the invariant that "the migration sequence is the only source of truth for
schema". No new product surface; every later phase rests on this.

### Fixed
- Comment notifications now fire. The `comment.added` and `comment.mentioned`
  listeners were reading `payload.taskId` (always undefined since the
  emitter sends `workItemId`); the silent NOT NULL violation inside the
  listener's try/catch had been swallowing every comment notification for
  the lifetime of the bug. Listeners now read the canonical `workItemId`,
  and a shared `CommentAddedPayload` / `CommentMentionedPayload` type
  prevents the field name from drifting again.
- The realtime gateway broadcast for `comment:added` now uses the canonical
  payload shape `{ workItemId, projectId, commentId, authorId, mentionedUserIds }`
  per the typed socket-events contract. Was emitting `{ taskId: undefined,
  commentId }`.
- Board card `itemKey` now matches the canonical
  `${projectPrefix}-${itemNumber}` shape (was the bare integer). Same fix
  applied to `listEpics` and `listStories`, which had the same bug.
- Work-item responses now populate `reporter.avatarUrl` symmetric with
  `assignee.avatarUrl`. The relation loader already loaded the URL; the
  projection just didn't expose it.

### Changed
- TypeORM `synchronize` is disabled in development and production (test
  keeps it for the per-suite fresh DB pattern). The migration sequence is
  now the only schema source of truth. `migrationsRun: true` auto-applies
  pending migrations on boot in non-test environments.
- `FK_assoc_created_by` on `work_item_associations` switched from
  `ON DELETE RESTRICT` to `ON DELETE SET NULL`. The associated `created_by`
  column is now nullable. Aligns with the Phase 0 rule that
  user-attribution columns keep the audit row through user deletion.

### Added
- `GET /api/health/migrations` — admin-only verification probe that reports
  applied migrations (from the bookkeeping table), expected migrations
  (from the hand-maintained registry at `src/database/migrations-registry.ts`),
  and the diff in both directions.
- Idempotent migration 024 reconciles the `migrations` bookkeeping table
  on drifted dev DBs where `synchronize` silently created the schema for
  migrations 15-23 without recording them.
- Migration 025 restores `chk_link_type`, `chk_no_self_link`, and
  `chk_item_type` on `work_item_associations` and `work_items`. Pre-flight
  RAISEs with a row count if existing data already violates a constraint.
- Migration 027 adds eight missing foreign keys (activity_logs.work_item_id,
  notifications.project_id, invitations.project_id, projects.default_assignee_id,
  retrospectives.created_by, sprints.created_by, project_members.added_by,
  sprint_scope_changes.work_item_id) with the audit-driven cascade policy
  per `docs/specs/tickets/phase-0/DECISIONS.md`.
- Migration 028 adds 15 missing indexes for FK columns (`activity_logs`,
  `notifications`, `invitations`, `projects`, `retrospectives`, `sprints`,
  `project_members`, `sprint_scope_changes`, `comments`, `attachments`) via
  `CREATE INDEX CONCURRENTLY` and drops the duplicate `IDX_retro_sprint`.
- Migration 029 is the belt-and-braces drop for the six legacy tables
  superseded by `work_items` (`epics`, `tasks`, `task_types`,
  `task_dependencies`, `task_labels`, `work_item_dependencies`). RAISEs
  if any row would be lost.
- Phase 0 regression suite at `backend/test/regression/phase-0/` (11
  specs, 23 tests, ~15s run) and `e2e/regression/phase-0/` (3 Playwright
  specs). `npm run test:regression` and `npm run e2e:regression` run them.
- Shared typed contracts: `src/comments/events/comment-added.event.ts`
  (in-process bus) and `src/gateway/events/socket-events.ts` (broadcast
  shapes). Future emitter / listener / gateway code references one type,
  not a string literal.

### Removed
- Nothing on the public surface; the legacy tables were already
  unreferenced by the application.

### Internal notes for operators upgrading from 1.0.x
- After deploying this image to a long-running instance whose dev/prod DB
  was built by `synchronize: true`, you may need to seed the `migrations`
  bookkeeping table once before the next boot. The audit-targeted DB
  needed rows for migrations 15-23; observed dev DBs have needed 14-23.
  Run the SQL in `docs/operator/seed-migrations-baseline.sql` (the
  WHERE-NOT-EXISTS form is idempotent), then boot. Migration 029 is
  protective: it refuses to drop a legacy table that still has rows. If
  the boot fails with "refusing to drop legacy table X; N rows survive",
  inspect the rows — for the audit-targeted instance the only surviving
  rows were the default Task/Bug `task_types` built-in seeds, which were
  superseded by `work_items.itemType` and safe to truncate.
- The backend now compiles migration .ts → .js on every `npm run build`
  and on `npm run start` / `start:dev` (see `tsconfig.migrations.json` +
  the `compile:migrations` npm script). The runtime loads .js only; the
  TypeORM CLI continues to consume .ts via `typeorm-ts-node-commonjs`.
  Fresh clones get the artifacts on first build.
