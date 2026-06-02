# Roles & Permissions Reference

Trackero uses a **two-tier role model**: a **global (instance) role** on the user account, and a **project-level role** on the project membership. The two combine at runtime to produce an effective role that gates every action.

---

## Role Hierarchy

```
admin  (global only — not assignable at project level)
  └─ project_manager
       └─ member
            └─ viewer
```

- **Global role** is set at registration (first user = admin; invited users get the role specified in the invitation) and can be changed by an admin via `PUT /users/:id/role`.
- **Project role** is assigned when a user is added to a project (`project_manager`, `member`, or `viewer`). There is no project-level `admin` — global admins bypass membership entirely.

## How the Effective Role is Computed

| Context | Effective role |
|---------|---------------|
| Global admin, any project | `admin` (bypasses all project membership checks) |
| Non-admin, inside a project | Their `project_members.role` for that project |
| Non-admin, outside project context | Their global `users.role` |

The frontend exposes this as capability flags via `useRole()`:

| Flag | Meaning |
|------|---------|
| `canAdminister` | Global admin (manage users, create/delete projects) |
| `canManageProject` | Admin or project PM (settings, members, statuses, labels) |
| `canEdit` | Not a viewer (create/edit items, comment, upload) |
| `isReadOnly` | Viewer (read-only access) |

---

## Admin

The instance-wide superuser. Has implicit full access to every project without needing to be a member.

### What admin CAN do

**Instance management (admin-only)**
- Create projects
- Delete projects (hard delete)
- List all users
- Invite users (single or bulk, up to 50)
- Change any user's global role
- Deactivate / reactivate users
- View pending invitations
- Update instance settings
- View migration health probe

**Project management (shared with project_manager)**
- Update project settings (name, prefix, description)
- Archive / unarchive projects
- Add, remove, and change roles of project members
- Create, update, reorder, and delete project statuses
- Create, update, and delete project labels
- Create, update, delete sprints
- Start, complete, cancel sprints
- Manage integrations (webhooks): create, update, delete, view deliveries, retry
- Approve and reopen stories
- Set retro facilitator, reveal authors, close retrospectives

**Content creation (shared with project_manager and member)**
- Create, update, delete, reorder work items (stories, tasks, bugs, epics)
- Hard-delete work items (`?hard=true` — only admin; non-admins are silently downgraded to soft delete)
- Restore soft-deleted items
- Move items between statuses, assign to sprints, assign to users
- Create, update, delete checklist items
- Create and delete associations (links between items)
- Create, update, delete comments
- Delete any user's comment (not just own)
- Upload and delete attachments
- Create, update, delete acceptance criteria
- Upsert release notes
- Create, update, delete epic milestones
- Ship, reopen, archive, unarchive epics
- Detach children from epics
- Create, update, delete, vote on retro cards
- Move board cards (kanban)

