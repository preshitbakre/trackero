# Trackero end-to-end tests

## Test suites

| File | What it covers |
|---|---|
| `happy-path.spec.ts` | Full register → project → epic → sprint → tasks → board → burndown flow |
| `rbac.spec.ts` | Role-based access checks (viewer, member, PM permissions) |
| `errors.spec.ts` | Error paths (blocked task completion, duplicate prefix, circular deps) |
| `responsive.spec.ts` | Visual & overflow checks for every route at 4 breakpoints |

## Running

```bash
npx playwright test                       # all suites
npx playwright test e2e/responsive.spec.ts --workers=1
npx playwright test e2e/happy-path.spec.ts
```

The `webServer` block in `playwright.config.ts` starts the backend on `:3001` and
frontend on `:5173` if they are not already running.

## Responsive suite — seed user

`responsive.spec.ts` authenticates as `visualtest@trackero.local` (password
`Visualtest123!`) and screenshots every route at four breakpoints.

If the DB does not already have that user, seed it:

```sql
-- Run from psql or your DB tool
INSERT INTO users (email, display_name, password_hash, role, is_active, token_version, created_at, updated_at)
VALUES (
  'visualtest@trackero.local',
  'Visual Test',
  '$2b$10$shOZH24F4k.TGmqilJteZejMsIzXdWQInuB0LWDbfqPBdUQ/vRNr6',  -- bcrypt of "Visualtest123!"
  'admin',
  true,
  0,
  now(), now()
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, role = 'admin', is_active = true;
```

You also want the user joined to at least one project; the responsive suite picks
the first project visible to the user:

```sql
INSERT INTO project_members (project_id, user_id, role, created_at)
SELECT id, (SELECT id FROM users WHERE email = 'visualtest@trackero.local'),
       'project_manager', now()
FROM projects
ON CONFLICT DO NOTHING;
```

## Throttling — required for full coverage

The backend rate-limits at `THROTTLE_LIMIT` requests per `THROTTLE_TTL` ms
(defaults: **30 requests per 60s per IP**). The responsive suite navigates ~40
authenticated pages back-to-back, blowing past that limit. Symptoms:

- The `project pages have no overflow` tests are **skipped** at every breakpoint
  with the warning `getProject failed: 429`.
- Direct `curl` against `/api/projects` returns `Too many requests`.

To get full coverage, restart the backend with the throttle bumped:

```bash
THROTTLE_LIMIT=5000 THROTTLE_TTL=60000 node backend/dist/main.js
```

Or run the full dev stack with the override:

```bash
THROTTLE_LIMIT=5000 ./dev.sh
```

The Playwright `webServer` block does NOT set these by default. With
`reuseExistingServer: true`, Playwright uses whichever backend is already on
`:3001`. The login + dashboard tests pass even at the default throttle because
the suite intercepts `/auth/me` — but `/projects` is hit directly by the test
harness and there's no clean way to mock that without losing coverage.

## Screenshots

The responsive suite writes one screenshot per (breakpoint, route) under
`test-results/responsive/`. These are *not* committed; they are review artifacts.
The canonical design reference lives in `docs/design-reference/frame-*.png`.
