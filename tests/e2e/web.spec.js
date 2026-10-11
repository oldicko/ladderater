// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');


// Opens the header File menu and clicks an item
async function menu(page, selector) {
    await page.click('#btn-file-menu');
    await page.click(selector);
}

// Fails the test if the page talks to anything other than the local server
function guardNetwork(page) {
    const external = [];
    page.on('request', req => {
        const url = req.url();
        if (!url.startsWith('http://localhost:4173/') && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
    });
    return external;
}

async function startWithSample(page) {
    await page.goto('/');
    await expect(page.locator('#startup-screen')).toBeVisible();
    await page.click('#startup-sample');
    await page.click('#startup-start');
    await expect(page.locator('#startup-screen')).toBeHidden();
    await expect(page.locator('.app-container')).toBeVisible();
}

test('startup screen shows the privacy note and the sample board loads without external requests', async ({ page }) => {
    const external = guardNetwork(page);
    await page.goto('/');
    await expect(page.locator('#privacy-note')).toContainText('never leaves your browser');
    await startWithSample(page);
    await expect(page.locator('#header-stats')).toContainText('0 / 15');
    expect(external).toEqual([]);
});

test('pasted CSV is parsed in the browser and progress survives a reload', async ({ page }) => {
    await page.goto('/');
    await page.fill('#startup-csv', 'Name,Counsellor\nAda Test,Cara Coach\n"Bo, Junior",Cara Coach\n');
    await page.click('#startup-start');
    await expect(page.locator('#header-stats')).toContainText('0 / 2');
    await expect(page.locator('.discuss-next-container')).toContainText('Ada Test');
    await page.locator('.discuss-next-container button', { hasText: 'Top' }).first().click();
    await expect(page.locator('#header-stats')).toContainText('1 / 2');
    await page.reload();
    await expect(page.locator('#startup-screen')).toBeHidden();
    await expect(page.locator('#header-stats')).toContainText('1 / 2');
});

test('invalid input shows a clear error instead of starting', async ({ page }) => {
    await page.goto('/');
    await page.fill('#startup-csv', 'Name,Email\nA,a@example.com');
    await page.click('#startup-start');
    await expect(page.locator('#startup-message')).toContainText("'Counsellor' column");
    await page.fill('#startup-csv', 'Name,Counsellor\nA,B');
    await page.fill('#startup-config', '{"bands": []}');
    await page.click('#startup-start');
    await expect(page.locator('#startup-message')).toContainText("non-empty 'bands'");
    await expect(page.locator('#startup-screen')).toBeVisible();
});

test('board exports to CSV and JSON, and the JSON re-imports with rankings intact', async ({ page }, testInfo) => {
    await startWithSample(page);
    await page.locator('.discuss-next-container button', { hasText: 'Top' }).first().click();
    await page.locator('.discuss-next-container button', { hasText: 'Strong' }).first().click();
    await expect(page.locator('#header-stats')).toContainText('2 / 15');

    const [csvDl] = await Promise.all([page.waitForEvent('download'), menu(page, '#btn-export-csv')]);
    const csv = fs.readFileSync(await csvDl.path(), 'utf8');
    expect(csv).toContain('Name,Counsellor,Email,Performance Rank,Performance Band');
    expect(csv).toContain(',1,Top Talent,');
    expect(csv.trim().split('\r\n')).toHaveLength(16);

    const [jsonDl] = await Promise.all([page.waitForEvent('download'), menu(page, '#btn-export-json')]);
    const jsonPath = testInfo.outputPath('board.json');
    await jsonDl.saveAs(jsonPath);
    const snap = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(snap.format).toBe('ladderater-board');

    // Wipe this browser's storage completely, then restore from the file
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#startup-screen')).toBeVisible();
    await page.setInputFiles('#startup-import-file', jsonPath);
    await expect(page.locator('#header-stats')).toContainText('2 / 15');
});

test('Change Data returns to the start screen', async ({ page }) => {
    await startWithSample(page);
    page.once('dialog', d => d.accept());
    await menu(page, '#btn-change-data');
    await expect(page.locator('#startup-screen')).toBeVisible();
});

test('downloaded offline HTML is self-contained and opens the same board', async ({ page, context }, testInfo) => {
    await startWithSample(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), menu(page, '#btn-download-offline')]);
    const file = testInfo.outputPath('offline.html');
    await dl.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('startup-screen');
    const offline = await context.newPage();
    const external = [];
    offline.on('request', r => { if (!r.url().startsWith('file:')) external.push(r.url()); });
    await offline.goto('file://' + file);
    await expect(offline.locator('#header-stats')).toContainText('0 / 15');
    expect(external).toEqual([]);
});

test('committed standalone ladderater.html still works', async ({ page }) => {
    await page.goto('file://' + path.resolve(__dirname, '../../ladderater.html'));
    await expect(page.locator('#header-stats')).toContainText('0 / 15');
    await expect(page.locator('.discuss-next-container')).toContainText('Alice Vance');
});
