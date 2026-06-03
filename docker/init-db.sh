#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'trackero_app') THEN
            CREATE USER trackero_app WITH PASSWORD '$APP_DB_PASSWORD';
        ELSE
            ALTER USER trackero_app WITH PASSWORD '$APP_DB_PASSWORD';
        END IF;
    END
    \$\$;

    GRANT CONNECT ON DATABASE $POSTGRES_DB TO trackero_app;
    GRANT USAGE ON SCHEMA public TO trackero_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trackero_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trackero_app;

    ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trackero_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO trackero_app;
EOSQL
