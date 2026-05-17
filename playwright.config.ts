import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'cd backend && node dist/main.js',
      port: 3001,
      reuseExistingServer: true,
      env: {
        NODE_ENV: 'development',
        DATABASE_HOST: 'localhost',
        DATABASE_PORT: '5432',
        DATABASE_USERNAME: 'preshitbakre',
        DATABASE_PASSWORD: '',
        DATABASE_NAME: 'trackero',
        JWT_SECRET: 'e2e_test_secret_key_64_characters_minimum_required_for_testing',
        APP_URL: 'http://localhost:5173',
        ADMIN_EMAIL: 'admin@trackero.dev',
        ADMIN_PASSWORD: 'admin123456',
        ACCESS_TOKEN_EXPIRY: '15m',
        REFRESH_TOKEN_EXPIRY: '7d',
      },
    },
    {
      command: 'cd frontend && npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
