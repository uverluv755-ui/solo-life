const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, webkit, devices } = require('playwright');
const C = require('../progress.js');
const testPlanner = require('./planner-flow.cjs');
const testHabits = require('./habit-flow.cjs');
const testJourney = require('./journey-flow.cjs');
const root = path.resolve(__dirname, '..');
const outputRoot = process.env.TEST_OUTPUT || path.join(root, 'test-results');
fs.mkdirSync(outputRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(outputRoot, 'run-'));
let legacyMode = false, v03Mode = false, nextWorker = false, disconnect = false;
let previousRelease;
const upgradeReleases = [
  { version: 'v0.7', commit: 'e98dbea' },
  { version: 'v0.8', commit: '44be498' },
  { version: 'v0.9', commit: '04badc0' },
  { version: 'v0.9.1', commit: 'cd8bed8' },
  { version: 'v0.10', commit: 'b4ec548' },
  { version: 'v0.10.1', commit: '9138e3a' },
  { version: 'v0.11', commit: 'd63e97a' },
  { version: 'v0.12', commit: 'c109536' },
  { version: 'v0.13', commit: '2d9f5fb' }
].map(release => ({
  ...release,
  files: Object.fromEntries(['index.html', 'app.js', 'progress.js', 'app.css', 'sw.js'].map(name =>
    [name, execFileSync('git', ['show', release.commit + ':' + name], { cwd: root })]))
}));
const v03Files = Object.fromEntries(['index.html', 'app.js', 'progress.js', 'app.css', 'sw.js'].map(name => [name, execFileSync('git', ['show', '92839fb:' + name], { cwd: root })]));
const oldHtml = execFileSync('git', ['show', 'a200901:index.html'], { cwd: root });
const oldWorker = execFileSync('git', ['show', 'a200901:sw.js'], { cwd: root });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  if (disconnect) { req.socket.destroy(); return; }
  let name = new URL(req.url, 'http://localhost').pathname.replace(/^\/solo-life\//, '') || 'index.html';
  if (!/^[\w.-]+$/.test(name) || !fs.existsSync(path.join(root, name))) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(path.join(root, name));
  if (v03Mode && v03Files[name]) data = v03Files[name];
  if (previousRelease?.files[name]) data = previousRelease.files[name];
  if (legacyMode && name === 'index.html') data = oldHtml;
  if (legacyMode && name === 'sw.js') data = oldWorker;
  if (!legacyMode && nextWorker && name === 'sw.js') data = Buffer.from(data.toString().replace(/^const CACHE = '[^']+';/m, "const CACHE = 'solo-life-test-update';"));
  res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
});
const saveOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('solo-life-v01')));
const dismiss = async page => { if (await page.locator('#awakening[open]').count()) await page.locator('#continueGrowth').click(); };
const tab = async (page, name) => { await dismiss(page); await page.locator(`[data-tab="${name}"]`).click(); };
async function completeRegistered(page, name) {
  const button = { name: name + 'を達成', exact: true };
  await page.locator('#quests').getByRole('button', button).click();
  await page.locator('#quests .completed').getByRole('button', button).waitFor({state:'attached'});
}
const setTime = async (page, time) => {
  await page.clock.setSystemTime(new Date(time));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
};
async function run(engine, url) {
  if (process.env.FLOW === 'journey') {
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome'}));
    try {
      const context = await browser.newContext({...devices['iPhone 13'], timezoneId:'Asia/Tokyo', locale:'ja-JP', acceptDownloads:true});
      await testJourney(await context.newPage(), url, path.join(output,engine+'-journey'));
      await context.close();
      console.log(engine + ': journey feature and mobile layout tests passed');
    } finally { await browser.close(); }
    return;
  }
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
    await Promise.all([page.waitForEvent('load'), page.locator('#applyUpdate').click()]);
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
    await completeRegistered(page, '筋力トレーニング');
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
    await page.screenshot({ path: path.join(output, engine + '-iphone-records.png'), fullPage: true, scale: 'css', animations: 'disabled' });
    await tab(page, 'home');
    assert.match(await page.locator('#boss').innerText(), /討伐成功/);
    await page.screenshot({ path: path.join(output, engine + '-iphone-home.png'), fullPage: true, scale: 'css', animations: 'disabled' });
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
    await Promise.all([page.waitForEvent('load'), page.locator('#applyUpdate').click()]);
    await page.waitForFunction(() => document.getElementById('updateNotice').hidden);
    assert.deepEqual(await saveOf(page), savedBeforeUpdate);
    const cachesAfter = await page.evaluate(() => caches.keys());
    assert.ok(cachesAfter.includes('unrelated-app'));
    assert.ok(cachesAfter.includes('solo-life-test-update'));
    assert.equal(cachesAfter.filter(k => k.startsWith('solo-life-')).length, 1);
    // WebKit's setOffline rejects SW navigations even for literal responses:
    // https://github.com/microsoft/playwright/issues/42775
    // Destroy actual server connections instead, so the worker handles network failure.
    if (engine === 'webkit') disconnect = true;
    else await context.setOffline(true);
    await page.goto(url + 'index.html?from=homescreen');
    await page.waitForFunction(() => !!window.SoloLife && document.getElementById('quests').children.length === 3);
    await completeRegistered(page, '読書を20分');
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 40);
    await page.reload();
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 40);
    await page.locator('#planName').fill('オフラインで買い物を記録');
    await page.locator('#planSubmit').click();
    await page.locator('#planList button').click();
    await page.locator('#planList .done-mark').waitFor();
    await page.reload();
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 60);
    await page.locator('#habitGoal').selectOption('walk');
    await page.locator('#dailyOffers .quest').nth(1).locator('button').click();
    await page.locator('#dailyOffers .completed').waitFor();
    await dismiss(page);
    await page.reload();
    assert.equal((await saveOf(page)).totalXp, savedBeforeUpdate.totalXp + 80);
    assert.equal(await page.locator('#habitGoal').inputValue(), 'walk');
    await tab(page, 'records');
    await page.locator('[data-period="90"]').click();
    assert.match(await page.locator('#growthActions').innerText(), /歩行 [1-9][0-9]*分/);
    disconnect = false;
    await context.setOffline(false);
    console.log(engine + ': PWA update, scoped cache cleanup, offline navigation and saves passed');
    assert.deepEqual(errors, []);
    await context.close();

    // Exercise the actual deployed v0.3 HTML, JS and worker before upgrading.
    nextWorker = false; v03Mode = true;
    const upgradeContext = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo' });
    const upgrade = await upgradeContext.newPage();
    upgrade.on('pageerror', error => errors.push(error.message));
    await upgrade.clock.install({ time: new Date('2026-11-05T12:00:00+09:00') });
    await upgrade.goto(url);
    // Finish installing the old worker before reloading its initial page.
    await upgrade.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await upgrade.waitForFunction(() => !!navigator.serviceWorker.controller);
    const fixture = C.fresh();
    for (const q of fixture.quests) C.completeQuest(fixture, q.id, new Date('2026-11-05T10:00:00+09:00'));
    fixture.quests.push({ id: 'personal', name: '朝のストレッチ', stat: 'health', xp: 20 });
    fixture.focusMinutes = 15;
    fixture.focusEnd = new Date('2026-11-05T12:15:00+09:00').getTime();
    await upgrade.evaluate(data => localStorage.setItem('solo-life-v01', JSON.stringify(data)), fixture);
    await upgrade.reload();
    await upgrade.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await upgrade.locator('#level').innerText(), '3');
    assert.deepEqual(await saveOf(upgrade), fixture);
    v03Mode = false;
    await upgrade.reload();
    await upgrade.locator('#rankNext').waitFor();
    assert.deepEqual(await saveOf(upgrade), fixture);
    assert.equal(await upgrade.locator('#totalXp').innerText(), '200 XP');
    assert.equal(await upgrade.locator('#level').innerText(), '3');
    assert.equal(await upgrade.locator('#awakening[open]').count(), 0);
    await upgrade.locator('#applyUpdate').waitFor({ state: 'visible' });
    await Promise.all([upgrade.waitForEvent('load'), upgrade.locator('#applyUpdate').click()]);
    await upgrade.waitForFunction(() => document.getElementById('updateNotice').hidden);
    assert.deepEqual(await saveOf(upgrade), fixture);
    await upgrade.screenshot({ path: path.join(output, engine + '-v04-status.png'), fullPage: true, scale: 'css', animations: 'disabled' });
    await tab(upgrade, 'focus');
    assert.equal(await upgrade.locator('#minutes').inputValue(), '15');
    assert.equal(await upgrade.locator('#start').isDisabled(), true);
    await upgrade.screenshot({ path: path.join(output, engine + '-v04-focus.png'), fullPage: true, scale: 'css', animations: 'disabled' });
    await upgrade.locator('#resetTimer').click();
    await tab(upgrade, 'home');
    await completeRegistered(upgrade, '朝のストレッチ');
    assert.equal((await saveOf(upgrade)).totalXp, 220);
    assert.match(await upgrade.locator('#toast').innerText(), /健康 \+1/);
    assert.equal(await upgrade.getByRole('button', { name: '朝のストレッチを達成', exact: true }).isDisabled(), true);
    await setTime(upgrade, '2026-11-06T12:00:00+09:00');
    await upgrade.getByRole('button', { name: '筋力トレーニングを達成', exact: true }).click();
    await upgrade.locator('#awakening[open]').waitFor();
    assert.equal(await upgrade.locator('#awakeningKind').innerText(), 'LEVEL UP');
    assert.equal(await upgrade.locator('#levelTransition').innerText(), 'LV.3 → LV.4');
    assert.equal((await saveOf(upgrade)).totalXp, 300);
    await upgrade.screenshot({ path: path.join(output, engine + '-v04-level-up.png'), scale: 'css', animations: 'disabled' });
    await upgrade.locator('#continueGrowth').click();
    await upgrade.reload();
    assert.equal(await upgrade.locator('#awakening[open]').count(), 0);
    await tab(upgrade, 'records');
    upgrade.on('dialog', dialog => dialog.accept());
    const nearRank = await saveOf(upgrade); nearRank.totalXp = 380;
    await upgrade.locator('#import').setInputFiles({ name: 'rank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nearRank)) });
    await upgrade.waitForFunction(() => document.getElementById('toast').textContent === '復元しました');
    await tab(upgrade, 'home');
    await upgrade.getByRole('button', { name: '読書を20分を達成', exact: true }).click();
    await upgrade.locator('#awakening[open]').waitFor();
    assert.equal(await upgrade.locator('#awakeningKind').innerText(), 'RANK UP');
    assert.match(await upgrade.locator('#awakeningTitle').innerText(), /脈動/);
    assert.equal((await saveOf(upgrade)).totalXp, 420);
    assert.equal(await upgrade.locator('#continueGrowth').evaluate(e => e === document.activeElement), true);
    await upgrade.screenshot({ path: path.join(output, engine + '-v04-rank-up.png'), scale: 'css', animations: 'disabled' });
    await upgrade.setViewportSize({ width: 320, height: 568 });
    const box = await upgrade.locator('#awakening').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height <= 568);
    await upgrade.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await upgrade.locator('#awakening').evaluate(e => getComputedStyle(e).animationName), 'none');
    assert.equal(await upgrade.locator('.award-scene .flame-art').evaluate(e => getComputedStyle(e).animationName), 'none');
    assert.equal(await upgrade.locator('.award-scene .flame-field').evaluate(e => getComputedStyle(e, '::after').animationName), 'none');
    await upgrade.keyboard.press('Escape');
    assert.equal(await upgrade.locator('#awakening[open]').count(), 0);
    await upgrade.locator('.rank-details summary').click();
    assert.equal(await upgrade.locator('#rankPath li').count(), 6);
    assert.match(await upgrade.locator('#rankPath [aria-current="step"]').innerText(), /脈動/);
    assert.equal(await upgrade.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await upgradeContext.close();
    assert.deepEqual(errors, []);
    console.log(engine + ': actual v0.3 worker upgrade preserves 200 XP, LV3, custom quests, full history, stats and active timer; level/rank dialogs, no replay and reduced motion passed');

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

    for (const release of upgradeReleases) {
      previousRelease = release;
      const returning = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Tokyo' });
      const player = await returning.newPage();
      player.on('pageerror', error => errors.push(error.message));
      await player.goto(url);
      await player.waitForFunction(() => !!navigator.serviceWorker.controller);
      assert.equal(await player.locator('.version').innerText(), release.version);
      await player.evaluate(data => localStorage.setItem('solo-life-v01', JSON.stringify(data)), fixture);
      await player.clock.install({ time: new Date('2026-11-05T12:00:00+09:00') });
      await player.reload();
      const previousSave = await saveOf(player);
      assert.deepEqual(previousSave, fixture);
      previousRelease = undefined;
      await tab(player, 'records');
      await player.locator('#checkUpdate').click();
      await Promise.all([player.waitForEvent('load'), player.locator('#applyUpdate').click()]);
      await player.waitForFunction(() => document.querySelector('.version').textContent === 'v0.14');
      assert.deepEqual(await saveOf(player), previousSave);
      assert.ok(await player.locator('#firstQuest').isHidden());
      if (engine === 'webkit') disconnect = true;
      else await returning.setOffline(true);
      await player.goto(url + 'index.html');
      assert.ok(await player.locator('.player-scene .flame-art').evaluate(async img => {
        await img.decode();
        return img.naturalWidth > 0;
      }), 'The illustrated player card must load offline after a PWA update');
      await tab(player, 'missions');
      await player.getByRole('button', { name: '美容', exact: true }).click();
      await player.locator('#goalPreset').selectOption('beauty-skin');
      await player.locator('#add').click();
      const withQuest = await saveOf(player);
      assert.deepEqual(withQuest.quests.slice(0, -1), previousSave.quests);
      assert.equal(withQuest.quests.at(-1).name, '夜のスキンケアをする');
      assert.deepEqual({ ...withQuest, quests: previousSave.quests }, previousSave);
      await player.reload();
      assert.deepEqual(await saveOf(player), withQuest);
      disconnect = false;
      await returning.close();
      console.log(engine + ': ' + release.version + ' worker update preserved the entire save, timer, offline artwork and custom quest');
    }

    const beginner = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const start = await beginner.newPage();
    start.on('pageerror', error => errors.push(error.message));
    await start.goto(url);
    const initial = await saveOf(start);
    await start.locator('#firstQuest').click();
    const goals = start.locator('#goalChoices');
    assert.equal(await goals.locator('button').count(), 10);
    const candidates = start.locator('#goalPreset');
    assert.equal(await candidates.locator('option[value]:not([value=""])').count(), 113);
    for (const [goal, stat] of [['筋トレ','strength'], ['勉強','intellect'], ['仕事','discipline'], ['美容','discipline'], ['健康','health']]) {
      await goals.getByRole('button', { name: goal, exact: true }).click();
      assert.deepEqual(await candidates.locator('optgroup').evaluateAll(groups => groups.map(g => g.label)), [goal]);
      await candidates.selectOption({ index: 1 });
      assert.equal(await start.locator('#qstat').inputValue(), stat);
      assert.equal(await start.locator('#qxp').inputValue(), '20');
    }
    await start.locator('#qname').fill('昼休みの散歩');
    await goals.getByRole('button', { name: 'すべて', exact: true }).click();
    assert.equal(await start.locator('#qname').inputValue(), '昼休みの散歩');
    assert.deepEqual(await saveOf(start), initial);
    await start.locator('#add').click();
    const created = await saveOf(start);
    assert.equal(created.quests.length, initial.quests.length + 1);
    assert.deepEqual({ ...created, quests: initial.quests }, initial);
    await start.locator('#qname').fill('昼休みの散歩');
    await start.locator('#add').click();
    assert.deepEqual(await saveOf(start), created);
    for (const width of [320, 375, 390, 430]) {
      await start.setViewportSize({ width, height: 844 });
      assert.ok(await start.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const bounds = await start.locator('.tabs').boundingBox();
      assert.ok(bounds.y >= 0 && Math.abs(bounds.y + bounds.height - 844) <= 1);
    }
    await tab(start, 'home');
    await completeRegistered(start, '昼休みの散歩');
    await start.reload();
    assert.ok(await start.getByRole('button', { name: '昼休みの散歩を達成', exact: true }).isDisabled());
    assert.equal((await saveOf(start)).totalXp, initial.totalXp + 20);
    await beginner.close();
    const boardContext = await browser.newContext({ ...devices['iPhone 13'], timezoneId:'Asia/Tokyo', serviceWorkers:'block' });
    const boardPage = await boardContext.newPage();
    await boardPage.clock.install({time:new Date('2026-11-06T17:59:00+09:00')});
    await boardPage.goto(url);
    assert.equal(await boardPage.locator('#dailyOffers button').count(),5);
    assert.ok(await boardPage.locator('#urgentOffer').isHidden());
    await setTime(boardPage, '2026-11-06T18:00:00+09:00');
    await boardPage.locator('#urgentRow button').click();
    await boardPage.locator('#urgentRow .completed').waitFor();
    await boardPage.reload();
    assert.equal((await saveOf(boardPage)).totalXp,20);
    assert.ok(await boardPage.locator('#urgentRow button').isDisabled());
    await setTime(boardPage, '2026-11-07T20:00:00+09:00');
    assert.match(await boardPage.locator('#toast').innerText(),/今日の達成はまだ/);
    await boardPage.locator('#dailyOffers button').first().click();
    await boardPage.waitForFunction(() => document.getElementById('urgentOffer').hidden);
    assert.equal((await saveOf(boardPage)).totalXp,40);
    assert.equal((await saveOf(boardPage)).history.length,2);
    assert.equal((await saveOf(boardPage)).quests.length,C.fresh().quests.length);
    assert.equal(await boardPage.locator('#trainingCount').innerText(),'1 / 3 日');
    const train = boardPage.locator('#dailyOffers [data-stat="strength"] button');
    for (const date of ['2026-11-09','2026-11-11','2026-11-13']) {
      await setTime(boardPage,date + 'T12:00:00+09:00');
      await train.click();
      await boardPage.locator('#dailyOffers .completed[data-stat="strength"]').waitFor();
      await dismiss(boardPage);
    }
    await boardPage.locator('#claimTraining').click();
    await boardPage.waitForFunction(() => document.getElementById('trainingPrize').textContent.includes('受取済み'));
    await boardPage.reload();
    assert.equal(await boardPage.locator('#trainingDays .trained').count(),3);
    assert.ok(await boardPage.locator('#claimTraining').isHidden());
    assert.equal((await saveOf(boardPage)).totalXp,140);
    assert.equal((await saveOf(boardPage)).history.filter(h => h.type === 'weekly').length,1);
    await boardContext.close();
    const plannerContext = await browser.newContext({ ...devices['iPhone 13'], timezoneId:'Asia/Tokyo', locale:'ja-JP' });
    const plannerPage = await plannerContext.newPage();
    await testPlanner(plannerPage, url, path.join(output, engine + '-planner.png'));
    await plannerContext.close();
    console.log(engine + ': planner scheduling, carryover, editing, deleting and persisted rewards passed');
    console.log(engine + ': daily board, 18:00 urgent offer, 20:00 reminder, overnight rotation and persisted rewards passed');
    assert.deepEqual(errors, []);
    console.log(engine + ': first visit, category filters, draft preservation, opt-in creation, duplicate protection, mobile navigation and a single reward passed');
    const habitContext = await browser.newContext({...devices['iPhone 13'], timezoneId:'Asia/Tokyo', locale:'ja-JP', acceptDownloads:true});
    const habitPage = await habitContext.newPage();
    await testHabits(habitPage, url, path.join(output, engine + '-habits'));
    await habitContext.close();
    console.log(engine + ': personalized goals, 3 difficulty stages, 7/30/90-day records, concurrent claims, backups and failed-save rollback passed');
    const journeyContext = await browser.newContext({...devices['iPhone 13'], timezoneId:'Asia/Tokyo', locale:'ja-JP', acceptDownloads:true});
    await testJourney(await journeyContext.newPage(), url, path.join(output, engine + '-journey'));
    await journeyContext.close();
    console.log(engine + ': guild, measurements, goal bosses, evolution, skills, full backup, failed saves and mobile/desktop layouts passed');
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/solo-life/`;
  try { for (const engine of (process.env.BROWSER ? [process.env.BROWSER] : ['chromium', 'webkit'])) await run(engine, url); }
  finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
