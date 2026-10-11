// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    reporter: process.env.CI ? 'github' : 'list',
    use: { baseURL: 'http://localhost:4173/', acceptDownloads: true },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'node scripts/serve.mjs dist 4173',
        url: 'http://localhost:4173/',
        reuseExistingServer: !process.env.CI
    }
});
