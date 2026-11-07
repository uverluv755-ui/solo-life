const assert = require('node:assert/strict');
const C = require('../progress.js');

module.exports = async function testHabits(page, url, screenshotPrefix) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('solo-life-v01')));
  const dismiss = async () => {
    if (await page.locator('#awakening[open]').count()) await page.locator('#continueGrowth').click();
  };
  const tab = async id => { await dismiss(); await page.locator('[data-tab="' + id + '"]').click(); };
  await page.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});
  await page.goto(url);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.locator('#habitGoal').selectOption('walk');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('solo-life-v01')).habitGoal === 'walk');
  assert.equal(await page.locator('#dailyOffers .quest').count(), 5);
  assert.equal(await page.locator('#dailyOffers small').filter({hasText:'歩行'}).count(), 2);
  await page.reload();
  assert.equal(await page.locator('#habitGoal').inputValue(), 'walk');
  const offerNames = await page.locator('#dailyOffers button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label')));
  const before = await saved();
  const other = await page.context().newPage();
  await other.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});
  await other.goto(url);
  // Two tabs attempt the same claim against the same persistent save.
  await Promise.all([
    page.locator('#dailyOffers .quest').nth(1).locator('button').evaluate(b => b.click()),
    other.locator('#dailyOffers .quest').nth(1).locator('button').evaluate(b => b.click())
  ]);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('solo-life-v01')).totalXp === 20);
  await page.reload();
  assert.equal((await saved()).totalXp, before.totalXp + 20);
  assert.equal((await saved()).history.length, 1);
  await other.close();
  await page.locator('#habitGoal').selectOption('study');
  await page.waitForFunction(() => document.getElementById('boardLevel').textContent.includes('明日'));
  assert.deepEqual(await page.locator('#dailyOffers button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label'))), offerNames);
  await tab('records');
  for (const period of [7,30,90]) {
    await page.locator('[data-period="' + period + '"]').click();
    assert.match(await page.locator('#growthNumbers').innerText(), /20/);
    assert.match(await page.locator('#growthActions').innerText(), /歩行 [1-3]分/);
  }
  const backupEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await backupEvent;
  const fs = require('node:fs');
  const backup = fs.readFileSync(await download.path());
  assert.deepEqual(JSON.parse(backup), await saved());
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#import').setInputFiles({name:'habits.json',mimeType:'application/json',buffer:backup});
  await page.waitForFunction(() => document.getElementById('toast').textContent === '復元しました');
  assert.deepEqual(await saved(), JSON.parse(backup));
  const advanced = await saved();
  for (let i = 1; i <= 30; i++) C.completeQuest(advanced, 'reading', new Date(C.shiftDay('2026-11-07', -i) + 'T12:00:00+09:00'));
  await page.locator('#import').setInputFiles({name:'advanced.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(advanced))});
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('solo-life-v01')).totalXp === 1220);
  await page.clock.setSystemTime(new Date('2026-11-08T12:00:00+09:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await tab('home');
  assert.equal(await page.locator('#dailyOffers .quest').count(), 6);
  assert.match(await page.locator('#boardLevel').innerText(), /挑戦/);
  assert.equal(await page.locator('#dailyOffers small').filter({hasText:'勉強'}).count(), 2);
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({width,height:844});
    for (const id of ['home','missions','records']) {
      await tab(id);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id + ' overflow at ' + width);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.clock.fastForward(4500);
  await page.locator('[data-period="30"]').click();
  await page.screenshot({path:screenshotPrefix + '-growth.png',fullPage:true,scale:'css',animations:'disabled'});
  await tab('home');
  await page.locator('#todayBoard').scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshotPrefix + '-quests.png',scale:'css',animations:'disabled'});
  // A failed save must leave the original XP and all goal settings intact.
  const beforeFull = await saved();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.locator('#dailyOffers button').first().click();
  await page.locator('#storageWarning').waitFor({state:'visible'});
  assert.deepEqual(await saved(), beforeFull);
  assert.ok(await page.locator('#storageWarning').isVisible());
  assert.deepEqual(errors, []);
};
