export const ResponseCodes = {
  // Auth (S-0001 – S-0009)
  AUTH_LOGIN:             { code: 'S-0001', message: 'Login successful' },
  AUTH_REGISTER:          { code: 'S-0002', message: 'Registration successful' },
  AUTH_LOGOUT:            { code: 'S-0003', message: 'Logout successful' },
  AUTH_REFRESH:           { code: 'S-0004', message: 'Token refreshed' },
  AUTH_PROFILE_FETCHED:   { code: 'S-0005', message: 'Profile retrieved' },
  AUTH_PROFILE_UPDATED:   { code: 'S-0006', message: 'Profile updated' },
  AUTH_PASSWORD_CHANGED:  { code: 'S-0007', message: 'Password changed' },
  AUTH_PASSWORD_RESET_SENT: { code: 'S-0008', message: 'Password reset email sent' },
  AUTH_PASSWORD_RESET:    { code: 'S-0009', message: 'Password reset successful' },

  // Users (S-0010 – S-0019)
  USERS_LISTED:           { code: 'S-0010', message: 'Users retrieved' },
  USER_ROLE_UPDATED:      { code: 'S-0011', message: 'User role updated' },
  USER_DEACTIVATED:       { code: 'S-0012', message: 'User deactivated' },
  USER_REACTIVATED:       { code: 'S-0015', message: 'User reactivated' },
  INVITATION_SENT:        { code: 'S-0013', message: 'Invitation sent' },
  INVITATION_ACCEPTED:    { code: 'S-0014', message: 'Invitation accepted' },

  // Projects (S-0020 – S-0029)
  PROJECTS_LISTED:        { code: 'S-0020', message: 'Projects retrieved' },
  PROJECT_CREATED:        { code: 'S-0021', message: 'Project created' },
  PROJECT_FETCHED:        { code: 'S-0022', message: 'Project retrieved' },
  PROJECT_UPDATED:        { code: 'S-0023', message: 'Project updated' },
  PROJECT_DELETED:        { code: 'S-0024', message: 'Project deleted' },
  PROJECT_ARCHIVED:       { code: 'S-0025', message: 'Project archived' },
  PROJECT_MEMBER_ADDED:   { code: 'S-0026', message: 'Member added to project' },
  PROJECT_MEMBER_REMOVED: { code: 'S-0027', message: 'Member removed from project' },
  PROJECT_MEMBER_UPDATED: { code: 'S-0028', message: 'Member role updated' },
  PROJECT_MEMBERS_LISTED: { code: 'S-0029', message: 'Project members retrieved' },

  // Statuses (S-0030 – S-0035)
  STATUSES_LISTED:        { code: 'S-0030', message: 'Statuses retrieved' },
  STATUS_CREATED:         { code: 'S-0031', message: 'Status created' },
  STATUS_UPDATED:         { code: 'S-0032', message: 'Status updated' },
  STATUS_DELETED:         { code: 'S-0033', message: 'Status deleted' },
  STATUSES_REORDERED:     { code: 'S-0034', message: 'Statuses reordered' },

  // Labels (S-0036 – S-0039)
  LABELS_LISTED:          { code: 'S-0036', message: 'Labels retrieved' },
  LABEL_CREATED:          { code: 'S-0037', message: 'Label created' },
  LABEL_UPDATED:          { code: 'S-0038', message: 'Label updated' },
  LABEL_DELETED:          { code: 'S-0039', message: 'Label deleted' },

  // Epics (S-0040 – S-0049)
  EPICS_LISTED:           { code: 'S-0040', message: 'Epics retrieved' },
  EPIC_CREATED:           { code: 'S-0041', message: 'Epic created' },
  EPIC_FETCHED:           { code: 'S-0042', message: 'Epic retrieved' },
  EPIC_UPDATED:           { code: 'S-0043', message: 'Epic updated' },
  EPIC_DELETED:           { code: 'S-0044', message: 'Epic deleted' },
  EPICS_REORDERED:        { code: 'S-0045', message: 'Epics reordered' },

  // Sprints (S-0050 – S-0059)
  SPRINTS_LISTED:         { code: 'S-0050', message: 'Sprints retrieved' },
  SPRINT_CREATED:         { code: 'S-0051', message: 'Sprint created' },
  SPRINT_FETCHED:         { code: 'S-0052', message: 'Sprint retrieved' },
  SPRINT_UPDATED:         { code: 'S-0053', message: 'Sprint updated' },
  SPRINT_DELETED:         { code: 'S-0054', message: 'Sprint deleted' },
  SPRINT_STARTED:         { code: 'S-0055', message: 'Sprint started' },
  SPRINT_COMPLETED:       { code: 'S-0056', message: 'Sprint completed' },
  SPRINT_CANCELLED:       { code: 'S-0057', message: 'Sprint cancelled' },
  SPRINT_BURNDOWN:        { code: 'S-0058', message: 'Burndown data retrieved' },

  // Tasks (S-0105, S-0106, S-0109, S-0110) — surviving task-era keys.
  // The legacy `TASKS_LISTED`/`TASK_CREATED`/`TASK_FETCHED`/`TASK_UPDATED`/
  // `TASK_DELETED`/`TASK_MOVED`/`TASKS_REORDERED` aliases were removed because
  // the unified work-items API uses `ITEM_*` (see below). `BOARD_FETCHED`
  // (S-0109) is retained for the board endpoint; it deliberately shares the
  // S-0109 numeric code with `STORIES_LISTED` but is semantically distinct.
  TASK_STATUS_CHANGED:    { code: 'S-0105', message: 'Task status updated' },
  TASK_ASSIGNED:          { code: 'S-0106', message: 'Task assigned' },
  BOARD_FETCHED:          { code: 'S-0109', message: 'Board retrieved' },
  BOARD_CARD_MOVED:       { code: 'S-0110', message: 'Card moved' },

  // Subtasks (S-0120 – S-0124)
  SUBTASKS_LISTED:        { code: 'S-0120', message: 'Subtasks retrieved' },
  SUBTASK_CREATED:        { code: 'S-0121', message: 'Subtask created' },

  // Checklist (S-0125 – S-0129)
  CHECKLIST_ITEM_CREATED: { code: 'S-0125', message: 'Checklist item added' },
  CHECKLIST_ITEM_UPDATED: { code: 'S-0126', message: 'Checklist item updated' },
  CHECKLIST_ITEM_DELETED: { code: 'S-0127', message: 'Checklist item deleted' },

  // Dependencies (S-0130 – S-0134)
  DEPENDENCIES_LISTED:    { code: 'S-0130', message: 'Dependencies retrieved' },
  DEPENDENCY_CREATED:     { code: 'S-0131', message: 'Dependency added' },
  DEPENDENCY_DELETED:     { code: 'S-0132', message: 'Dependency removed' },

  // Associations (S-0135 – S-0137)
  ASSOCIATION_CREATED:    { code: 'S-0135', message: 'Association created' },
  ASSOCIATION_DELETED:    { code: 'S-0136', message: 'Association removed' },
  ASSOCIATIONS_LISTED:    { code: 'S-0137', message: 'Associations retrieved' },

  // Comments (S-0140 – S-0144)
  COMMENTS_LISTED:        { code: 'S-0140', message: 'Comments retrieved' },
  COMMENT_CREATED:        { code: 'S-0141', message: 'Comment added' },
  COMMENT_UPDATED:        { code: 'S-0142', message: 'Comment updated' },
  COMMENT_DELETED:        { code: 'S-0143', message: 'Comment deleted' },

  // Attachments (S-0150 – S-0154)
  ATTACHMENTS_LISTED:     { code: 'S-0150', message: 'Attachments retrieved' },
  ATTACHMENT_UPLOADED:    { code: 'S-0151', message: 'File uploaded' },
  ATTACHMENT_URL:         { code: 'S-0152', message: 'Download URL generated' },
  ATTACHMENT_DELETED:     { code: 'S-0153', message: 'File deleted' },

  // Activity (S-0160 – S-0162)
  ACTIVITY_LISTED:        { code: 'S-0160', message: 'Activity retrieved' },

  // Notifications (S-0170 – S-0174)
  NOTIFICATIONS_LISTED:   { code: 'S-0170', message: 'Notifications retrieved' },
  NOTIFICATION_READ:      { code: 'S-0171', message: 'Notification marked as read' },
  NOTIFICATIONS_ALL_READ: { code: 'S-0172', message: 'All notifications marked as read' },
  NOTIFICATION_COUNT:     { code: 'S-0173', message: 'Unread count retrieved' },

  // Charts (S-0180 – S-0184)
  VELOCITY_FETCHED:       { code: 'S-0180', message: 'Velocity data retrieved' },
  CUMULATIVE_FLOW:        { code: 'S-0181', message: 'Cumulative flow data retrieved' },

  // Retrospectives (S-0190 – S-0196)
  RETRO_CREATED:          { code: 'S-0190', message: 'Retrospective created' },
  RETRO_FETCHED:          { code: 'S-0191', message: 'Retrospective retrieved' },
  RETRO_CARD_CREATED:     { code: 'S-0192', message: 'Card added' },
  RETRO_CARD_UPDATED:     { code: 'S-0193', message: 'Card updated' },
  RETRO_CARD_DELETED:     { code: 'S-0194', message: 'Card deleted' },
  RETRO_CARD_VOTED:       { code: 'S-0195', message: 'Vote recorded' },

  // Search (S-0200)
  SEARCH_RESULTS:         { code: 'S-0200', message: 'Search results retrieved' },

  // Settings (S-0210 – S-0212)
  SETTINGS_FETCHED:       { code: 'S-0210', message: 'Settings retrieved' },
  SETTINGS_UPDATED:       { code: 'S-0211', message: 'Settings updated' },

  // Dashboard (S-0220)
  DASHBOARD_FETCHED:      { code: 'S-0220', message: 'Dashboard retrieved' },

  // Work Items (S-0100 unified — reuses task code range)
  ITEMS_LISTED:           { code: 'S-0100', message: 'Items retrieved' },
  ITEM_CREATED:           { code: 'S-0101', message: 'Item created' },
  ITEM_FETCHED:           { code: 'S-0102', message: 'Item retrieved' },
  ITEM_UPDATED:           { code: 'S-0103', message: 'Item updated' },
  ITEM_DELETED:           { code: 'S-0104', message: 'Item deleted' },
  ITEM_MOVED:             { code: 'S-0107', message: 'Item moved' },
  ITEM_SPRINT_ASSIGNED:   { code: 'S-0108', message: 'Sprint assigned' },
  STORIES_LISTED:         { code: 'S-0109', message: 'Stories retrieved' },
  BACKLOG_FETCHED:        { code: 'S-0111', message: 'Backlog retrieved' },

  // Health (S-0300)
  HEALTH_OK:              { code: 'S-0300', message: 'Service healthy' },
  MIGRATIONS_FETCHED:     { code: 'S-0301', message: 'Migrations status retrieved' },

  // Presence (S-0500)
  PRESENCE_FETCHED:       { code: 'S-0500', message: 'Presence snapshot retrieved' },

  // Today (S-0070)
  TODAY_FETCHED:          { code: 'S-0070', message: 'Today payload retrieved' },

  // Directory + pinning (S-0080)
  DIRECTORY_FETCHED:      { code: 'S-0080', message: 'Project directory retrieved' },
  PINNED_LISTED:          { code: 'S-0081', message: 'Pinned projects retrieved' },
  PINNED_UPSERTED:        { code: 'S-0082', message: 'Project pinned' },
  PINNED_REMOVED:         { code: 'S-0083', message: 'Project unpinned' },
  VISIT_RECORDED:         { code: 'S-0084', message: 'Project visit recorded' },
  RECENT_LISTED:          { code: 'S-0085', message: 'Recent projects retrieved' },

  // ---- FAILURE CODES ----

  // Validation (F-V)
  VALIDATION_FAILED:      { code: 'F-V-0001', message: 'Validation failed' },

  // Logic failures (F-L)
  NOT_FOUND:              { code: 'F-L-0001', message: 'Resource not found' },
  DUPLICATE_ENTRY:        { code: 'F-L-0002', message: 'Resource already exists' },
  FORBIDDEN:              { code: 'F-L-0003', message: 'Insufficient permissions' },
  UNAUTHORIZED:           { code: 'F-L-0004', message: 'Authentication required' },
  INVALID_CREDENTIALS:    { code: 'F-L-0005', message: 'Invalid email or password' },
  TOKEN_EXPIRED:          { code: 'F-L-0006', message: 'Token has expired' },
  TOKEN_INVALID:          { code: 'F-L-0007', message: 'Invalid token' },
  ACCOUNT_DEACTIVATED:    { code: 'F-L-0008', message: 'Account is deactivated' },
  INVITATION_EXPIRED:     { code: 'F-L-0009', message: 'Invitation has expired' },
  EMAIL_ALREADY_REGISTERED: { code: 'F-L-0010', message: 'Email already registered' },

  // Business rule failures
  SPRINT_ALREADY_ACTIVE:  { code: 'F-L-0020', message: 'A sprint is already active in this project' },
  SPRINT_NO_TASKS:        { code: 'F-L-0021', message: 'Cannot start sprint with no tasks' },
  SPRINT_NOT_PLANNING:    { code: 'F-L-0022', message: 'Sprint must be in planning status' },
  SPRINT_NOT_ACTIVE:      { code: 'F-L-0023', message: 'Sprint is not active' },

  TASK_BLOCKED:           { code: 'F-L-0030', message: 'Task is blocked by a dependency. Resolve the blocker first.' },
  CIRCULAR_DEPENDENCY:    { code: 'F-L-0031', message: 'This dependency would create a circular chain' },
  SUBTASK_NESTING:        { code: 'F-L-0032', message: 'Subtasks cannot have their own subtasks' },
  INVALID_DATE:           { code: 'F-L-0102', message: 'Invalid date range' },
  SUBTASKS_INCOMPLETE:    { code: 'F-L-0103', message: 'All subtasks must be completed before marking this task as done' },
  CHECKLIST_NOT_SUBTASK:  { code: 'F-L-0033', message: 'Checklist items can only be added to subtasks' },

  STATUS_IN_USE:          { code: 'F-L-0040', message: 'Cannot delete status that has tasks assigned to it' },
  STATUS_CATEGORY_REQUIRED: { code: 'F-L-0041', message: 'At least one status per category is required' },

  LAST_ADMIN:             { code: 'F-L-0050', message: 'Cannot remove the last admin. Promote another user first.' },
  CANNOT_DEACTIVATE_SELF: { code: 'F-L-0051', message: 'You cannot deactivate your own account' },
  SELF_ROLE_CHANGE:       { code: 'F-L-0056', message: 'You cannot change your own role' },
  PROJECT_ARCHIVED_ERROR: { code: 'F-L-0052', message: 'This project is archived. Unarchive it to make changes.' },
  RETRO_EXISTS:           { code: 'F-L-0053', message: 'A retrospective already exists for this sprint' },
  LAST_PROJECT_MANAGER:   { code: 'F-L-0054', message: 'Cannot remove or demote the last project manager' },
  PROJECT_NOT_ARCHIVED:   { code: 'F-L-0055', message: 'Project must be archived before it can be deleted' },
  RATE_LIMITED:           { code: 'F-L-0057', message: 'Too many requests. Please try again later.' },

  FILE_REQUIRED:          { code: 'F-L-0060', message: 'File is required' },
  FILE_TOO_LARGE:         { code: 'F-L-0061', message: 'File exceeds maximum allowed size' },
  FILE_TYPE_NOT_ALLOWED:  { code: 'F-L-0062', message: 'File type is not allowed' },

  HAS_DEPENDENCIES:       { code: 'F-L-0070', message: 'Cannot delete: resource has dependent records' },

  // Hierarchy errors (F-L-0090 – F-L-0101)
  // F-L-0092 (EPIC_CANNOT_HAVE_PARENT) and F-L-0100 (ITEM_TYPE_IMMUTABLE) were
  // removed: epic-parent rejection is covered by the generic
  // INVALID_PARENT_CHILD_TYPE, and item-type immutability is enforced by the
  // update DTO simply ignoring the field rather than throwing.
  SUBTASK_REQUIRES_PARENT:       { code: 'F-L-0090', message: 'Subtasks must have a parent task or story' },
  INVALID_PARENT_CHILD_TYPE:     { code: 'F-L-0091', message: 'Invalid parent-child type combination' },
  MAX_DEPTH_EXCEEDED:            { code: 'F-L-0093', message: 'Maximum hierarchy depth exceeded' },
  SUBTASK_NO_SPRINT:             { code: 'F-L-0094', message: 'Subtasks inherit sprint from their parent' },
  STORY_HAS_DIRECT_SUBTASKS:     { code: 'F-L-0095', message: 'Cannot delete story with direct subtasks' },
  TASK_HAS_SUBTASKS:             { code: 'F-L-0096', message: 'Cannot delete task with subtasks' },
  CIRCULAR_REFERENCE:            { code: 'F-L-0097', message: 'This would create a circular reference' },
  CANNOT_REPARENT_WITH_CHILDREN: { code: 'F-L-0098', message: 'Cannot move task with subtasks under another task' },
  CROSS_PROJECT_NOT_ALLOWED:     { code: 'F-L-0099', message: 'Items must be in the same project' },
  ITEM_BLOCKED:                  { code: 'F-L-0101', message: 'This item is blocked. Resolve the blocker first.' },

  // Database failures (F-DB)
  DB_ERROR:               { code: 'F-DB-0001', message: 'Something went wrong. Please try again.' },
} as const;

export type ResponseCodeKey = keyof typeof ResponseCodes;
