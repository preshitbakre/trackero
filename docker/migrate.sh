#!/bin/sh
set -e

# Ensure the restricted app user exists before running migrations.
# init-db.sh handles this on first Postgres init, but if the volume
# already existed (e.g. retry after a failed first attempt) the init
# script won't re-run. This guarantees the user is always present.
PGPASSWORD="$DATABASE_PASSWORD" psql \
  -h "$DATABASE_HOST" \
  -p "$DATABASE_PORT" \
  -U "$DATABASE_USERNAME" \
  -d "$DATABASE_NAME" \
  -c "
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER:-trackero_app}') THEN
        EXECUTE format('CREATE USER %I WITH PASSWORD %L', '${APP_DB_USER:-trackero_app}', '${APP_DB_PASSWORD:-trackero_app_secret}');
      END IF;
    END
    \$\$;
    GRANT CONNECT ON DATABASE $DATABASE_NAME TO ${APP_DB_USER:-trackero_app};
    GRANT USAGE ON SCHEMA public TO ${APP_DB_USER:-trackero_app};
    ALTER DEFAULT PRIVILEGES FOR ROLE $DATABASE_USERNAME IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER:-trackero_app};
    ALTER DEFAULT PRIVILEGES FOR ROLE $DATABASE_USERNAME IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_USER:-trackero_app};
  "

# Run TypeORM migrations
node ./node_modules/typeorm/cli.js migration:run -d dist/config/migration-cli.config.js

# Grant on any tables the migration just created
PGPASSWORD="$DATABASE_PASSWORD" psql \
  -h "$DATABASE_HOST" \
  -p "$DATABASE_PORT" \
  -U "$DATABASE_USERNAME" \
  -d "$DATABASE_NAME" \
  -c "
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER:-trackero_app};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER:-trackero_app};
  "
