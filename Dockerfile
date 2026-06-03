# Stage 1: Build everything
FROM node:22-alpine AS builder

WORKDIR /app

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

COPY backend/ ./backend/
RUN cd backend && npm run build
RUN cd backend && npx tsc --outDir ./compiled-migrations --declaration false --module commonjs --target ES2021 --esModuleInterop --skipLibCheck migrations/*.ts

# Frontend — install all deps (vite is a devDep), then build, no test deps needed at runtime
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Backend (Node API)
FROM node:22-alpine AS backend

WORKDIR /app

RUN apk add --no-cache postgresql-client

COPY --from=builder /app/backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/compiled-migrations ./migrations
COPY docker/migrate.sh ./migrate.sh

RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]

# Stage 3: Nginx (frontend + reverse proxy)
FROM nginx:alpine AS nginx

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
