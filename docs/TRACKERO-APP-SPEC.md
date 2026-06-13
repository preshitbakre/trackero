# Trackero — Complete Application Specification

**Version:** v1 (as of 2026-06-01)
**Stack:** NestJS (backend) + React 19 (frontend) + PostgreSQL + MinIO + Socket.IO
**License:** AGPL-3.0

Trackero is a project management application built for small-to-mid-size product teams. It covers the full lifecycle from project setup through sprint planning, daily execution, retrospectives, and analytics.

---

## Table of Contents

1. [Instance Setup & Authentication](#1-instance-setup--authentication)
2. [User Management & Roles](#2-user-management--roles)
3. [Project Management](#3-project-management)
4. [Work Items](#4-work-items)
5. [Epics](#5-epics)
6. [Stories](#6-stories)
7. [Sprints](#7-sprints)
8. [Kanban Board](#8-kanban-board)
9. [Backlog](#9-backlog)
10. [Comments & Mentions](#10-comments--mentions)
11. [File Attachments](#11-file-attachments)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Checklists](#13-checklists)
14. [Associations & Dependencies](#14-associations--dependencies)
15. [Labels](#15-labels)
16. [Activity & Audit Trail](#16-activity--audit-trail)
17. [Notifications](#17-notifications)
18. [Today Page](#18-today-page)
19. [Dashboard](#19-dashboard)
20. [Project Directory](#20-project-directory)
21. [Charts & Analytics](#21-charts--analytics)
22. [Retrospectives](#22-retrospectives)
23. [Integrations & Webhooks](#23-integrations--webhooks)
24. [Search & Command Palette](#24-search--command-palette)
25. [Real-Time Collaboration](#25-real-time-collaboration)
26. [Keyboard Shortcuts](#26-keyboard-shortcuts)
27. [Settings & Preferences](#27-settings--preferences)
28. [Data Retention & Cleanup](#28-data-retention--cleanup)
29. [Health & Monitoring](#29-health--monitoring)
30. [API Infrastructure](#30-api-infrastructure)
31. [Filters](#31-filters)
32. [Database Schema Summary](#32-database-schema-summary)
33. [Design System](#33-design-system)
34. [Frontend Component Library](#34-frontend-component-library)
35. [Frontend Hooks & Utilities](#35-frontend-hooks--utilities)
36. [Technology Stack](#36-technology-stack)

---

## 1. Instance Setup & Authentication

### First-Run Setup Wizard

On first visit, `/auth/preflight` detects no users exist and redirects to a 4-step setup wizard:

| Step | What happens |
|------|-------------|
| 0 — Preflight | Checks instance is not already configured |
| 1 — Admin account | Creates the first user with `admin` role. Password validated (8-20 chars, upper, lower, number, special). Bcrypt cost 12 |
| 2 — Team invites | Optional: invite team members by email. Sends invite emails with 7-day expiry tokens |
| 3 — Summary | Confirmation screen. Redirects to login |

The setup endpoint uses `pg_advisory_xact_lock(991001)` to guarantee exactly one admin is created even under concurrent requests.

### Authentication Flow

| Endpoint | Purpose |
|----------|---------|
| `GET /auth/preflight` | Checks if instance is set up (any users exist). Public |
| `GET /auth/setup-status` | Checks if setup is complete. Used by LoginPage to redirect to `/setup` |
| `POST /auth/setup` | First-run setup wizard: creates admin + instance settings + optional invites. `pg_advisory_xact_lock(991001)` guarded |
| `POST /auth/register` | Register with invite token. Validates token, checks expiry, marks accepted |
| `POST /auth/login` | Email + password login. Returns JWT access token + refresh token. Updates `lastLoginAt`. Rate-limited |
| `POST /auth/refresh` | Atomic refresh token rotation. Old token revoked, new pair issued. Validates `tokenVersion` |
| `POST /auth/logout` | Revokes the refresh token |
| `GET /auth/me` | Returns current user profile from JWT |
| `PUT /auth/me` | Update display name and avatar URL |
| `PUT /auth/me/password` | Change password. Requires current password. Increments `tokenVersion` (invalidates all other sessions) |
| `POST /auth/forgot-password` | Sends password reset email. SHA-256 hashed token with 1-hour expiry. Rate-limited |
| `POST /auth/reset-password` | Resets password via emailed token. Clears token, increments `tokenVersion` |
| `GET /auth/invite-info` | Fetches invite details by token. Used by RegisterPage to pre-fill email |

**Note:** The frontend does not yet have dedicated forgot-password or reset-password pages. The login page has a placeholder `href="#"` link. The backend endpoints are fully implemented and ready for frontend integration.

**Security details:**
- Passwords hashed with bcrypt (cost 12), verified with constant-time comparison
- Refresh tokens and invite tokens stored as SHA-256 hashes (never plaintext)
- JWT payload: `{ userId, email, role, tokenVersion }`
- `tokenVersion` on the user entity is checked on every authenticated request; incrementing it instantly invalidates all sessions
- Login and forgot-password are rate-limited via `@nestjs/throttler` (30 req / 60s globally)

### Registration

Registration is invite-only. Users receive an email with a token link to `/register?token=...`. The registration form pre-fills the email from the invite. On success, the invite is marked `accepted`.

### Frontend Auth

- Tokens stored in `localStorage` (`accessToken`, `refreshToken`)
- Axios request interceptor injects `Authorization: Bearer <token>`
- Axios response interceptor catches 401, attempts token refresh (deduplicated for concurrent requests), retries the original request
- On refresh failure, calls `logout()` which clears storage, disconnects socket, and sets auth status to `anon`
- `ProtectedRoute` component guards all authenticated routes; redirects to `/login` when `authStatus === 'anon'`
- `AdminRoute` additionally redirects non-admin users to `/dashboard`

---

## 2. User Management & Roles

### Global Roles (4 levels)

| Role | Capabilities |
|------|-------------|
| **admin** | Full instance access. Manage all users, all projects, instance settings. Bypasses project membership checks |
| **project_manager** | Create projects. Full control within their projects |
| **member** | Create and edit work items within projects they belong to |
| **viewer** | Read-only access to projects they belong to |

### Project-Scoped Roles (3 levels)

Each project member has a project-level role independent of their global role:

| Role | Capabilities |
|------|-------------|
| **project_manager** | Full project control: members, statuses, labels, sprints, settings, danger zone |
| **member** | Create/edit work items, comments, sprints |
| **viewer** | Read-only. Cannot create or modify anything. Sees a `ReadOnlyBanner` on applicable pages |

### User Administration (Admin only)

| Action | Details |
|--------|---------|
| List users | All users with project count. `/users` |
| Change role | Global role change. Last-admin protection via `FOR UPDATE` row lock. Cannot change own role |
| Deactivate | Marks user inactive. Unassigns all their work items across all projects. Last-admin check. Cannot deactivate self |
| Reactivate | Restores inactive user |
| Invite | Send invitation email. Token generated + SHA-256 hashed. 7-day expiry |
| Bulk invite | Up to 50 invitations per request |

### Frontend — Settings Page (`/settings`)

Admin-only page with two columns:
- **Members table:** search, role dropdown, deactivate/reactivate toggle, confirmation dialogs
- **Invitations panel:** tabs for pending/accepted/expired, send-invite form
- **Stat strip:** active users, pending invitations, expired, projects, seats

---

## 3. Project Management

### Project CRUD

| Field | Details |
|-------|---------|
| name | Required, displayed everywhere |
| prefix | 2-5 uppercase letters, unique (case-insensitive). Auto-generated from name, manually overridable. Used in item keys (e.g., `WED-42`) |
| description | Optional text |
| status | `active` or `archived` |
| lead | Optional, links to a user |
| defaultAssigneeId | Optional, auto-assign new items |
| defaultSprintDuration | Default 14 days |
| estimationScale | `free` (any integer), `fibonacci` (1,2,3,5,8,13,21), or `tshirt` (XS,S,M,L,XL) |
| itemCounter | Atomically incremented per new work item (`UPDATE ... SET item_counter = item_counter + 1 RETURNING`) |
| lastActivityAt | Bumped on work_item/comment/board/sprint events |

### On Project Creation

- 3 default statuses are auto-created:
  - **Open** (category: backlog, isFixed: true, isDefault: true)
  - **In Progress** (category: in_progress, isFixed: true)
  - **Done** (category: done, isFixed: true)
- The creator is added as `project_manager`

### Archive / Delete

- **Archive:** sets `archivedAt`. Archived projects block all mutations except unarchive and hard-delete
- **Unarchive:** clears `archivedAt`
- **Delete:** requires project to be archived first. Cascading cleanup of all associated data

### Project Statuses (Customizable Board Columns)

Each project has an ordered set of statuses. The 3 defaults are fixed (cannot be deleted), but you can add custom statuses in any of the 3 categories (backlog, in_progress, done).

| Field | Details |
|-------|---------|
| name | Unique within project |
| category | `backlog`, `in_progress`, or `done` |
| color | Hex color for board column header |
| sortOrder | Determines column order on the board |
| wipLimit | Optional work-in-progress limit (displayed on board) |
| isFixed | True for the 3 defaults; prevents deletion |
| isDefault | The status assigned to new items |

Statuses can be reordered via a dedicated endpoint that validates the new order is an exact permutation of existing IDs.

### Project Members

- Add/remove members, change project-scoped roles
- Last-project-manager protection: cannot remove or demote the last PM
- Frontend: MembersTab in ProjectSettingsPage with invite, role select, remove

### Frontend

- **ProjectsPage** (`/projects`): grid of project cards with filters (active/planning/archived/all), search, "mine only" toggle, pin/unpin. `C` keyboard shortcut opens CreateProjectDialog
- **ProjectSettingsPage** (`/projects/:id/settings`): 7 tabs — General, Members, Board statuses, Labels, Notifications, Integrations, Danger zone. Role-gated (viewer redirected, member sees only General)

---

## 4. Work Items

Work items are the core entity. Five types share the same `work_items` table:

| Type | Key | Description |
|------|-----|-------------|
| **epic** | E | Large initiative containing stories. Has `epicState` (draft/planning/in_flight/shipped) |
| **story** | S | User-facing feature. Belongs to an epic. Has acceptance criteria, release notes, approval workflow |
| **task** | T | Actionable unit of work. Belongs to a story. Has checklists |
| **bug** | B | Defect. Belongs to a story. Leaf node (no children except subtasks) |
| **subtask** | s | Breakdown of a task/story/epic/bug. Uses `parentId` (not associations). Cannot be directly assigned to sprints |

### Item Fields

| Field | Type | Notes |
|-------|------|-------|
| itemNumber | integer | Auto-incremented per project, unique within project. Combined with prefix forms the item key (e.g., `WED-42`) |
| itemType | varchar | Immutable after creation |
| title | varchar | Required |
| description | text | Optional, rendered as markdown |
| userStory | text | Optional "As a... I want... So that..." field |
| statusId | FK | Points to a project status. `completedAt` auto-set/cleared on transition to/from `done` category |
| priority | enum | `urgent`, `high`, `medium`, `low`, `none` (default: medium) |
| storyPoints | integer | Nullable. `estimatedAt` stamped on first assignment |
| assigneeId | FK | Nullable user reference |
| reporterId | FK | Required. Set to creator |
| reviewerId | FK | Nullable user reference |
| sprintId | FK | Nullable. Subtasks cannot be directly assigned (inherit from parent) |
| parentId | FK | Self-referential. Only subtasks use this |
| sortOrder | varchar | LexoRank-style fractional index for drag-and-drop ordering |
| startDate / endDate | date | Optional date range |
| epicState | varchar | Epics only: `draft`, `planning`, `in_flight`, `shipped` |
| addedMidSprint | boolean | Flagged when assigned to an active sprint after it started |
| deletedAt | timestamptz | Soft delete timestamp. Hard-deleted by retention service after grace period |
| archivedAt | timestamptz | Archive timestamp |
| approvedBy / approvedAt | FK / timestamptz | Story approval metadata |
| searchVector | tsvector | Auto-generated. Powers full-text search via GIN index |

### Item Hierarchy & Validation

- **parentId** is reserved for subtasks only. A subtask's parent can be a task, story, epic, or bug
- Bugs are leaf nodes (no non-subtask children)
- Maximum depth: 4 levels
- Circular reference detection on reparenting (walks the ancestor chain)
- Cross-project validation on all FK references (sprintId, labelIds, assigneeId, linkedItemId)

### Item CRUD

| Endpoint | Details |
|----------|---------|
| `GET /projects/:id/items` | Paginated list with filters: itemType, parentId, status, priority, assigneeId, sprintId, hasSprint, labelId, search |
| `POST /projects/:id/items` | Create. Atomic counter increment. Auto-assigns default status |
| `GET /projects/:id/items/:id` | Detail: children, breadcrumb, associations, recursive progress (CTE), comment/attachment counts, descendant breakdown, epic lookup, approval info, acceptance criteria |
| `PUT /projects/:id/items/:id` | Update. Granular field-change tracking emitted as events for the activity rail |
| `DELETE /projects/:id/items/:id` | Soft delete (sets `deletedAt`). Admin can hard-delete |
| `POST /projects/:id/items/:id/restore` | Restore soft-deleted item |
| `PUT /projects/:id/items/:id/move` | Reparent. Validates circular refs, depth, type compatibility |
| `PUT /projects/:id/items/:id/sprint` | Assign/unassign sprint. Tracks `addedMidSprint` |
| `PUT /projects/:id/items/:id/assign` | Assign/unassign user |
| `PUT /projects/:id/items/reorder` | Batch reorder (LexoRank sortOrder updates) |
| `GET /projects/:id/items/:id/children` | Paginated children with child counts |
| `POST /projects/:id/items/:id/watch` | Watch a work item (adds to watchers list) |
| `DELETE /projects/:id/items/:id/watch` | Unwatch a work item |
| `GET /projects/:id/items/:id/watchers` | List watchers for a work item |
| `POST /projects/:id/items/:id/associations` | Create association (belongs_to, relates_to, blocks, caused_by). Circular blocks detection via BFS |
| `DELETE /projects/:id/items/:id/associations/:assocId` | Delete association (outgoing or incoming) |
| `GET /projects/:id/items/:id/associations` | List all associations grouped by type (belongsTo, contains, relatesTo, blocks, blockedBy, causedBy, causes) |
| `POST /projects/:id/items/:id/checklist` | Create checklist item (tasks/subtasks only) |
| `PUT /projects/:id/items/:id/checklist/:checklistId` | Update checklist item |
| `DELETE /projects/:id/items/:id/checklist/:checklistId` | Delete checklist item |

### Search

Full-text search on work items uses three strategies in parallel:
1. **tsvector** full-text search on title + description
2. **ILIKE** substring match
3. **Item number/key pattern** matching (e.g., `WED-42` or just `42`)

### Frontend

- **TaskDetailPage** (`/projects/:id/tasks/:taskId`): full-page detail. Inline-editable title, markdown description, subtask list, checklist, comments with @mentions and reactions, activity log, attachments. Right sidebar: status, assignee, reporter, sprint, points, priority, due date, labels, associations
- **TaskDetailPanel**: comprehensive slide-over drawer (used in board, backlog, story detail, epic detail). Same functionality as the full page in a drawer. Supports `bare` mode. 1212 lines of implementation
- **CreateItemDialog**: drawer-based form for creating any item type. Dynamic fields based on type. Supports `bare` mode

---

## 5. Epics

Epics are the highest-level planning unit. They group stories and provide a bird's-eye view of large initiatives.

### Epic States

Stored states: `draft`, `planning`, `in_flight`, `shipped`

Derived display states (computed at query time):
- **archived**: `archivedAt` is set
- **blocked**: has unresolved outgoing `blocks` associations
- **at_risk**: in_flight + endDate within 7 days + incomplete descendant work

### Epic-Specific Features

| Feature | Details |
|---------|---------|
| Ship | Marks epic as `shipped`. Requires all descendants in `done` category |
| Reopen | Moves shipped epic back to `in_flight`, clears completion state |
| Archive / Unarchive | Soft-archive with `archivedAt` |
| Detach children | Removes all `belongs_to` associations + nulls sprint on affected children |
| Forecast | Velocity-based finish-sprint prediction. Calculates projected completion sprint based on historical velocity |
| Across-sprints view | Shows how the epic's work is distributed across sprints |
| Descendant stats | Recursive CTE computes total/done/in-progress/open items and points across the full belongs_to tree (depth <= 4) |

### Endpoints (12)

| Endpoint | Purpose |
|----------|---------|
| `GET /projects/:id/epics` | List with recursive descendant stats + blocker detection |
| `GET /projects/:id/epics/summary` | Summary strip: total, by state, points |
| `GET /projects/:id/epics/:id` | Detail with contributors, type breakdown, sprint distribution, velocity forecast |
| `GET /projects/:id/epics/:id/children` | Children grouped by status or sprint |
| `GET /projects/:id/epics/:id/activity` | Recent activity for the epic |
| `PATCH /projects/:id/epics/:id` | Update epic fields |
| `POST /projects/:id/epics/:id/ship` | Mark shipped |
| `POST /projects/:id/epics/:id/reopen` | Reopen |
| `POST /projects/:id/epics/:id/archive` | Archive |
| `POST /projects/:id/epics/:id/unarchive` | Unarchive |
| `POST /projects/:id/epics/:id/detach-children` | Detach all children |

### Frontend

- **EpicsPage** (`/projects/:id/epics`): grouped listing (In flight, Planning, Shipped, Archive). Filter by displayState. EpicStatStrip summary. `E` keyboard shortcut opens create dialog
- **EpicDetailPage** (`/projects/:id/epics/:epicId`): 4 tabs (Overview, Stories, Timeline, Settings). Breadcrumb, TypeTag, StatusPill. TaskDetailPanel overlay for child items. EpicSidebar with metadata
- **EpicCard**: colored left bar by status, TypeTag + key + StatusPill + priority badge + lead avatar, title, labels, progress bar, story/task counts, target date, blocked-by

---

## 6. Stories

Stories represent user-facing features. They belong to epics (via `belongs_to` association) and contain tasks and bugs.

### Story-Specific Features

| Feature | Details |
|---------|---------|
| Approval workflow | `POST .../approve`: moves to done status, sets `approvedBy`/`approvedAt`. Checks no unresolved blockers. `POST .../reopen`: moves back to in_progress, clears approval. `GET .../release-note`: fetch release note. `PUT .../release-note`: upsert release note with optional publish |
| Acceptance criteria | Structured (Given/When/Then) or plain text. Toggle `isMet` with verifier tracking. Reorderable. Optionally linked to a work item |
| Release notes | One-per-story. Rich text body with optional `publishedAt` timestamp |
| Progress tracking | Recursive CTE calculates completion across all descendant tasks/bugs/subtasks |
| User story field | Optional "As a... I want... So that..." structured text |

### Hierarchy View Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /projects/:id/stories` | List stories with progress, epic linkage, child breakdown |
| `GET /projects/:id/story-stats` | Aggregate statistics: total, open, in_flight, done, totalPoints, completedPoints |
| `GET /projects/:id/backlog` | Hierarchical backlog tree (epics/stories/tasks/bugs/subtasks), pruning sprinted items |

### Frontend

- **StoriesPage** (`/projects/:id/stories`): view toggle (by epic / by status / by sprint), search, "mine" filter. Fetches all stories (paginated up to 4000). StoriesStatsStrip, grouped StoriesTable. `C` shortcut
- **StoryDetailPage** (`/projects/:id/stories/:storyId`): 3 tabs (Overview, Tasks, Settings). Right rail with metadata. Header actions: approve, reopen, watch, release notes. TaskDetailPanel overlay for children. AcceptanceCriteria checklist. LinkItemDialog for associations. ReleaseNotesDrawer

---

## 7. Sprints

Sprints are time-boxed iterations. Each project can have at most one active sprint at a time (enforced by a partial unique index).

### Sprint Lifecycle

```
planning → active → completed
                  → cancelled
```

| Status | Meaning |
|--------|---------|
| **planning** | Future sprint. Items can be added/removed freely |
| **active** | Currently running. Only one per project. Items added mid-sprint are flagged `addedMidSprint` |
| **completed** | Finished. Incomplete items carried over per `carryOverPolicy` |
| **cancelled** | Abandoned. All items moved to backlog |

### Sprint Fields

| Field | Details |
|-------|---------|
| name | Required |
| goal | Optional text describing the sprint objective |
| sprintNumber | Auto-incremented per project. Unique within project |
| startDate / endDate | Date range. Validated server-side against `CURRENT_DATE` |
| carryOverPolicy | `roll` (to next planning sprint), `backlog` (unassign), or `ask` (prompt user) |
| capacity | Optional integer. Auto-calculated if null (from team size and historical velocity) |
| startedBy / startedAt | Who started the sprint and when |
| completedAt | When the sprint was completed or cancelled |

### Sprint Operations

| Operation | Business Rules |
|-----------|---------------|
| **Create** | Auto-increment sprintNumber. Date validation |
| **Start** | Pessimistic write lock. No-other-active check (DB constraint + runtime). Must have at least one item. Records initial scope. Emits `sprint.started` |
| **Complete** | Carries over incomplete items per policy. Records scope changes. Emits `sprint.completed` (triggers auto-create retro) |
| **Cancel** | Moves all items to backlog (clears sprintId). Emits `sprint.cancelled` |
| **Delete** | Moves items to backlog first, then removes the sprint |

### Sprint Enrichment (computed on read)

Each sprint response includes batched computed fields:
- **stats**: total/completed/in-progress points
- **assignees**: unique team members with avatars
- **statusCounts**: items per status category
- **scopeDeltas**: net points added/removed since start
- **blockedCount**: items with unresolved outgoing `blocks`
- **autoCapacity**: calculated from team size + velocity
- **projectedPoints**: trend-based completion estimate

### Burndown & Snapshots

- **Daily snapshot cron** runs at 00:05 UTC (`pg_try_advisory_lock(991003)`)
- Each snapshot records: `total_points`, `completed_points`, `in_progress_points`, `scope_added_points`, `scope_removed_points`, `item_counts_by_status` (jsonb)
- On-read fallback: if today's snapshot is missing, it's materialized live
- **Burndown chart** renders: actual (step line), ideal (dashed), projection (dashed purple), today marker

### Scope Changes

Sprint scope is tracked automatically via event listeners:
- When items are added/removed from an active sprint
- When story points change on items in an active sprint
- When the sprint goal changes

Each change records: action (added/removed/goal), story points delta, actor, optional note. A commit-batch heuristic groups changes within 1-second windows for clean timeline display.

### Endpoints (12+)

| Endpoint | Purpose |
|----------|---------|
| `POST .../sprints` | Create |
| `GET .../sprints` | List with batched enrichment |
| `GET .../sprints/active` | Find active sprint |
| `GET .../sprints/:id` | Detail with full enrichment |
| `PUT .../sprints/:id` | Update |
| `DELETE .../sprints/:id` | Delete (moves items to backlog first) |
| `POST .../sprints/:id/start` | Start sprint |
| `POST .../sprints/:id/complete` | Complete sprint |
| `POST .../sprints/:id/cancel` | Cancel sprint |
| `GET .../sprints/:id/items` | List sprint items |
| `GET .../sprints/:id/burndown` | Burndown data |
| `GET .../sprints/:id/scope-changes` | Scope change timeline |

### Frontend

- **SprintsPage** (`/projects/:id/sprints`): velocity strip (avg velocity, VelocityChart sparkline), active sprint card, planning sprint cards (sorted by sprintNumber ascending), archive table. SprintCard with 4-column grid. CreateSprintDialog
- **SprintDetailPage** (`/projects/:id/sprints/:sprintId`): 3 tabs (Overview, Scope changes, Settings). Status-aware header actions. ConfirmDialog for complete/cancel. OverviewSidebar (dates, workload bars, type breakdown, activity). SettingsSidebar (identity, audit trail)
- **SprintPlanningPage** (`/projects/:id/sprints/:sprintId/planning`): two-column drag-and-drop (backlog <-> sprint). Capacity/points tracking. Save draft and Start buttons

---

## 8. Kanban Board

The board is a drag-and-drop column view of work items filtered by sprint.

### Board Data

- Columns derived from project statuses, sorted by `sortOrder`
- Items filtered to `task`, `bug`, and `subtask` types
- Subtasks included via parent sprint lookup (if a subtask's parent is in sprint X, the subtask appears in sprint X's board)
- Each card is enriched with: subtask counts (total/done), comment count, attachment count, blocker flag, parent reference (for subtasks)

### Board Operations

| Feature | Details |
|---------|---------|
| Drag & drop | @dnd-kit with PointerSensor + KeyboardSensor. Optimistic UI updates |
| Move card | Updates status + sort position. Checks blocker resolution when moving to `done`. Sets/clears `completedAt` |
| Sprint filter | Dropdown to switch between sprints |
| Assignee filter | Multi-select to filter by team member |
| Priority filter | Filter by priority level |
| Epic filter | `?epicId=` URL param |
| Quick-add | Per-column `+` button opens inline title input to create a new item in that status |
| Real-time sync | Socket listeners for `board:moved`, `work-item:created/updated/deleted`. Skips own moves via `actorId` check |
| WIP limits | Displayed on column header when configured |

### Frontend

- **BoardPage** (`/projects/:id/board`): wraps KanbanBoard. ReadOnlyBanner for viewers
- **StatusColumn**: droppable column with color dot, item count, WIP display, quick-add form
- **TaskCard**: type badge + key + parent ref, title (blocker lock icon), labels, points + subtask progress + assignee avatar. Red left border when blocked. Lift/rotate animation on drag

---

## 9. Backlog

The backlog is the unscheduled work queue with drag-and-drop reordering and bulk operations.

### Features

| Feature | Details |
|---------|---------|
| Hierarchical view | Collapsible parent/subtask tree |
| Drag-and-drop reorder | @dnd-kit with LexoRank sort ordering |
| Checkbox multi-select | Select multiple items for bulk operations |
| Bulk actions | Assign, move to sprint, delete |
| Shared drawer | TaskDetailPanel and CreateItemDialog render in a right-side Drawer |
| Deep-link | `?task=` query param opens the selected task in the drawer |
| Item types | Includes tasks, bugs, and subtasks |

### Backend

`GET /projects/:id/backlog` returns a hierarchical tree (epics/stories/tasks/bugs/subtasks), pruning items that are already assigned to a sprint.

### Frontend

- **BacklogPage** (`/projects/:id/backlog`): full list with drag handles, type tags, IDs, titles, labels, priority, points, owner. Column layout matches the design system

---

## 10. Comments & Mentions

### Comment Features

| Feature | Details |
|---------|---------|
| Create | HTML-stripped body with @mention parsing |
| Edit | Author can edit. Sets `editedAt` |
| Delete | Author can delete own. PM/admin can delete anyone's |
| Reactions | Toggle emoji reactions (upsert/delete in transaction). One reaction per user per emoji per comment. Unique constraint: `(commentId, userId, emoji)` |
| @Mentions | `@[Name]` bracket syntax. Resolved against active project members. Creates `comment_mentions` records. Triggers notification |

### Frontend

- **MentionTextarea**: detects `@` trigger, shows filtered member dropdown (max 6), keyboard navigation, inserts `@[Name]` syntax. Cmd+Enter to submit
- **CommentBody**: renders text with @mention highlighting in accent blue
- Comments appear in TaskDetailPage, TaskDetailPanel, and StoryDiscussion

---

## 11. File Attachments

### Upload & Storage

| Detail | Value |
|--------|-------|
| Storage | MinIO (S3-compatible). Auto-creates bucket on startup |
| Size limit | `MAX_UPLOAD_SIZE_MB` env var (default 10 MB) |
| MIME validation | Magic bytes via `file-type` library |
| Allowed types | jpeg, png, gif, webp, pdf, txt, csv, doc, docx, xls, xlsx |
| Blocked | SVG (XSS risk) |
| Storage key | `{projectId}/{taskId}/{uuid}-{safeName}` |
| Download | Presigned URLs (configurable expiry, default 30min, clamped 60s-7d) |
| Security | Non-image types forced to `Content-Disposition: attachment` + `application/octet-stream` to prevent inline rendering |
| Cleanup | Event listeners on `work_item.deleted` and `project.deleted` clean up orphaned storage objects |
| Compensating action | If DB save fails after upload, the storage object is deleted |

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST .../attachments` | Upload (multipart form) |
| `GET .../attachments` | List |
| `GET .../attachments/:id/url` | Get presigned download URL |
| `DELETE .../attachments/:id` | Delete attachment + storage object |

---

## 12. Acceptance Criteria

Acceptance criteria are structured test conditions on stories (or any work item).

### Structure

Two formats:
- **Structured**: `Given` (required) + `When` (optional) + `Then` (optional)
- **Plain**: `Given` text only (when/then left null)

### Fields

| Field | Details |
|-------|---------|
| givenText | Required |
| whenText | Optional |
| thenText | Optional |
| isMet | Boolean. When toggled to true, `verifiedBy` and `verifiedAt` are set |
| linkedItemId | Optional FK to a work item (e.g., the task that implements this criterion) |
| sortOrder | LexoRank for drag reorder |

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET .../criteria` | List with met/total counts |
| `POST .../criteria` | Create |
| `PUT .../criteria/reorder` | Reorder |
| `PATCH .../criteria/:id` | Update (toggle isMet, edit text) |
| `DELETE .../criteria/:id` | Delete |

---

## 13. Checklists

Simple to-do lists on tasks and subtasks.

| Field | Details |
|-------|---------|
| title | Required |
| isCompleted | Boolean toggle |
| sortOrder | Integer ordering |

Available only on `task` and `subtask` types. CRUD via `/projects/:id/items/:id/checklist`.

---

## 14. Associations & Dependencies

Work items can be linked to each other via typed associations.

### Link Types

| Stored Type | Description | Virtual Reciprocal |
|-------------|-------------|-------------------|
| `belongs_to` | Child belongs to parent (story → epic, task → story, bug → story) | `contains` |
| `relates_to` | Bidirectional relationship | `relates_to` |
| `blocks` | This item blocks the linked item | `blocked_by` |
| `caused_by` | This item was caused by the linked item | `causes` |

### Business Rules

- **Circular blocks detection**: BFS traversal prevents creating blocking cycles
- Association uniqueness: `(itemId, linkedItemId, linkType)` is unique
- Cross-project validation on `linkedItemId`
- The detail endpoint returns associations grouped into all 7 categories (4 stored + 3 virtual)

### Frontend

TaskDetailPanel and StoryDetailPage render:
- Associations section with all 6 visible link types
- Paginated search picker with infinite scroll to find items to link
- Link type selector (belongs_to, relates_to, blocks, caused_by)
- Click to navigate to linked item

---

## 15. Labels

Per-project colored tags for categorizing work items.

| Field | Details |
|-------|---------|
| name | Max 15 chars, unique within project |
| color | Hex color |

- Many-to-many via `work_item_labels` join table
- Label assignment uses replace-all strategy (delete existing, re-insert)
- **LabelPicker** component: fetches project labels, toggle to select/deselect, colored pills
- **LabelBadge** / **LabelList**: display components with overflow count

---

## 16. Activity & Audit Trail

Every significant action is logged to the `activity_logs` table.

### Tracked Events

| Event | Source |
|-------|--------|
| Work item created/updated/deleted | WorkItemsService |
| Comment added | CommentsService |
| Attachment added | AttachmentsService |
| Sprint started/completed/cancelled | SprintsService |
| Field changes | Per-field granular tracking: status, title, priority, storyPoints, assignee, sprint, startDate, endDate, reviewer |

### Fields

| Field | Details |
|-------|---------|
| projectId | Required |
| workItemId | Nullable (sprint events don't have one) |
| userId | Who performed the action |
| action | created, updated, deleted, commented, attached, sprint_started, sprint_completed, sprint_cancelled |
| fieldChanged | Which field was modified (for updates) |
| oldValue / newValue | Previous and new values as text |
| createdAt | Timestamp |

### Endpoints

| Endpoint | Scope |
|----------|-------|
| `GET /projects/:id/activity` | Project-wide feed (paginated) |
| `GET /projects/:id/sprints/:id/activity` | Sprint-scoped with human-readable phrasing |
| `GET /projects/:id/items/:id/activity` | Item-level feed |

### Retention

Activity logs older than 180 days are pruned by the retention cron, except status-change records which are preserved for the cumulative flow chart.

---

## 17. Notifications

### In-App Notifications

| Trigger | Recipients |
|---------|-----------|
| Work item assigned | Assignee |
| Story approved | Reporter + assignee |
| Comment added | Item watchers |
| @Mention in comment | Mentioned users |
| Sprint started | Sprint members |
| Project member added | New member |
| Sprint ending tomorrow | Sprint members (cron) |
| Task due tomorrow | Assignee (cron) |
| Task overdue | Assignee (cron) |

### Suppression Rules

- Never notify the actor (person who caused the event)
- Never notify inactive users
- Deduplicate within 5 minutes
- Daily cron dedup via partial unique index (`UQ_notif_daily_dedup`)

### Notification Preferences

Per-user, per-type, per-channel configuration. Channels: `in_app`, `email`, `push`.

### Cron

Daily at 9 AM (configurable timezone) with `pg_try_advisory_lock(991002)`:
- Sprint ending tomorrow
- Tasks due tomorrow
- Tasks overdue

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /notifications` | List (filterable by isRead) |
| `GET /notifications/unread-count` | Count |
| `PUT /notifications/read-all` | Mark all read |
| `PUT /notifications/:id/read` | Mark one read |

### Frontend — NotificationBell

Bell icon in TopBar with unread count badge (caps at 9+). Dropdown panel with notification list (max 20), "Mark all read" button. Socket listener for `notification:new` events provides live push + toast notification. Click navigates by `referenceType` (work_item, sprint, comment, project).

---

## 18. Today Page

The Today page is the per-project landing page, designed as an intelligent daily briefing.

### Sections

| Section | Content |
|---------|---------|
| **Greeting** | Time-aware ("Good morning/afternoon/evening, Name"). Natural-language summary of the day's situation |
| **Three Things** | Top 3 auto-prioritized triage items. Priority: P0 = bugs + blockers, P1 = due soon, P2 = in progress, P3 = rest |
| **Reviewing** | Items where you are the reporter and they are in review |
| **Due Soon** | Items due within 7 days |
| **Sprint Card** | Current sprint with burndown sparkline SVG, 2x2 metrics grid |
| **Live Rail** | Real-time presence (who's online in the project) |
| **Activity Rail** | 10 most recent activity entries |

### Backend

`GET /today?projectId=&timezone=` returns all sections in parallel. The greeting is computed server-side with time-of-day awareness. Triage items are auto-prioritized by urgency.

---

## 19. Dashboard

The legacy dashboard (`/dashboard-legacy`) renders a role-specific view:

### Admin Dashboard

Instance-wide stats + all projects overview + team workload table + blocked tasks + recent activity.

### PM Dashboard

My projects stats + sprint health per project + burndown preview chart + team workload bars + blocked tasks + my tasks + upcoming deadlines (7 days) + epic progress + recent activity.

### Member Dashboard

Personal stats + my focus (tasks with status dots) + active sprints with my progress + due soon & overdue + blocked items + activity on my tasks + recently completed.

### Viewer Dashboard

Read-only overview stats + project cards + sprint progress + epic progress + recent completions + team members with role badges.

---

## 20. Project Directory

The directory is the project index and navigation hub.

### Features

| Feature | Details |
|---------|---------|
| List | All accessible projects with member counts, active sprint info, points |
| Status derivation | archived, ends_today, ends_in_days, planning, no_sprint, idle (>14 days since lastActivityAt), on_track |
| Pin/Unpin | Star projects for quick access |
| Recent | Last 8 visited projects |
| Visit tracking | `POST /me/project-visits/:id` records visit timestamp, powers Sidebar's "Recent" section |

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /directory/projects` | Full directory with derived statuses |
| `GET /me/pinned-projects` | Pinned projects |
| `POST /me/pinned-projects` | Pin a project |
| `DELETE /me/pinned-projects/:projectId` | Unpin a project |
| `POST /me/project-visits/:projectId` | Record project visit |
| `GET /me/projects/recent` | Recent projects (last 8 visited) |

### Frontend — Sidebar Project Switcher

220px sidebar includes a project switcher dropdown (portals to body):
- Search field
- **Pinned** section
- **Recent** section (from visit tracking)
- **All projects** section
- Footer: "+ New project" + "See all N projects" link
- `Cmd+P` toggles the switcher

---

## 21. Charts & Analytics

### Velocity Chart

`GET /projects/:id/charts/velocity` — last 10 completed sprints' completed points. Rendered as a bar chart with average line.

### Burndown Chart

Uses `sprint_daily_snapshots` data. Renders:
- **Actual** (step line, black)
- **Ideal** (dashed diagonal)
- **Scope changes** (projection adjustment)
- **Projection** (dashed purple, extrapolated to completion)
- Today marker
- Projected ship date

Sprint selector dropdown to switch between sprints.

### Cumulative Flow Diagram

`GET /projects/:id/charts/cumulative-flow` — 30-day window using `generate_series` + `LATERAL` join for historical status reconstruction via activity_logs. Rendered as a stacked area chart.

### Frontend

**ChartsPage** (`/projects/:id/charts`): 3 tabs (Velocity, Burndown, Cumulative Flow). Charts rendered with @nivo (ResponsiveLine, ResponsiveBar).

---

## 22. Retrospectives

Sprint retrospectives for continuous improvement. Auto-created when a sprint is completed.

### Structure

4-column format (modern):
- **Kept**: what went well and should continue
- **Dropped**: what didn't work and should stop
- **Lucky breaks**: unexpected wins
- **Next**: action items for the next sprint

Legacy columns (`went_well`, `to_improve`, `action_items`) are auto-migrated on read.

### Features

| Feature | Details |
|---------|---------|
| Anonymity | Card authors hidden until PM/admin reveals them (`authorsRevealedAt`). Author can always see their own cards |
| Voting | Toggle-vote per card. Max votes per user configurable (default 5). Concurrent-safe via unique constraint catch |
| Action items | Cards can be tagged as action items (`isActionItem`) |
| Close | PM/admin closes the retro, locking all further edits |
| Facilitator | Assignable facilitator role (can see authors before reveal) |
| Auto-create | Retrospective auto-created on `sprint.completed` event (idempotent) |

### Endpoints (9)

| Endpoint | Purpose |
|----------|---------|
| `POST .../sprints/:id/retro` | Create retro |
| `GET .../sprints/:id/retro` | Get retro with cards, votes, anonymity |
| `POST .../retro/:id/cards` | Add card |
| `PUT .../retro/:id/cards/:id` | Edit card |
| `DELETE .../retro/:id/cards/:id` | Delete card |
| `POST .../retro/:id/cards/:id/vote` | Toggle vote |
| `PUT .../retro/:id/facilitator` | Set facilitator |
| `POST .../retro/:id/reveal-authors` | Reveal authors |
| `POST .../retro/:id/close` | Close retro |

### Frontend

**RetroPage** (`/projects/:id/sprints/:sprintId/retro`): 4-column layout. Anonymous card creation, ThumbsUp voting with counts, action item tagging, edit/delete on hover, TOP VOTE badge, reveal authors + close retro for PM/admin.

---

## 23. Integrations & Webhooks

External service integrations for project automation.

### Supported Types

| Type | Details |
|------|---------|
| **webhook** | Generic HTTP webhook. HMAC-SHA256 signed (`X-Trackero-Signature` header) |
| **slack** | Slack incoming webhook |
| **github** | GitHub integration |

### Events Delivered

- `work_item.created`
- `work_item.updated`
- `comment.added`
- `sprint.started`
- `sprint.completed`

### Delivery System

- Secret generated on creation (32 random bytes, hex-encoded), returned once, never exposed again
- HMAC-SHA256 signature for webhook verification
- Optional bearer token in config for target authentication
- **Delivery cron** every 1 minute (`pg_try_advisory_lock(991005)`)
- **Exponential backoff**: 1m / 5m / 15m / 1h / 6h (5 attempts max)
- Disabled integrations mid-flight are marked failed (not retried forever)
- Delivery log per integration (cap 100 entries)
- Manual retry for failed deliveries

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET .../integrations` | List |
| `POST .../integrations` | Create (returns secret once) |
| `PUT .../integrations/:id` | Update config/enabled |
| `DELETE .../integrations/:id` | Delete |
| `GET .../integrations/:id/deliveries` | Delivery log |
| `POST .../integrations/:id/deliveries/:id/retry` | Retry failed delivery |

---

## 24. Search & Command Palette

### Global Search API

`GET /search?q=&projectId=&scope=&v=` returns sectioned results:

| Section | Source | Cap |
|---------|--------|-----|
| Work items | Full-text + ILIKE + item key | 8 |
| Projects | Trigram similarity | 4 |
| Sprints | Substring match | 4 |
| People | Trigram similarity | 4 |
| Quick actions | Deterministic from query pattern | varies |
| Go to | Navigation entries | varies |

Scope: `current` (project) or `instance`. Membership-scoped (admins bypass).

### Frontend — Command Palette

`Cmd+K` / `Ctrl+K` opens the palette from any authenticated page.

Features:
- 200ms debounced search
- Scope toggle (current project vs. instance)
- Tab cycles through type filters
- Arrow Up/Down/Enter keyboard navigation
- Open-by-ID: type `PROJ-12` + Enter to jump directly
- Footer shows keyboard hints + result count

---

## 25. Real-Time Collaboration

### WebSocket (Socket.IO)

**Connection:**
- JWT verified on handshake (`Bearer` token from `handshake.auth`)
- User active + tokenVersion validated
- Auto-joins `user:{userId}` room for personal notifications

**Project Rooms:**
- `project:{projectId}` rooms with membership verification
- `joinProject` / `leaveProject` managed by AppShell on URL navigation

### Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `join:project` | Project ID. Membership verified, presence recorded |
| Client → Server | `leave:project` | Project ID. Presence cleared |
| Client → Server | `presence:context` | Route, workItemId, action (viewing/editing/commenting/idle) |
| Client → Server | `presence:heartbeat` | Keep-alive |
| Server → Client | `work-item:created` | New item data |
| Server → Client | `work-item:updated` | Updated item data |
| Server → Client | `work-item:deleted` | Deleted item ID |
| Server → Client | `board:moved` | Card move with actorId |
| Server → Client | `sprint:updated` | Sprint state change |
| Server → Client | `comment:added` | Comment with mentionedUserIds |
| Server → Client | `notification:new` | Notification for user room |
| Server → Client | `presence:joined` | User joined project |
| Server → Client | `presence:left` | User left project |
| Server → Client | `presence:state` | Full presence snapshot |

### Presence System

- In-memory registry (no DB, no Redis)
- Per-project, per-user tracking with multi-tab support (set of socketIds)
- Context tracking: route, workItemId, action
- Heartbeat-based: `recordHeartbeat` bumps `lastSeenAt`
- **Reaper cron** every 30s: evicts entries older than 60s
- Multi-tab aware: first-tab join broadcasts `presence:joined`, last-tab disconnect broadcasts `presence:left`
- Presence endpoint: `GET /projects/:id/presence` for HTTP snapshot

---

## 26. Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `Cmd+K` / `Ctrl+K` | Global | Open command palette |
| `?` | Global (not in input) | Open shortcuts help modal |
| `C` | Global (not in input) | Open create item dialog |
| `E` | Epics page (not in input) | Create epic |
| `M` | Global (not in input) | Assign to me |
| `T` | Global (not in input) | Navigate to Today |
| `B` | Global (not in input) | Navigate to Board |
| `L` | Global (not in input) | Navigate to Backlog |
| `S` | Global (not in input) | Navigate to Sprints |
| `G` then `E` | Global (not in input) | Navigate to Epics (chord) |
| `/` | Global (not in input) | Focus search |
| `Cmd+P` | Sidebar | Toggle project switcher |
| `Escape` | Any overlay | Close palette/modal/drawer |
| `Tab` / `Shift+Tab` | Command palette | Cycle type filters |
| `Arrow Up/Down` | Command palette / Combobox | Navigate results |
| `Enter` | Command palette / Combobox | Select / activate |
| `Cmd+Enter` | MentionTextarea | Submit comment |

All shortcuts skip when focus is in an input, textarea, or contentEditable element.

---

## 27. Settings & Preferences

### Instance Settings

Key-value store (`instance_settings` table). Admin-only writes. Currently stores:
- Instance name
- Retention days (default 7)
- Other configurable instance parameters

### Notification Preferences

Per-user, per-notification-type, per-channel (in_app/email/push) enable/disable.

### Project Settings (7 tabs)

| Tab | Features |
|-----|----------|
| **General** | Name, prefix, description, estimation scale, default sprint duration |
| **Members** | Add/remove members, change roles, invite |
| **Board statuses** | Add/edit/delete/reorder custom statuses, color picker, WIP limits, category |
| **Labels** | Create/edit/delete labels with name + color |
| **Notifications** | Project-specific notification preferences |
| **Integrations** | Webhook/Slack/GitHub integration setup |
| **Danger zone** | Archive/delete project (with confirmation) |

---

## 28. Data Retention & Cleanup

### Retention Cron

Daily at 3 AM with `pg_try_advisory_lock(991004)`:

| Action | Details |
|--------|---------|
| Hard-delete soft-deleted work items | Past grace window (`retentionDays`, default 7) |
| Hard-delete soft-deleted comments | Past grace window |
| Hard-delete soft-deleted retro cards | Past grace window |
| Clean up orphaned attachments | Storage objects for deleted items |
| Prune old activity logs | Non-status-change rows older than 180 days (preserves status changes for cumulative flow chart) |

Dry-run mode: `RETENTION_DRY_RUN=true` logs actions without deleting.

---

## 29. Health & Monitoring

### Health Check

`GET /health` (public):
- **Database**: `SELECT 1` — 503 if disconnected
- **MinIO**: HTTP probe to `/minio/health/live` (1.5s timeout) — degraded if down
- **SMTP**: configured/not-configured check — degraded if not configured

Only database failure triggers 503. MinIO and SMTP are reported as degraded states.

### Migration Drift

`GET /health/migrations` (admin only): compares applied migration names against expected registry. Detects drift between code and database state.

---

## 30. API Infrastructure

The backend has a layered infrastructure that applies to every endpoint.

### Response Envelope

All API responses are wrapped by the `ResponseEnvelopeInterceptor` into a standard shape:

```json
{
  "success": true,
  "code": "S-0100",
  "message": "Work item created",
  "data": { ... }
}
```

Every controller method is decorated with `@ResponseCode('S-XXXX')` from the response codes registry (`common/constants/response-codes.ts`), which contains 90+ success codes and 40+ failure codes organized by module.

### Guards

| Guard | Purpose |
|-------|---------|
| **JwtAuthGuard** | Extends Passport `AuthGuard('jwt')`. Skips if `@Public()` decorator present. Applied globally |
| **ProjectAccessGuard** | Validates `:projectId` param exists, project exists, user is member (admin bypasses). Blocks mutations on archived projects (except archive/unarchive/hard-delete). Sets `request.projectRole` |
| **RolesGuard** | Checks `@Roles()` metadata. Admin always passes. Project routes use `request.projectRole` (set by ProjectAccessGuard), never falls back to global role (fail-closed). Non-project routes use global `user.role` |

### Custom Decorators

| Decorator | Purpose |
|-----------|---------|
| `@Public()` | Marks route as public, skips JWT validation |
| `@CurrentUser()` | Extracts authenticated user from `request.user` |
| `@Roles(...roles)` | Sets required roles for RolesGuard |
| `@ProjectRole()` | Project-level role decorator |
| `@ResponseCode(key)` | Sets response code metadata for the envelope interceptor |
| `@IsStrongPassword()` | Custom DTO validation: 8-20 chars, upper, lower, number, special |

### Exception Handling

| Filter | Purpose |
|--------|---------|
| **HttpExceptionFilter** | Global exception handler. Formats all errors into the response envelope |
| **MulterExceptionFilter** | Catches file upload errors (size limit, invalid type) and formats them |
| **AppLogicException** | Custom exception class tied to `ResponseCodeKey`. Thrown by services for business-rule violations |

### Helpers

| Helper | Purpose |
|--------|---------|
| `db-error.helper.ts` | Classifies database errors (unique violation, FK violation, etc.) |
| `lexorank.ts` | LexoRank-style sort order generation for drag-and-drop. `calculateMidpoint(before, after)`, `rebalanceSortOrders(count)` |
| `pagination.helper.ts` | Page/limit clamping, `PaginatedResponse` builder (`{ list, total, page, limit, totalPages }`) |
| `sanitize.helper.ts` | `stripHtml()` function for comment/retro card input |
| `validation-errors.helper.ts` | Formats class-validator DTO validation errors into user-friendly messages |

### Email Service

Central email service (`common/services/email.service.ts`) using nodemailer. Handles:
- Invitation emails
- Password reset emails
- Notification emails (when email channel is enabled)

### Swagger / OpenAPI

Full Swagger UI available at `/api/api-docs`. Auto-generated from controller decorators and DTOs.

### Security Middleware

- **Helmet**: Applied globally for security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- **CORS**: Configured for frontend origin
- **Rate limiting**: `@nestjs/throttler` with 30 req / 60s default

### Configuration

- `@nestjs/config` for environment variable management
- `env.validation.ts` validates required env vars on startup (fails fast if missing)
- `database.config.ts` centralizes TypeORM connection config
- `typeorm-cli.config.ts` provides CLI-compatible config for migrations

---

## 31. Filters

The filters module provides dynamic filter options for UI dropdowns.

| Endpoint | Purpose |
|----------|---------|
| `GET /projects/:projectId/filters/:type` | Returns filter options for the given type |

Currently supports the `assignees` type: returns all project members plus instance admins not already in the project. Used by the board's assignee multi-filter and other assignee dropdowns.

---

## 32. Database Schema Summary

**35 tables** in the `public` schema.

### Core Entities
| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `projects` | Projects |
| `project_members` | Project membership (M2M) |
| `project_statuses` | Customizable board columns |
| `work_items` | All item types (epic/story/task/bug/subtask) |
| `sprints` | Sprint definitions |
| `labels` | Project labels |

### Work Item Extensions
| Table | Purpose |
|-------|---------|
| `work_item_associations` | Inter-item links (belongs_to, blocks, etc.) |
| `work_item_acceptance_criteria` | Structured acceptance criteria |
| `work_item_labels` | Label assignments (M2M) |
| `work_item_watchers` | Watch subscriptions (M2M) |
| `checklist_items` | Task checklists |
| `story_release_notes` | Release notes (1:1 with story) |

### Communication
| Table | Purpose |
|-------|---------|
| `comments` | Work item comments |
| `comment_mentions` | @mention records |
| `comment_reactions` | Emoji reactions |
| `attachments` | File metadata |

### Sprint Extensions
| Table | Purpose |
|-------|---------|
| `sprint_scope_changes` | Scope tracking timeline |
| `sprint_daily_snapshots` | Burndown data points |

### Retrospectives
| Table | Purpose |
|-------|---------|
| `retrospectives` | Retro sessions (1:1 with sprint) |
| `retro_cards` | Retro entries |
| `retro_votes` | Card votes |

### Analytics & Activity
| Table | Purpose |
|-------|---------|
| `activity_logs` | Full audit trail |
| `notifications` | User notifications |
| `notification_preferences` | Per-user notification settings |

### Auth & Admin
| Table | Purpose |
|-------|---------|
| `refresh_tokens` | JWT refresh tokens |
| `invitations` | User invitations |
| `instance_settings` | Key-value config |

### Integrations
| Table | Purpose |
|-------|---------|
| `project_integrations` | Webhook/Slack/GitHub configs |
| `integration_deliveries` | Delivery log with retry tracking |

### Navigation
| Table | Purpose |
|-------|---------|
| `pinned_projects` | User project pins |
| `project_visits` | Recent project visit tracking |

### System
| Table | Purpose |
|-------|---------|
| `migrations` | TypeORM migration history |
| `typeorm_metadata` | TypeORM internal metadata |

**Note on ORM coverage:** Most tables have dedicated TypeORM entity files. The following are managed via raw SQL queries rather than entity classes: `notification_preferences`, `sprint_daily_snapshots`, `pinned_projects`, `project_visits`, `work_item_labels` (join table managed by TypeORM relation). `migrations` and `typeorm_metadata` are TypeORM internal tables.

### Notable Constraints

| Constraint | Purpose |
|------------|---------|
| One active sprint per project | Partial unique index on `sprints` WHERE `status='active'` |
| One pending invite per email | Partial unique index on `invitations` WHERE `status='pending'` |
| Daily notification dedup | Partial unique index preventing duplicate sprint_ending/task_due_soon/task_overdue per user per day |
| Association uniqueness | `(itemId, linkedItemId, linkType)` unique |

### Advisory Locks

| Lock Key | Purpose |
|----------|---------|
| 991001 | First-user setup wizard |
| 991002 | Notification cron dedup |
| 991003 | Sprint daily snapshot cron |
| 991004 | Retention sweep cron |
| 991005 | Integration delivery cron |

### Cron Jobs

| Schedule | Purpose |
|----------|---------|
| Daily 00:05 UTC | Materialize sprint daily snapshots |
| Daily 3 AM | Retention sweep (hard-delete past grace period + prune old activity) |
| Daily 9 AM | Notification cron (sprint ending, tasks due, tasks overdue) |
| Every 1 minute | Process pending webhook deliveries |
| Every 30 seconds | Reap stale presence entries |

---

## 33. Design System

### Typography

| Use | Font | Size |
|-----|------|------|
| Page headings | Instrument Serif | 36px |
| Detail page headings | Geist (sans) | 20px semibold |
| Eyebrows | Instrument Serif | 10-11px uppercase, letter-spaced |
| Body text | Geist | 13-14px |
| Mono (IDs, points, code) | Geist Mono | 10.5-11.5px |

### Colors

| Token | Value | Use |
|-------|-------|-----|
| paper | #FAF8F5 | Page background |
| card | #FFFFFF | Card background |
| ink | #1A1424 | Primary text, filled buttons |
| text | #1A1424 | Body text |
| mute | #443458 | Secondary text |
| faint | #7A6F88 | Tertiary text, placeholders |
| rule | #E8E4EC | Borders, dividers |
| accent / lilac | #7C3AED | Brand purple, active states |
| shade | #F0ECF4 | Hover backgrounds |
| forest | #22763B | Success, done status |
| ember | #E05252 | Error, danger, cancelled |

### Component Patterns

- **No border radius** on cards, containers, and bordered buttons (enforced at component level)
- **No dark mode** — light-only app, no `dark:` Tailwind variants
- **StatusPill** supports 20+ status keys with 4 rendering modes (default, solid, caps, block)
- **TypeTag** — single-letter colored square (T/B/S/E/s) with size variants
- **Button** — 7 variants (primary, secondary, danger, ghost, success, ink, outline)
- **Elevation** — minimal shadows, rely on borders (`border-rule`)

---

## 34. Frontend Component Library

### UI Primitives (`components/ui/` — 26 files)

#### Form Controls

| Component | Description |
|-----------|-------------|
| **Button** | 7 variants: primary, secondary, danger, ghost, success, ink, outline. 2 sizes: sm, md. Sharp corners for outline/secondary |
| **Input** | `forwardRef`. Types: text, email, search, date, number, password. Password type has built-in show/hide toggle |
| **PasswordInput** | Standalone password input with show/hide toggle using Lucide icons |
| **NumberInput** | Integer-only input. Blocks non-numeric keys. Handles paste validation. Returns `number | null` |
| **Textarea** | `forwardRef`. Standard textarea with consistent styling |
| **Select** | Built on `@radix-ui/react-select`. Portal dropdown, 240px max height |
| **Combobox** | Custom searchable dropdown. Keyboard navigation (ArrowDown/Up/Enter/Escape), custom `renderOption`, prefix elements |
| **StoryPointsInput** | 3 scales: fibonacci (button row), t-shirt (button row), free (text input). Toggle-to-deselect |
| **StoryPointsLabel** | Display-only formatted story points |
| **LabelPicker** | Fetches project labels from API. Toggle-to-select/deselect with colored pills |
| **MentionTextarea** | @mention autocomplete textarea. Detects `@` trigger, filtered member dropdown (max 6), inserts `@[Name]` syntax. Cmd+Enter submit |

#### Display Components

| Component | Description |
|-----------|-------------|
| **Avatar** | 4 sizes: xs (22px), sm (28px), md (32px), lg (36px). Image or colored-circle initials fallback. Color keyed on `user.id` |
| **AvatarStack** | Overlapping avatars with `+N` overflow indicator. Max configurable (default 5) |
| **TypeTag** | Single-letter colored square: T (task), B (bug), S (story), E (epic), s (subtask). Sizes: xs (14px), sm (16px), md (20px) |
| **StatusPill** | 20+ status keys. 4 modes: default (rounded soft), solid (filled), caps (uppercase border), block (full-width solid). Optional dot and hint |
| **RoleBadge** | 4 role styles: Admin (ink), PM (lilac), Member (white), Viewer (muted) |
| **MetricNumber** | Serif numeric display. Sizes: sm (22px), md (30px), lg (36px), xl (48px), or custom px. Optional italic |
| **LabelBadge / LabelList** | Colored label pill. LabelList shows max N + overflow count |
| **CommentBody** | Renders comment text with @mention highlighting in accent blue |
| **ChildrenProgressBar** | Segmented done (green) / WIP (tan) / open (light) bar with legend |
| **MarkdownField** | Click-to-edit markdown field. View: react-markdown + remark-gfm. Edit: auto-expanding textarea |

#### Layout Primitives

| Component | Description |
|-----------|-------------|
| **Eyebrow** | Uppercase, letter-spaced, serif label. Sizes: sm (10px), md (11px) |
| **PageHeader** | Band with padding (20px top, 28px sides, 16px bottom) and bottom hairline border |
| **Tabs** | Underline-style tab strip. Optional icon, label, numeric badge. Active = 2px lilac bottom border |
| **KbdKey** | Monospaced keyboard-key chip. 2 tones: default (page bg) and on-accent (against filled buttons) |
| **Logo** | Wordmark SVG component. 2 variants: dark, light. Aspect ratio 5:1 |

### Common Components (`components/common/` — 17 files)

| Component | Description |
|-----------|-------------|
| **CommandPalette** | Global search modal (Cmd+K). Sections: work items, projects, sprints, people, quick actions, go to. 200ms debounced, scope toggle, keyboard navigation, open-by-ID |
| **CreateItemDialog** | Drawer-based form for creating any item type. Dynamic fields by type. Supports `bare` mode. Invalidates React Query caches |
| **CreateProjectDialog** | Modal: name (auto-generates prefix), prefix, description |
| **Drawer** | Right-side panel on `@radix-ui/react-dialog`. Fixed below topbar (49px offset). Configurable width, stacking, pushed mode. Exports DrawerHeader, DrawerBody, DrawerFooter |
| **Modal** | Accessible dialog on `@radix-ui/react-dialog`. Focus trap, scroll lock, portal, backdrop click close (configurable) |
| **ConfirmDialog** | Title + message + confirm/cancel. Optional `danger` mode (red confirm button) |
| **EmptyState** | 3 variants: card (filled bg), dashed (dashed border), inline (italic text) |
| **ErrorBoundary** | React class component. Full-screen error recovery with "Refresh page" button |
| **ErrorState** | AlertCircle icon + message + "Try again" button |
| **ReadOnlyBanner** | Horizontal bar: "You have view-only access to this project". Viewer role only |
| **RoleGate** | Conditional rendering by role. Supports `minRole` (hierarchical) or `roles` (explicit list) |
| **SaveStatusIndicator** | Shows saving spinner, saved cloud icon, or error triangle. Driven by `SaveStatus` type |
| **ShortcutsHelp** | Keyboard shortcuts modal. Content driven by `lib/keymap.ts`. Grouped sections with key+label rows |
| **AssigneeMultiSelect** | Multi-select dropdown with search, checkboxes, clear-all. Used in board toolbar |
| **Skeleton / CardSkeleton / RowSkeleton** | Animated pulse loading placeholders |
| **Toast / ToastProvider** | Pub/sub toast system. 4 types: success (mint), warning (tan), error (red), info (lilac). 3s auto-dismiss. Portal rendering |
| **Tooltip** | Hover-triggered tooltip. Portal rendering. Positioned above trigger |

### Domain Components

#### Board (`components/board/` — 3 files)

| Component | Description |
|-----------|-------------|
| **KanbanBoard** | DnD board with @dnd-kit. Sprint/assignee/priority filters, optimistic drag, socket sync, quick-add per column, TaskDetailPanel via `?task=` param |
| **StatusColumn** | Droppable column. Color dot header, WIP limit display, task count, quick-add form |
| **TaskCard** | Draggable card. Type badge + key + parent ref, title (blocker lock icon), labels, points + subtask progress + avatar. Red left border when blocked |

#### Tasks (`components/tasks/` — 1 file)

| Component | Description |
|-----------|-------------|
| **TaskDetailPanel** | 1212-line slide-over drawer. Inline title editing, auto-save, 2-column property grid, markdown description, labels, all 6 association link types with paginated search picker + infinite scroll, subtask list, checklist, dependencies, attachments with image preview, comments with @mentions. Supports `bare` mode |

#### Dashboard (`components/dashboard/` — 11 files)

| Component | Description |
|-----------|-------------|
| **AdminDashboard** | Instance-wide: StatCardGrid, all projects, team workload table, blocked tasks, recent activity |
| **PMDashboard** | PM view: sprint health, burndown preview, team workload bars, my tasks, deadlines, epic progress |
| **MemberDashboard** | IC view: my focus, active sprints, due/blocked items, activity on my tasks |
| **ViewerDashboard** | Read-only: projects, sprint progress, epic progress, completions, team members |
| **GreetingBar** | Time-of-day greeting with date eyebrow and summary text |
| **StatCard / StatCardGrid** | Card with icon, label, serif value, optional subtext/progress bar. Grid: 2-col mobile, 4-col desktop |
| **DashboardSection / TwoColumnLayout** | Fixed-height (340px) scrollable section with optional "View all" link |
| **ProjectCard** | Compact row: prefix badge, name, open/total tasks, sprint progress bar |
| **TaskRow** | Priority dot, blocker icon, task key, title, status pill, due label |
| **ActivityItem** | Avatar initial + actor + action + task key + title + timeAgo |
| **TeamWorkloadBar** | Horizontal bar: avatar + name + load bar (green/tan/red) + overdue count |

#### Sprints (`components/sprints/` — 4 files)

| Component | Description |
|-----------|-------------|
| **BurndownChart** | @nivo line chart. Actual (step, black), Ideal (dashed), Projection (dashed purple). Today marker. Legend + projected ship |
| **VelocityChart** | Sparkline bar chart. Current = purple, cancelled = faded, completed = ink. Mono sprint labels |
| **ScopeTimeline** | Vertical timeline with square nodes. Actions: added (forest), removed (purple), commit (ink), goal (ink). Avatar, time, points delta |
| **WorkloadBar** | Per-member stacked bar: done (forest) + in-progress (ink) + over-capacity (purple). Capacity track |

#### Epics (`components/epics/` — 8 files)

| Component | Description |
|-----------|-------------|
| **EpicCard** | Left colored bar by status. TypeTag + key + StatusPill + P0 badge + lead avatar. Title, labels, progress bar, counts, target date, blocked-by |
| **EpicStatStrip** | 5-cell summary: total, in flight, needs attention, children done, next target |
| **EpicDetailStatStrip** | 5-cell detail: items done, in progress, open, story points, target date |
| **EpicChildRow** | Child item row in epic detail StoriesTab |
| **EpicForecast** | Velocity-based forecast visualization for epic completion |
| **EpicsEmptyState** | Empty state for epics listing |
| **AcrossSprintsTimeline** | Timeline visualization showing epic work distributed across sprints |

#### Notifications (`components/notifications/` — 1 file)

| Component | Description |
|-----------|-------------|
| **NotificationBell** | Bell icon with unread badge (9+ cap). Dropdown panel, "Mark all read", socket `notification:new` listener, toast on new, click navigation by referenceType |

#### Settings (`components/settings/` — 7 files)

| Component | Description |
|-----------|-------------|
| **GeneralTab** | Project name, prefix, description, status |
| **MembersTab** | Members table: role select, invite, remove |
| **BoardTab** | Status management: add/edit/delete/reorder, color picker, WIP limit, category |
| **LabelsTab** | Labels CRUD: name, color picker |
| **NotificationsTab** | Notification preferences for the project |
| **IntegrationsTab** | External integrations configuration |
| **DangerZoneTab** | Delete project with confirmation |

#### Layout (`components/layout/` — 4 files)

| Component | Description |
|-----------|-------------|
| **AppShell** | Main authenticated layout. Sidebar + TopBar + Outlet. Loads user, connects socket, joins project rooms, mounts global overlays |
| **Sidebar** | 220px fixed. Project switcher (Cmd+P), nav sections (Work + Project), active sprint footer card |
| **TopBar** | 49px bar. Logo, breadcrumb, "Jump to anything..." button, NotificationBell, AvatarMenu |
| **SetupWizardLayout** | Layout wrapper for the 4-step setup wizard |

### Sub-Page Components

#### Sprint Detail (`pages/sprint-detail/` — 5 files)
- **OverviewTab**: status counters, BurndownChart, grouped item list by status
- **ScopeChangesTab**: 4-cell stat box + ScopeTimeline
- **SettingsTab**: goal, schedule, carry-over policy, capacity, sprint operations
- **OverviewSidebar**: dates, workload bars, type breakdown, recent activity
- **SettingsSidebar**: sprint identity, audit trail

#### Epic Detail (`pages/epic-detail/` — 6 files)
- **OverviewTab**, **StoriesTab**, **TimelineTab**, **SettingsTab**
- **EpicSidebar**, **EpicIdentitySidebar**

#### Story Detail (`pages/story-detail/` — 10 files)
- **OverviewTab**, **TasksTab**, **SettingsTab**
- **StoryRightRail**: metadata sidebar with patch-on-change
- **StoryHeaderActions**: approve, reopen, watch, release notes, status change
- **StoryDiscussion**: comments section
- **AcceptanceCriteria**: criteria checklist CRUD
- **LinkItemDialog**: search and link items
- **ReleaseNotesDrawer**: release notes editor
- **types.ts**: StoryDetail, DetailUser, TaskRow types

#### Stories (`pages/stories/` — 7 files)
- **StoriesStatsStrip**, **StoriesTable**, **StoriesViewToggle**, **StoriesEmptyState**, **StoriesFilterPopover**
- **helpers.ts**: `filterStories()` and `groupStories()` logic
- **types.ts**: StoryListItem, StoryStats, EpicListItem, StoryView, StoryFilters

---

## 35. Frontend Hooks & Utilities

### Custom Hooks (`hooks/` — 3 files)

| Hook | Purpose |
|------|---------|
| **useKeyboardShortcuts** | Global keyboard handler. Skips inputs/textareas/contentEditable. Handles: `/` (focus search), `C` (create), `M` (assign to me), `?` (shortcuts help), `T`/`B`/`L`/`S` (navigation), `G then E` (epics chord) |
| **useRole** | RBAC permission hook. Fetches project membership. Returns: `role`, `globalRole`, `isAdmin`, `isPM`, `isMember`, `isViewer`, `canAdminister`, `canManageProject`, `canEdit`, `isReadOnly`, `hasRole(minRole)` |
| **useTaskAutoSave** | Auto-save for task fields. `saveFieldFull` (save + reload), `saveFieldQuiet` (save, no reload), `debouncedFieldChange` (1.5s debounce for text), `handleFieldChange` (immediate for selects), `saveAssignee`. Tracks `SaveStatus`: idle/saving/saved/error |

### Utilities (`lib/` — 7 files)

| Module | Purpose |
|--------|---------|
| **socket.ts** | Socket.IO singleton. `connectSocket()`, `disconnectSocket()`, `getSocket()`, `updateSocketAuth()`, `joinProject(id)`, `leaveProject(id)`. WebSocket-only transport |
| **keymap.ts** | Keyboard shortcut definitions organized by section. Cross-platform `MOD_KEY` detection. Drives ShortcutsHelp modal |
| **colors.ts** | Design token palette: `BRAND`, `PRIORITY_BADGE_COLORS`, `PRIORITY_BORDER_COLORS`, `PRIORITY_DOT_COLORS`, `STATUS_BADGE_COLORS`, `AVATAR_COLORS`, `TYPE_ICON_COLORS`, `TYPE_TAG_BG`, `PROJECT_DOT_COLORS`, `PROJECT_STATUS_PALETTE` |
| **utils.ts** | `cn()` function — `clsx` + `tailwind-merge` for className composition |
| **password.ts** | `checkPassword` (validation rules), `validatePassword` (returns error string), `passwordStrength` (0-4 segments: weak/fair/strong) |
| **query-client.ts** | React Query `QueryClient` instance: 5min staleTime, retry 1, no refetchOnWindowFocus |
| **lexorank.ts** | Fractional indexing for sort ordering. `calculateMidpoint(before, after)`, `rebalanceSortOrders(count)`. Alphabet a-z, no trailing 'a' |

### API Layer (`api/` — 2 files)

| Module | Purpose |
|--------|---------|
| **client.ts** | Axios instance at `/api`. Request interceptor injects Bearer token. Response interceptor handles 401 with deduplicated refresh. Updates socket auth on refresh |
| **epics.ts** | Typed Epic API module. 7 display states, full CRUD functions (`getEpics`, `getEpicsSummary`, `getEpic`, `getEpicChildren`, `getEpicRecent`, `updateEpic`, `shipEpic`, `reopenEpic`, `archiveEpic`, `unarchiveEpic`, `detachEpicChildren`), `epicStateToPill` mapping |

### State Management (`store/` — 1 file)

| Store | Purpose |
|-------|---------|
| **auth.store.ts** | Zustand store. `User` type (id, email, displayName, role, avatarUrl). `AuthStatus` ('loading'/'authed'/'anon'). Actions: `login`, `logout`, `setUser`, `setAuthStatus`. Token storage in localStorage |

---

## 36. Technology Stack

### Backend
| Technology | Purpose |
|------------|---------|
| NestJS | Application framework |
| TypeORM | ORM + migrations |
| PostgreSQL | Primary database |
| Socket.IO | Real-time WebSocket |
| MinIO (@aws-sdk/client-s3) | S3-compatible file storage |
| Passport + JWT | Authentication |
| bcrypt | Password hashing |
| EventEmitter2 | Internal event bus (18+ event types) |
| @nestjs/throttler | Rate limiting (30 req / 60s) |
| @nestjs/schedule | Cron jobs (uses `@Cron` decorator) |
| @nestjs/config | Environment variable management |
| @nestjs/swagger | OpenAPI / Swagger UI at `/api/api-docs` |
| class-validator + class-transformer | DTO validation and transformation |
| nodemailer | Email sending |
| helmet | Security headers middleware |
| SWC (@swc/core + unplugin-swc) | Fast TypeScript compilation |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| React Router v7 | Routing (BrowserRouter, nested routes) |
| Zustand | Auth state management |
| TanStack React Query | Server state caching (5min stale, retry 1) |
| Axios | HTTP client with JWT interceptor |
| @dnd-kit | Drag-and-drop (board, backlog, sprint planning) |
| @nivo | Charts (ResponsiveLine, ResponsiveBar) |
| @radix-ui (11 packages) | Accessible primitives: Select, Dialog, Dropdown Menu, Popover, Switch, Separator, Slot, Avatar, Label, and more |
| Tailwind CSS | Utility-first styling (light-only) |
| class-variance-authority (CVA) | Component variant management |
| clsx + tailwind-merge | className composition |
| Socket.IO Client | Real-time events |
| react-markdown + remark-gfm | Markdown rendering |
| vite-plugin-svgr | SVG as React components |
| Lexorank (custom) | Fractional indexing for sort ordering |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Vite | Frontend build tool + dev server |
| PostgreSQL | Primary data store (35 tables, 55 FK relationships) |
| MinIO | Object storage (SSL, auto-bucket) |
| SMTP | Email delivery (invites, password reset, notifications) |

---

## Event Bus Summary

The backend uses NestJS EventEmitter2 for cross-module communication. 18+ event types flow between modules:

| Event | Producers | Consumers |
|-------|-----------|-----------|
| `work_item.created` | WorkItemsService | Activity, Notifications, Integrations, Gateway, Directory |
| `work_item.updated` | WorkItemsService | Activity, Sprints (scope), Integrations, Gateway, Directory |
| `work_item.deleted` | WorkItemsService | Activity, Attachments (cleanup), Gateway |
| `work_item.assigned` | WorkItemsService | Notifications |
| `work_item.sprint_assigned` | WorkItemsService | Sprints (scope tracking) |
| `board.moved` | BoardService | Gateway, Directory |
| `sprint.started` | SprintsService | Notifications, Integrations, Gateway, Directory |
| `sprint.completed` | SprintsService | Retrospectives (auto-create), Integrations, Gateway, Directory |
| `sprint.cancelled` | SprintsService | Activity |
| `comment.added` | CommentsService | Activity, Notifications, Integrations, Gateway, Directory |
| `comment.mentioned` | CommentsService | Notifications |
| `story.approved` | WorkItemsService | Notifications |
| `attachment.added` | AttachmentsService | Activity |
| `project.member_added` | ProjectsService | Notifications |
| `project.deleted` | ProjectsService | Attachments (storage cleanup) |
| `notification.created` | NotificationsService | Gateway (real-time push) |

---

## API Endpoint Count

| Module | Endpoints |
|--------|-----------|
| Auth | 13 |
| Users | 7 |
| Projects (core) | 10 |
| Project members | 3 |
| Project statuses | 5 |
| Project labels | 4 |
| Work items (core CRUD) | 11 |
| Work items (watchers) | 3 |
| Work items (associations) | 3 |
| Work items (checklist) | 3 |
| Acceptance criteria | 5 |
| Story workflow | 4 |
| Hierarchy views | 3 |
| Sprints | 12 |
| Epics | 13 |
| Board | 2 |
| Comments | 5 |
| Attachments | 4 |
| Notifications | 4 |
| Activity | 3 |
| Charts | 2 |
| Dashboard | 1 |
| Search | 1 |
| Today | 1 |
| Directory | 6 |
| Filters | 1 |
| Preferences | 4 |
| Retrospectives | 9 |
| Integrations | 6 |
| Presence | 1 |
| Health | 2 |
| **Total** | **~157** |

---

## Frontend Route Map

### Public Routes
| Path | Page |
|------|------|
| `/login` | LoginPage |
| `/register` | RegisterPage |
| `/setup/:step` | SetupWizardPage |

### Authenticated Routes (inside AppShell)
| Path | Page |
|------|------|
| `/today`, `/dashboard` | TodayHome (redirector) |
| `/projects/:id/today` | TodayPage |
| `/dashboard-legacy` | DashboardPage (role-specific) |
| `/projects` | ProjectsPage (directory) |
| `/projects/:id/board` | BoardPage |
| `/projects/:id/backlog` | BacklogPage |
| `/projects/:id/tasks/:taskId` | TaskDetailPage |
| `/projects/:id/sprints` | SprintsPage |
| `/projects/:id/sprints/:sprintId` | SprintDetailPage |
| `/projects/:id/sprints/:sprintId/planning` | SprintPlanningPage |
| `/projects/:id/sprints/:sprintId/retro` | RetroPage |
| `/projects/:id/epics` | EpicsPage |
| `/projects/:id/epics/:epicId` | EpicDetailPage |
| `/projects/:id/stories` | StoriesPage |
| `/projects/:id/stories/:storyId` | StoryDetailPage |
| `/projects/:id/charts` | ChartsPage |
| `/projects/:id/settings` | ProjectSettingsPage |
| `/profile` | ProfilePage |
| `/settings` | SettingsPage (admin only) |
