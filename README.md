# Trackero

**Open-source agile project management for small teams.**

Trackero is a self-hosted Kanban and sprint management tool built for small teams who want a simple, powerful project tracker without the bloat.

## Features

- **Kanban Board** — drag-and-drop cards between status columns with real-time sync
- **Sprint Management** — planning, active, and completed sprints with burndown charts
- **Epics** — group related work with progress tracking
- **Task Dependencies** — hard blocking with circular dependency detection
- **Subtasks & Checklists** — two-level task hierarchy
- **Retrospectives** — three-column retro boards with voting
- **Charts** — burndown, velocity, and cumulative flow diagrams (Nivo)
- **Real-time** — Socket.IO for live board updates and notifications
- **Notifications** — in-app + email (when SMTP configured)
- **Full-text Search** — PostgreSQL tsvector with relevance ranking
- **Dark Mode** — system preference detection with manual toggle
- **RBAC** — Admin, Project Manager, Member, Viewer roles
- **File Attachments** — S3/MinIO storage with presigned downloads

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS, TypeORM, PostgreSQL |
| Frontend | React 19, Vite, Tailwind CSS |
| Components | shadcn/ui, Radix UI |
| Drag & Drop | @dnd-kit |
| Charts | Nivo (D3-based) |
| Real-time | Socket.IO |
| File Storage | AWS S3 / MinIO |
| Testing | Vitest (unit/integration), Playwright (E2E) |

## Quick Start

### Docker Compose (recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/trackero.git
cd trackero

# Copy environment config
cp .env.example .env

# Edit .env — at minimum set:
#   ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET

# Start all services
docker compose up -d

# App is at http://localhost:3001
# MinIO console at http://localhost:9001
```

### Local Development

```bash
# Prerequisites: Node 20+, PostgreSQL 15+

# Backend
cd backend
cp ../.env.example .env  # Edit with your DB credentials
npm install
npm run migration:run
npm run start:dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# App at http://localhost:5173
# API at http://localhost:3001
# Swagger at http://localhost:3001/api/api-docs
```

### Using dev.sh

```bash
./dev.sh  # Starts both backend and frontend
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | Backend port |
| `APP_URL` | `http://localhost:5173` | Frontend URL (for CORS) |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_USERNAME` | `trackero` | Database user |
| `DATABASE_PASSWORD` | — | Database password |
| `DATABASE_NAME` | `trackero` | Database name |
| `JWT_SECRET` | — | **Required.** Random 64+ char string |
| `ACCESS_TOKEN_EXPIRY` | `15m` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRY` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | — | **Required on first run.** Seed admin email |
| `ADMIN_PASSWORD` | — | **Required on first run.** Seed admin password |
| `S3_ENDPOINT` | `http://localhost:9000` | S3/MinIO endpoint |
| `S3_BUCKET` | `trackero` | S3 bucket name |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `SMTP_HOST` | — | SMTP server (empty = email disabled) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM` | `noreply@trackero.dev` | From address |

## Architecture

```
trackero/
├── backend/          NestJS API server
│   ├── src/
│   │   ├── auth/         JWT authentication, password reset
│   │   ├── users/        User management, invitations
│   │   ├── projects/     Projects, members, statuses, labels
│   │   ├── epics/        Epic grouping with progress tracking
│   │   ├── sprints/      Sprint lifecycle (plan→active→complete)
│   │   ├── tasks/        Tasks, subtasks, checklists, dependencies
│   │   ├── board/        Kanban board with lightweight move
│   │   ├── comments/     Task comments with @mentions
│   │   ├── attachments/  S3 file upload/download
│   │   ├── activity/     Activity log event listeners
│   │   ├── notifications/ In-app + email notifications
│   │   ├── gateway/      Socket.IO real-time gateway
│   │   ├── charts/       Velocity + cumulative flow
│   │   ├── retrospectives/ Sprint retro boards
│   │   ├── search/       Full-text search (PostgreSQL tsvector)
│   │   ├── settings/     Instance configuration
│   │   ├── health/       Health check endpoint
│   │   └── common/       Guards, filters, interceptors, DTOs
│   └── migrations/   TypeORM migrations (auto-run on startup)
├── frontend/         React SPA
│   └── src/
│       ├── pages/        Route-level components
│       ├── components/   Shared UI (board, layout, tasks, notifications)
│       ├── hooks/        Custom hooks (keyboard shortcuts)
│       ├── store/        Zustand auth store
│       ├── api/          Axios client with token refresh
│       └── lib/          Utils, Socket.IO client, React Query
├── e2e/              Playwright E2E tests
├── Dockerfile        Multi-stage production build
└── docker-compose.yml  App + PostgreSQL + MinIO
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Create new task |
| `/` | Focus search |
| `Cmd+K` | Command palette |
| `G` then `B` | Go to board |
| `G` then `L` | Go to backlog |
| `G` then `S` | Go to sprints |
| `G` then `E` | Go to epics |
| `M` | Assign task to me (when panel open) |
| `Esc` | Close panel/modal |
| `?` | Show shortcuts help |

## Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full instance control, user management, all projects |
| **Project Manager** | Manage sprints/epics/members in assigned projects |
| **Member** | Create/edit tasks, comment, upload files |
| **Viewer** | Read-only access, cannot comment or modify |

## API Documentation

Swagger UI is available at `/api/api-docs` when the server is running. All endpoints return a standard envelope:

```json
{
  "success": true,
  "code": "S-0101",
  "data": { ... },
  "message": "Task created",
  "errors": null,
  "validationErrors": null
}
```

## Testing

```bash
# Backend unit/integration tests
cd backend && npm test

# E2E tests (requires running app)
npx playwright test

# Frontend type check
cd frontend && npx tsc --noEmit
```

## License

[AGPL-3.0](LICENSE)
