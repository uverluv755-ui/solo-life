const test = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
const C = require('../progress.js');
const H = C.habits;
const at = date => new Date(date + 'T12:00:00');
const stamp = '2026-11-07';
function experienced(days) {
  const s = C.fresh();
  for (let i = 1; i <= days; i++) C.completeQuest(s, 'reading', at(C.shiftDay(stamp, -i)));
  return s;
}

test('100 distinct activities cover all eight categories and three stages', () => {
  assert.equal(H.catalog.length, 100);
  assert.equal(new Set(H.catalog.map(q => q.name)).size, 100);
  assert.equal(H.byKey.size, 100);
  for (const id of Object.keys(H.categories)) for (const tier of [1,2,3]) {
    const items = H.catalog.filter(q => q.category === id && q.tier === tier);
    assert.ok(items.length >= 4);
    for (const q of items) {
      assert.ok(q.name.length <= 40);
      assert.ok(q.minutes > 0);
      assert.ok(Object.hasOwn(C.names, q.stat));
    }
  }
});

test('recommendations use 5–6 unique activities, prioritize the goal and unlock by completed days', () => {
  for (const [days, tier, size] of [[0,1,5],[6,1,5],[7,2,6],[29,2,6],[30,3,6]]) {
    const s = experienced(days);
    for (const goal of ['balance', ...Object.keys(H.categories)]) {
      s.habitGoal = goal;
      const before = JSON.stringify(s);
      const offered = C.boardQuests(s, at(stamp));
      assert.equal(offered.length, size);
      assert.equal(new Set(offered.map(q => q.key)).size, size);
      assert.equal(C.boardSetup(s, stamp).tier, tier);
      assert.ok(offered.every(q => q.tier <= tier));
      assert.ok(new Set(offered.map(q => q.category)).size >= 4);
      if (goal !== 'balance') assert.equal(offered.filter(q => q.category === goal).length, 2);
      assert.deepEqual(C.boardQuests(s, at(stamp)), offered);
      assert.equal(JSON.stringify(s), before);
    }
  }
});

test('goal edits freeze today after a claim, stale offers and repeat claims cannot grant XP', () => {
  const s = C.fresh();
  s.habitGoal = 'walk';
  const before = C.boardQuests(s, at(stamp));
  assert.equal(C.completeBoardQuest(s, 'a', stamp, at(stamp), 'outdated-key'), null);
  const q = before[1];
  assert.equal(C.completeBoardQuest(s, q.id, stamp, at(stamp), q.key).xp, 20);
  s.habitGoal = 'study';
  assert.deepEqual(C.boardQuests(s, at(stamp)), before);
  assert.equal(C.completeBoardQuest(s, q.id, stamp, at(stamp), q.key), null);
  assert.equal(C.completeBoardQuest(s, 'b', stamp, at(C.shiftDay(stamp, 1))), null);
  assert.equal(C.boardSetup(s, C.shiftDay(stamp, 1)).goal, 'study');
  assert.deepEqual(C.migrate(s, at(stamp)), s);
  assert.equal(C.periodGrowth(s, 7, stamp).walk, q.minutes);
});

test('90-day records survive the 100-history limit and exclude old/future dates', () => {
  const s = C.fresh();
  s.habitGoal = 'walk';
  for (let i = 0; i < 220; i++) {
    const date = C.shiftDay(stamp, i - 219);
    const now = at(date);
    for (const q of C.boardQuests(s, now)) C.completeBoardQuest(s, q.id, date, now, q.key);
  }
  assert.equal(s.history.length, 100);
  assert.ok(C.valid(s));
  for (const days of [7,30,90]) {
    const report = C.periodGrowth(s, days, stamp);
    assert.equal(report.active, days);
    assert.equal(report.quests, days * 6);
    assert.equal(report.xp, days * 120);
    assert.equal(report.change, 0);
    assert.ok(report.walk > 0 && report.reps > 0);
  }
  const baseline = C.periodGrowth(s, 90, stamp);
  C.completeQuest(s, 'reading', at(C.shiftDay(stamp, 1)));
  assert.deepEqual(C.periodGrowth(s, 90, stamp), baseline);
});

test('v0.12 claimed titles, planner and full save survive upgrade on the same day', () => {
  const oldSource = execFileSync('git', ['show', 'c109536:progress.js'], {encoding:'utf8'});
  const scope = {module:{exports:{}}};
  vm.runInNewContext(oldSource, scope);
  const old = scope.module.exports;
  const s = JSON.parse(JSON.stringify(old.fresh()));
  const now = at(stamp), original = old.boardQuests(s, now);
  for (const q of original) old.completeBoardQuest(s, q.id, stamp, now);
  old.putPlan(s, {id:'later',name:'図書館',start:stamp,weekdays:[1,3],stat:'intellect'});
  const before = JSON.stringify(s);
  const migrated = C.migrate(s, now);
  assert.equal(JSON.stringify(migrated), before);
  const offers = C.boardQuests(migrated, now);
  for (const q of original) {
    assert.equal(offers.find(item => item.id === q.id).name, q.name);
    assert.ok(C.boardDone(migrated, q.id, stamp));
    assert.equal(C.completeBoardQuest(migrated, q.id, stamp, now), null);
  }
  const remaining = offers.find(q => !C.boardDone(migrated, q.id, stamp));
  C.completeBoardQuest(migrated, remaining.id, stamp, now, remaining.key);
  assert.equal(migrated.totalXp, s.totalXp + 20);
  assert.ok(C.valid(migrated));
  assert.equal(JSON.stringify(migrated.plans), JSON.stringify(s.plans));
  assert.ok(old.valid(migrated), 'additive fields retain v0.12 schema compatibility');
});

test('recommendation claims stay stable in every completion order and reject malformed backups', () => {
  for (const goal of Object.keys(H.categories)) for (const days of [0,7,30]) {
    const s = experienced(days);
    s.habitGoal = goal;
    const initial = C.boardQuests(s, at(stamp));
    for (const q of [...initial].reverse()) {
      assert.ok(C.completeBoardQuest(s, q.id, stamp, at(stamp), q.key));
      assert.deepEqual(C.boardQuests(s, at(stamp)), initial);
      assert.ok(C.valid(s));
    }
    assert.deepEqual(C.migrate(s, at(stamp)), s);
  }
  const s = C.fresh();
  C.completeBoardQuest(s, 'workout', stamp, at(stamp));
  for (const mutate of [
    data => { data.habitGoal = 'unknown'; },
    data => { data.daily[stamp].boardSetup.tier = 9; },
    data => { data.daily[stamp].habitLog[0].slot = '__proto__'; },
    data => { data.daily[stamp].habitLog[0].key = 'missing'; },
    data => { data.daily[stamp].habitLog.push({...data.daily[stamp].habitLog[0]}); }
  ]) {
    const copy = structuredClone(s);
    mutate(copy);
    assert.equal(C.valid(copy), false);
  }
});