**Read access (shared with all roles)**
- View all projects, items, sprints, epics, stories, backlog, board
- View activity logs (project, sprint, item level)
- View burndown, velocity, cumulative flow charts
- View comments, attachments (presigned download URLs), associations
- View acceptance criteria, release notes, watchers
- Watch / unwatch items
- View presence (who's online)
- View filters

**Cross-cutting (no project scope)**
- Admin-specific dashboard (instance-wide stats, role breakdown, all projects)
- Global search across all projects (no membership filter)
- Directory shows all projects (not just own)
- Appears as assignable in all project assignee lists (even without membership)

### What admin CANNOT do
- Change their own global role (prevents accidental lockout)
- Deactivate themselves
- Demote or remove the last admin

---

## Project Manager

A project-level leadership role. Can manage a project's configuration, members, and sprint lifecycle. Must be an explicit member of a project to access it (unlike admin).

### What project_manager CAN do

**Project management**
- Update project settings (name, prefix, description)
- Archive / unarchive projects
- Add, remove, and change roles of project members
- Create, update, reorder, and delete project statuses
- Create, update, and delete project labels
- Create, update, delete sprints
- Start, complete, cancel sprints
- Manage integrations (webhooks): create, update, delete, view deliveries, retry
- Approve and reopen stories
- Set retro facilitator, reveal authors, close retrospectives

**Content creation (shared with member)**
- Create, update, delete, reorder work items
- Soft-delete work items (hard delete silently downgrades to soft)
- Restore soft-deleted items
- Move items between statuses, assign to sprints, assign to users
- Create, update, delete checklist items
- Create and delete associations
- Create, update, delete comments
- Delete any user's comment (not just own)
- Upload and delete attachments
- Create, update, delete acceptance criteria
- Upsert release notes
- Create, update, delete epic milestones
- Ship, reopen, archive, unarchive epics
- Detach children from epics
- Create, update, delete, vote on retro cards
- Move board cards (kanban)

**Read access (shared with all roles)**
- Everything listed under admin's read access, scoped to projects where they are a member

**Cross-cutting**
- PM-specific dashboard (projects where they are PM, with team progress)
- Global search scoped to own projects
- Directory shows own projects

### What project_manager CANNOT do
- Create or delete projects (admin-only)
- Manage users (invite, deactivate, reactivate, change global roles)
- Update instance settings
- Hard-delete work items
- Remove or demote the last project_manager on a project
- See projects they are not a member of (in search, directory, etc.)

---

## Member

The standard contributor role. Can create and modify content but cannot change project configuration or manage the team.

### What member CAN do

**Content creation**
- Create, update, delete, reorder work items
- Soft-delete work items
- Restore soft-deleted items
- Move items between statuses, assign to sprints, assign to users
- Create, update, delete checklist items
- Create and delete associations
- Create, update, delete own comments
- Upload and delete attachments
- Create, update, delete acceptance criteria
- Upsert release notes
- Create, update, delete epic milestones
- Ship, reopen, archive, unarchive epics
- Detach children from epics
- Create retrospectives
- Create, update, delete, vote on retro cards
- Move board cards (kanban)

**Read access (shared with all roles)**
- Everything listed under admin's read access, scoped to projects where they are a member

**Cross-cutting**
- Member-specific dashboard (personal task-focused: assigned items, due dates)
- Global search scoped to own projects
- Directory shows own projects

### What member CANNOT do
- Create or delete projects
- Update project settings (name, prefix, description)
- Archive / unarchive projects
- Add, remove, or change project members
- Create, update, reorder, or delete statuses
- Create, update, or delete labels
- Create, update, delete sprints
- Start, complete, cancel sprints
- Manage integrations
- Approve or reopen stories (workflow transitions)
- Set retro facilitator, reveal authors, close retrospectives
- Delete another user's comment (can only delete own)
- Hard-delete work items
- Manage users or instance settings

---

## Viewer

Read-only access. Can observe project state but cannot create or modify anything.

### What viewer CAN do

**Read access**
- View all projects they are a member of
- View all work items, sprints, epics, stories, backlog, board
- View activity logs (project, sprint, item level)
- View burndown, velocity, cumulative flow charts
- View comments, attachments (presigned download URLs), associations
- View acceptance criteria, release notes
- View filters
- View presence (who's online)
- View retrospectives (cards visible, author anonymity rules apply)
- Watch / unwatch items (opt in to notifications)
- View watchers

**Cross-cutting**
- Viewer-specific dashboard (read-only summary)
- Global search scoped to own projects
- Directory shows own projects
- Manage own notification preferences

### What viewer CANNOT do
- Create, update, or delete any work item
- Move items, assign items, change statuses
- Create, update, or delete checklist items
- Create or delete associations
- Create, update, or delete comments
- Upload or delete attachments
- Create, update, or delete acceptance criteria
- Create or update release notes
- Move board cards
- Create, update, delete, or vote on retro cards
- Create retrospectives
- Any project management action (settings, members, sprints, labels, statuses)
- Any instance management action (users, projects, instance settings)

---

## Service-Level Permission Rules

Beyond route-level `@Roles()` checks, several services enforce additional business rules:

| Rule | Enforcement |
|------|-------------|
| Comment edit: author only | Only the comment author can update their comment |
| Comment delete: author or leadership | Admin/PM can delete any comment; member can only delete own |
| Hard delete: admin only | `?hard=true` is silently downgraded to soft delete for non-admins |
| Last admin protection | Cannot demote, deactivate, or remove the last global admin |
| Last PM protection | Cannot remove or demote the last project_manager on a project |
| Self-role-change prevention | Admins cannot change their own global role |
| Self-deactivation prevention | Admins cannot deactivate themselves |
| Archived project mutation block | No writes allowed on archived projects (except archive/unarchive/delete) |
| Closed retro mutation block | No card adds/edits/deletes/votes after a retro is closed |
| Sprint status guards | Date changes blocked on non-planning sprints; capacity and carry-over policy changes blocked on completed/cancelled |
| Retro author anonymity | Card authors hidden until facilitator reveals; authors see their own cards |
| Search scope | Admins see all entities; non-admins see only items in their projects |
| Directory scope | Admins see all projects; non-admins see only their own |
| Assignee lists | Admins appear in all project assignee dropdowns even without membership |
| Dashboard routing | Default landing is the Today view (project-scoped). Legacy role-specific dashboards are available at `/dashboard-legacy` (admin = instance stats; PM = team view; member = personal tasks; viewer = summary) |
| Registration | Invite-only after first user; first user becomes admin; invited users get the role from the invitation |
| Deactivated accounts | Cannot log in |

---

## Endpoints Without Role Checks

These endpoints are accessible to any authenticated user regardless of role, or are fully public:

**Authenticated (any role)**
- `GET/PUT /auth/me` — own profile
- `PUT /auth/me/password` — change own password
- `POST /auth/logout` — log out
- `GET /dashboard` — dashboard (role-routed)
- `GET /directory/projects` — project directory (scope-filtered)
- `GET/POST/DELETE /me/pinned-projects` — pin/unpin projects
- `POST /me/project-visits/:projectId` — record visit
- `GET /me/projects/recent` — recent projects sidebar
- `GET /notifications` — list notifications
- `GET /notifications/unread-count` — unread count
- `PUT /notifications/read-all` — mark all read
- `PUT /notifications/:id/read` — mark one read
- `GET /search` — global search (scope-filtered by role)
- `GET /today` — today view (own assignments)
- `GET/PUT /me/notification-preferences` — notification settings (note: implemented with `@Roles(all-four-roles)` rather than no role check; functionally identical but requires role decorator updates if new roles are added)
- `GET /instance-settings` — read instance settings (app name, flags)

**Public (no authentication)**
- `GET /health` — health check
- `GET /auth/setup-status` — first-run check
- `GET /auth/preflight` — client preflight
- `GET /auth/invite-info` — invitation details
- `POST /auth/setup` — first-user setup
- `POST /auth/register` — register via invite
- `POST /auth/login` — log in
- `POST /auth/refresh` — refresh token
- `POST /auth/forgot-password` — request password reset
- `POST /auth/reset-password` — reset password with token

---

## Quick Reference Matrix

| Action | Admin | PM | Member | Viewer |
|--------|:-----:|:--:|:------:|:------:|
| **Instance** | | | | |
| Create project | Y | - | - | - |
| Delete project | Y | - | - | - |
| Manage users (invite/deactivate/roles) | Y | - | - | - |
| Instance settings | Y | - | - | - |
| **Project config** | | | | |
| Update project settings | Y | Y | - | - |
| Archive/unarchive project | Y | Y | - | - |
| Manage members | Y | Y | - | - |
| Manage statuses | Y | Y | - | - |
| Manage labels | Y | Y | - | - |
| Manage integrations | Y | Y | - | - |
| **Sprint lifecycle** | | | | |
| Create/update/delete sprint | Y | Y | - | - |
| Start/complete/cancel sprint | Y | Y | - | - |
| View sprint/burndown/scope | Y | Y | Y | Y |
| **Work items** | | | | |
| Create/update items | Y | Y | Y | - |
| Soft-delete items | Y | Y | Y | - |
| Hard-delete items | Y | - | - | - |
| Restore deleted items | Y | Y | Y | - |
| Move/assign items | Y | Y | Y | - |
| Checklist CRUD | Y | Y | Y | - |
| Associations CRUD | Y | Y | Y | - |
| Acceptance criteria CRUD | Y | Y | Y | - |
| View items/associations/criteria | Y | Y | Y | Y |
| Watch/unwatch | Y | Y | Y | Y |
| **Stories** | | | | |
| Approve story | Y | Y | - | - |
| Reopen story | Y | Y | - | - |
| Release notes (write) | Y | Y | Y | - |
| Release notes (read) | Y | Y | Y | Y |
| **Epics** | | | | |
| Update epic | Y | Y | Y | - |
| Ship/reopen/archive epic | Y | Y | Y | - |
| Milestone CRUD | Y | Y | Y | - |
| Detach children | Y | Y | Y | - |
| View epics | Y | Y | Y | Y |
| **Comments** | | | | |
| Create comment | Y | Y | Y | - |
| Edit own comment | Y | Y | Y | - |
| Delete own comment | Y | Y | Y | - |
| Delete others' comment | Y | Y | - | - |
| View comments | Y | Y | Y | Y |
| React to comment | Y | Y | Y | - |
| **Attachments** | | | | |
| Upload | Y | Y | Y | - |
| Delete | Y | Y | Y | - |
| View/download | Y | Y | Y | Y |
| **Retrospectives** | | | | |
| Create retro | Y | Y | Y | - |
| Add/edit/delete cards | Y | Y | Y | - |
| Vote on cards | Y | Y | Y | - |
| Set facilitator | Y | Y | - | - |
| Reveal authors | Y | Y | - | - |
| Close retro | Y | Y | - | - |
| View retro | Y | Y | Y | Y |
| **Board** | | | | |
| View board | Y | Y | Y | Y |
| Move cards | Y | Y | Y | - |
| **Charts & activity** | | | | |
| Velocity/CFD/burndown | Y | Y | Y | Y |
| Activity logs | Y | Y | Y | Y |
