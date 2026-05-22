# Contributing to Trackero

We welcome contributions of all kinds — bug fixes, features, documentation, and tests.

## Getting Started

### Prerequisites

- Node.js 20 or later
- PostgreSQL 15 or later
- Git

### Setup

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/trackero.git
cd trackero

# Backend setup
cd backend
cp .env.example .env
# Edit .env with your local PostgreSQL credentials
npm install
npm run migration:run
cd ..

# Frontend setup
cd frontend
npm install
cd ..

# Start everything
./dev.sh
```

The backend runs on port 3001, frontend on port 5173. Swagger docs are at http://localhost:3001/api/api-docs.

## Project Structure

- `backend/src/` — NestJS modules, each feature in its own directory
- `frontend/src/` — React components, pages, hooks, stores
- `e2e/` — Playwright end-to-end tests
- `docs/` — Architecture specs (source of truth for the implementation)

## Coding Standards

### General

- TypeScript strict mode in both backend and frontend
- No `any` types unless absolutely necessary (use `as any` sparingly)
- No unused imports or variables (enforced by strict TS)

### Backend

- Each feature module has: `module.ts`, `controller.ts`, `service.ts`, `dto/`, `entities/`
- Every controller method must have `@ResponseCode('KEY')` decorator
- Every protected route must have `@Roles(...)` decorator
- Guards order: `@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)`
- Use TypeORM QueryBuilder for list endpoints (not `.find()` with complex queries)
- Mutations return `PaginatedMutationResponse` (except board move which is lightweight)
- No `synchronize: true` — always use migrations
- Business logic goes in services, controllers only handle HTTP

### Frontend

- Functional components only, hooks for state/effects
- Tailwind CSS utilities only — no custom CSS classes
- Zustand for auth state, React Query for server data
- API calls go through `src/api/client.ts` (handles token refresh)
- Dark mode via Tailwind `class` strategy

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
npm test           # Run all tests
npm run test:watch # Watch mode
```

Every endpoint needs tests for:
- Happy path (200/201)
- Authentication failure (401)
- Permission failure (403)
- Validation failure (400)
- Not found (404)

### E2E Tests (Playwright)

```bash
# Requires backend + frontend running
npx playwright test
```

### Type Checking

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Commit Messages

Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Examples:
- `feat(tasks): add dependency blocking`
- `fix(board): emit board.moved event for real-time sync`
- `test: add e2e tests for sprint lifecycle`

## Pull Request Process

1. Create a branch: `git checkout -b feature/your-feature`
2. Write tests first (TDD)
3. Implement the feature
4. Ensure all tests pass: `cd backend && npm test`
5. Ensure no TS errors in both backend and frontend
6. Push and open a PR against `main`
7. Describe what the PR does and why
8. Link any related issues

## Database Migrations

When changing the schema:

```bash
cd backend

# Create a new migration
npx ts-node --project tsconfig.json -r tsconfig-paths/register \
  node_modules/typeorm/cli.js migration:generate \
  -d src/config/typeorm-cli.config.ts migrations/YourMigrationName

# Or write manually in migrations/ directory

# Run it
npm run migration:run
```

Rules:
- One migration per feature (don't combine unrelated changes)
- Migrations are immutable once merged — never edit a deployed migration
- Always provide a `down()` method for rollback

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues before creating a new one
- For architecture questions, refer to `docs/CONVENTIONS.md`
