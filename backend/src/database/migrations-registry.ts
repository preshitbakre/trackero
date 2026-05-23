/**
 * Static list of every migration class shipped with the build, in the
 * order TypeORM would run them. The list backs the
 * `GET /api/health/migrations` admin endpoint, so it has a single
 * source of truth for "what migrations are expected to be applied"
 * without globbing the filesystem at runtime.
 *
 * Why class names and not imports: the `nest build` step has
 * `rootDir: src`, so importing migration classes (which live under
 * `backend/migrations/`) from inside `src/` fails the build. Keeping
 * the list as plain strings dodges that without restructuring the
 * repo, and a regression spec under `test/regression/phase-0/`
 * imports the actual classes to verify the names stay in sync.
 *
 * Adding a new migration: append a new entry. The Phase 0 regression
 * pack's `migrations.spec.ts` covers the on-disk-vs-registry check.
 */
export const EXPECTED_MIGRATION_NAMES: ReadonlyArray<string> = [
  'AuthTables1716000000000',
  'ProjectsTables1716000001000',
  'EpicsSprintsTasks1716000002000',
  'ChecklistDependencies1716000003000',
  'TaskSearchVector1716000004000',
  'TaskLabels1716000005000',
  'PasswordResets1716000006000',
  'CommentsAttachmentsActivity1716000007000',
  'Notifications1716000008000',
  'NotificationProjectId1716000009000',
  'RetroTables1716000010000',
  'SettingsTable1716000011000',
  'HierarchyMigration1716000012000',
  'DateFieldsRename1716000013000',
  'AssociationsRedesign1716000014000',
  'SprintOneActivePerProject1716000015000',
  'SprintNumberUniquePerProject1716000016000',
  'InvitationPendingEmailUnique1716000017000',
  'NotificationDailyDedupUnique1716000018000',
  'WorkItemSearchVector1716000019000',
  'StatusFixedWipEstimation1716000020000',
  'FkRestrictOnUserDelete1716000021000',
  'AssociationsCreatedByFk1716000022000',
  'AlignColumnLengths1716000023000',
  'ReconcileMigrationsTable1716000024000',
  'RestoreCheckConstraints1716000025000',
  'AssocCreatedBySetNull1716000026000',
  'AddMissingForeignKeys1716000027000',
  'AddMissingFkIndexes1716000028000',
  'DropLegacyTables1716000029000',
  'ActivityGranularity1716000030000',
  'ProjectsActivityArchiveColumns1716000031000',
  'PinnedProjectsAndVisits1716000032000',
  'SearchPeopleProjects1716000033000',
  'SprintDailySnapshots1716000034000',
  'RetroFourColumns1716000035000',
  'WorkItemWatchers1716000036000',
  'CommentMentions1716000037000',
  'CommentReactions1716000038000',
  'WorkItemsReviewer1716000039000',
];
