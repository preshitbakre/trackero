# Changelog

All notable changes to Trackero are tracked here. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  bookkeeping table once before the next boot. Migration 024 handles rows
  15-23; rows 0-14 must already be present (the audit-confirmed baseline).
  If your installation has no `migrations` table at all because synchronize
  built every schema object directly, the safer path is to (a) take a
  database backup, (b) manually insert bookkeeping rows for migrations
  0-14, then (c) deploy the new image. The boot-time auto-migration will
  pick up 024-029 from there.
