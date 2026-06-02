# Contributing to Trackero

We welcome contributions of all kinds — bug fixes, features, documentation, and tests.

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct.

## Getting Started

### Prerequisites

- Node.js 22 or later
- PostgreSQL 15 or later
- Git

### Setup

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/trackero.git
cd trackero

# Backend
cd backend
cp .env.example .env
# Edit .env — at minimum set DATABASE_USERNAME, DATABASE_PASSWORD,
# DATABASE_NAME to match your local Postgres, and generate a JWT_SECRET:
#   openssl rand -hex 32
npm install
npm run migration:run
cd ..

# Frontend
cd frontend
npm install
cd ..

# Start both servers
./dev.sh
# Or run them separately:
#   cd backend  && npm run start:dev   (API at http://localhost:3001)
#   cd frontend && npm run dev         (App at http://localhost:5173)
```

Swagger docs are at http://localhost:3001/docs (or `/api/docs` behind nginx in Docker).

On first visit, a setup wizard creates the admin account. The first user to sign up becomes the admin.

### Docker Alternative

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set JWT_SECRET at minimum
docker compose up -d
```

App at `http://localhost:3000`. MinIO console at `http://localhost:9001`.

## Project Structure

- `backend/src/` — NestJS modules, each feature in its own directory
- `frontend/src/` — React components, pages, hooks, stores
- `e2e/` — Playwright end-to-end tests
- `backend/test/` — Backend e2e tests (Vitest + Supertest)
- `backend/migrations/` — TypeORM migrations

## Coding Standards

### General

- TypeScript strict mode in both backend and frontend
- No `any` types unless absolutely necessary
- No unused imports or variables (enforced by strict TS config)
- Light-only UI — no `dark:` Tailwind variants

### Backend

- Each feature module has: `module.ts`, `controller.ts`, `service.ts`, `dto/`, `entities/`
- Every controller method must have a `@ResponseCode('KEY')` decorator
- Every protected route must have a `@Roles(...)` decorator
- Guards order: `@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)`
- Use TypeORM QueryBuilder for list endpoints (not `.find()` with complex conditions)
- Business logic goes in services, controllers only handle HTTP

### Frontend

- Functional components only, hooks for state and effects
- Tailwind CSS utilities only — no custom CSS classes
- Zustand for auth state, TanStack Query for server data
- API calls go through `src/api/client.ts` (handles token refresh and request dedup)
- Use existing UI components (`Avatar`, `Select`, `Button`, `Input`, etc.) — don't hand-roll equivalents

### Naming

| Context | Convention | Example |
|---------|-----------|---------|
| DB tables | snake_case plural | `project_members` |
| DB columns | snake_case | `created_at` |
| Entities | PascalCase singular | `ProjectMember` |
| Entity props | camelCase | `createdAt` |
| API endpoints | kebab-case plural | `/api/projects` |
| DTOs | PascalCase + Dto | `CreateTaskDto` |
| Components | PascalCase | `TaskCard` |
| Hooks | camelCase + use | `useKeyboardShortcuts` |

## Testing

### Backend Tests (Vitest)

```bash
cd backend
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:regression  # Regression suite only
```

Every endpoint needs tests for:
- Happy path (200/201)
- Authentication failure (401)
- Permission failure (403)
- Validation failure (400)
- Not found (404)

### Frontend Tests (Vitest)

```bash
cd frontend
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### E2E Tests (Playwright)

```bash
# Requires backend + frontend running
npx playwright test
```

### Type Checking

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Commit Messages

Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Examples:
- `feat(tasks): add dependency blocking`
- `fix(board): emit board.moved event for real-time sync`
- `test(e2e): add sprint lifecycle regression spec`

## Pull Request Process

1. Create a branch: `git checkout -b feature/your-feature`
2. Write tests first (TDD preferred)
3. Implement the feature
4. Ensure all tests pass: `cd backend && npm test && cd ../frontend && npm test`
5. Ensure no TS errors in both backend and frontend
6. Push and open a PR against `main`
7. Describe what the PR does and why
8. Link any related issues

## Database Migrations

When changing the schema:

```bash
cd backend

# Auto-generate a migration from entity changes
npm run migration:generate -- migrations/YourMigrationName

# Or write one manually in the migrations/ directory

# Run migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

Rules:
- One migration per feature (don't combine unrelated changes)
- Migrations are immutable once merged — never edit a deployed migration
- Always provide a `down()` method for rollback
- In development, `synchronize: true` auto-syncs entities to the DB — but always create a migration before opening a PR

## Getting Help

- Open an [issue](https://github.com/preshitbakre/trackero/issues) for bugs or feature requests
- Check existing issues before creating a new one
- For architecture context, refer to `docs/TRACKERO-APP-SPEC.md`
