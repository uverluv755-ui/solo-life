const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, webkit, devices } = require('playwright');
const C = require('../progress.js');
const root = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT || path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
let legacyMode = false, nextWorker = false, disconnect = false;
const oldHtml = execFileSync('git', ['show', 'a200901:index.html'], { cwd: root });
const oldWorker = execFileSync('git', ['show', 'a200901:sw.js'], { cwd: root });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  if (disconnect) { req.socket.destroy(); return; }
  let name = new URL(req.url, 'http://localhost').pathname.replace(/^\/solo-life\//, '') || 'index.html';
  if (!/^[\w.-]+$/.test(name) || !fs.existsSync(path.join(root, name))) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(path.join(root, name));
  if (legacyMode && name === 'index.html') data = oldHtml;
  if (legacyMode && name === 'sw.js') data = oldWorker;
  if (!legacyMode && nextWorker && name === 'sw.js') data = Buffer.from(data.toString().replace('solo-life-v03-20261105-1', 'solo-life-v03-test-update'));
  res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
});
const saveOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('solo-life-v01')));
const tab = (page, name) => page.locator(`[data-tab="${name}"]`).click();
const setTime = async (page, time) => {
  await page.clock.setSystemTime(new Date(time));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
};
async function run(engine, url) {
  legacyMode = true; nextWorker = false; disconnect = false;
  const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' }));
  const context = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo', acceptDownloads: true });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.clock.install({ time: new Date('2026-11-02T10:00:00+09:00') });
  try {
    await page.goto(url);
    await page.getByRole('button', { name: '筋力トレーニングを達成', exact: true }).click();
    await tab(page, 'missions');
    await page.locator('#qname').fill('散歩🚶');
    await page.locator('#qstat').selectOption('mind');
    await page.locator('#add').click();
    await tab(page, 'home');
    await page.getByRole('button', { name: '散歩🚶を達成', exact: true }).click();
    await tab(page, 'focus');
    await page.locator('#minutes').selectOption('15');
    await page.locator('#start').click();
    const before = await saveOf(page);
    assert.equal(before.totalXp, 120);
    // v0.2 registers only on HTTPS; localhost is also secure for the migration test.
    await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    legacyMode = false;
    await page.reload();
    await page.waitForFunction(() => window.SoloLife && document.getElementById('weekDays').children.length === 7);
    const migrated = await saveOf(page);
    for (const key of Object.keys(before)) assert.deepEqual(migrated[key], before[key]);
    assert.equal(migrated.schemaVersion, 3);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('solo-life-pre-v03'))), before);
    assert.equal(await page.locator('#minutes').inputValue(), '15');
    assert.equal(migrated.daily['2026-11-02'].quests, 2);
    assert.equal(await page.getByRole('button', { name: '筋力トレーニングを達成', exact: true }).isDisabled(), true);
    await page.locator('#applyUpdate').waitFor({ state: 'visible' });
    await page.locator('#applyUpdate').click();
    await page.waitForFunction(() => document.getElementById('updateNotice').hidden && !!navigator.serviceWorker.controller);
    console.log(engine + ': old app, old worker and active timer migrated without losing data');

    await setTime(page, '2026-11-02T10:16:00+09:00');
    assert.equal((await saveOf(page)).totalXp, 160);
    await page.reload();
    assert.equal((await saveOf(page)).totalXp, 160);
    await tab(page, 'focus');
    assert.equal(await page.locator('#minutes').inputValue(), '15');
    await tab(page, 'home');
    await setTime(page, '2026-11-03T00:01:00+09:00');
    assert.equal(await page.getByRole('button', { name: '筋力トレーニングを達成', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: '筋力トレーニングを達成', exact: true }).click();
    assert.match(await page.locator('#streak').innerText(), /2日/);
    await tab(page, 'missions');
    await page.getByRole('button', { name: '筋力トレーニングを削除', exact: true }).click();
    await tab(page, 'home');
    assert.match(await page.locator('#bossCount').innerText(), /3 \/ 10/);
    console.log(engine + ': midnight reset, repeat prevention, focus reward and deleted quest history passed');

    await tab(page, 'records');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadEvent;
    const backup = fs.readFileSync(await download.path());
    assert.equal(JSON.parse(backup).totalXp, 240);
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
    await page.waitForFunction(() => document.getElementById('toast').textContent === '復元しました');
    assert.equal((await saveOf(page)).totalXp, 240);
    await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"quests":[]}') });
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('読み込めませんでした'));
    assert.equal((await saveOf(page)).totalXp, 240);
    console.log(engine + ': JSON export, restore and invalid backup protection passed');

    const achieved = C.fresh();
    for (let i = 0; i < 7; i++) for (const q of achieved.quests) C.completeQuest(achieved, q.id, new Date(C.shiftDay('2026-11-02', i) + 'T12:00:00+09:00'));
    await setTime(page, '2026-11-08T13:00:00+09:00');
    await page.locator('#import').setInputFiles({ name: 'achieved.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(achieved)) });
    await page.waitForFunction(() => document.getElementById('badgeCount').textContent === '5 / 5 獲得');
    assert.equal(await page.locator('.achievement.unlocked').count(), 5);
    await page.clock.runFor(4100);
    await page.screenshot({ path: path.join(output, engine + '-iphone-records.png'), fullPage: true, scale: 'css' });
    await tab(page, 'home');
    assert.match(await page.locator('#boss').innerText(), /討伐成功/);
    await page.screenshot({ path: path.join(output, engine + '-iphone-home.png'), fullPage: true, scale: 'css' });
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const name of ['home', 'missions', 'focus', 'records']) {
        await tab(page, name);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${engine} ${width}px ${name} overflow`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await tab(page, 'home');
    await setTime(page, '2026-11-09T00:01:00+09:00');
    assert.match(await page.locator('#bossCount').innerText(), /^0 \/ 10/);
    assert.equal(Object.keys((await saveOf(page)).achievements).length, 5);
    console.log(engine + ': all five titles, Monday reset and 320/375/390/430px layouts passed');

    await page.evaluate(async () => { await caches.open('unrelated-app'); });
    nextWorker = true;
    await tab(page, 'missions');
    await page.locator('#qname').fill('更新前の入力');
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await page.locator('#applyUpdate').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#qname').inputValue(), '更新前の入力');
    const savedBeforeUpdate = await saveOf(page);
    await page.locator('#applyUpdate').click();
    await page.waitForFunction(() => document.getElementById('updateNotice').hidden);
    assert.deepEqual(await saveOf(page), savedBeforeUpdate);
    const cachesAfter = await page.evaluate(() => caches.keys());
    assert.ok(cachesAfter.includes('unrelated-app'));
    assert.ok(cachesAfter.includes('solo-life-v03-test-update'));
    assert.equal(cachesAfter.filter(k => k.startsWith('solo-life-')).length, 1);
    // WebKit's setOffline rejects SW navigations even for literal responses:
    // https://github.com/microsoft/playwright/issues/42775
    // Destroy actual server connections instead, so the worker handles network failure.
    if (engine === 'webkit') disconnect = true;
    else await context.setOffline(true);
    await page.goto(url + 'index.html?from=homescreen');
    await page.waitForFunction(() => !!window.SoloLife && document.getElementById('quests').children.length === 3);
    await page.getByRole('button', { name: '読書を20分を達成', exact: true }).click();
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 40);
    await page.reload();
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 40);
    disconnect = false;
    await context.setOffline(false);
    console.log(engine + ': PWA update, scoped cache cleanup, offline navigation and saves passed');
    assert.deepEqual(errors, []);

    const corruptContext = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await corruptContext.addInitScript(() => localStorage.setItem('solo-life-v01', '{broken-save'));
    const corruptPage = await corruptContext.newPage();
    await corruptPage.goto(url);
    assert.equal(await corruptPage.locator('#storageWarning').isVisible(), true);
    assert.equal(await corruptPage.evaluate(() => localStorage.getItem('solo-life-v01')), '{broken-save');
    await corruptContext.close();
    console.log(engine + ': malformed stored save is preserved, not reset');

    const fullContext = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await fullContext.addInitScript(data => {
      localStorage.setItem('solo-life-v01', JSON.stringify(data));
      Storage.prototype.setItem = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
    }, before);
    const fullPage = await fullContext.newPage();
    await fullPage.goto(url);
    assert.equal(await fullPage.locator('#storageWarning').isVisible(), true);
    assert.deepEqual(await saveOf(fullPage), before);
    await fullContext.close();
    console.log(engine + ': full storage never overwrites the original save during migration');
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/solo-life/`;
  try { for (const engine of (process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'])) await run(engine, url); }
  finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
