const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../progress.js');
const at = key => new Date(key + 'T12:00:00');

test('daily board rotates, urgent starts at 18:00, and claims survive migration without duplicates', () => {
  const s = C.fresh(), early = new Date('2026-11-06T17:59:00'), late = new Date('2026-11-06T18:00:00');
  const tomorrow = new Date('2026-11-07T18:00:00'), today = C.day(late);
  assert.equal(C.boardQuests(s, early).length,2);
  assert.equal(C.completeBoardQuest(s,'urgent',today,early), null);
  assert.equal(C.boardQuests(s, late).length,3);
  assert.notEqual(C.boardQuests(s,late)[0].name, C.boardQuests(s,tomorrow)[0].name);
  assert.equal(C.completeBoardQuest(s,'urgent',today,late).xp,20);
  assert.equal(C.completeBoardQuest(s,'urgent',today,late),null);
  const restored = C.migrate(s,late);
  assert.deepEqual(restored,s);
  assert.equal(restored.daily[today].quests,1);
  assert.equal(restored.history.length,1);
  assert.equal(C.boardDone(restored,'urgent',today),true);
  assert.equal(C.completeBoardQuest(s,'a',today,tomorrow),null);
  assert.equal(C.boardDone(s,'urgent',C.day(tomorrow)),false);
});
test('existing quests, daily board, completed focus and running timer suppress an unclaimed urgent quest', () => {
  const now = new Date('2026-11-06T19:00:00');
  for (const action of [s => C.completeQuest(s,s.quests[0].id,now),s => C.completeBoardQuest(s,'a',C.day(now),now),
    s => { s.focusEnd = now.getTime(); C.completeFocus(s,now); },s => { s.focusEnd = now.getTime()+60000; }]) {
    const s = C.fresh(); action(s);
    assert.equal(C.boardQuests(s,now).some(q => q.urgent),false);
  }
});

test('v0.4 preserves the level-3 / 200 XP v0.3 save and every stored field', () => {
  const s = C.fresh(), now = at('2026-11-05');
  for (const q of s.quests) C.completeQuest(s, q.id, now);
  s.focusMinutes = 15;
  s.focusEnd = now.getTime() + 900000;
  s.quests.push({ id: 'personal', name: '自分のクエスト', stat: 'health', xp: 20 });
  const before = JSON.stringify(s), migrated = C.migrate(s, now);
  assert.equal(C.KEY, 'solo-life-v01');
  assert.equal(C.SCHEMA, 3);
  assert.equal(migrated.totalXp, 200);
  assert.equal(C.growth(migrated.totalXp).level, 3);
  assert.deepEqual(migrated, s);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(C.migrate(migrated, now), migrated);
});

test('six original ranks have exact boundaries and retain the original level curve', () => {
  assert.deepEqual(C.ranks.map(r => r.name), ['灯火', '脈動', '共鳴', '飛躍', '極光', '星冠']);
  for (let i = 1; i < C.ranks.length; i++) {
    const r = C.ranks[i], threshold = (r.level - 1) * 100;
    assert.equal(C.growth(threshold - 1).rank.name, C.ranks[i - 1].name);
    assert.equal(C.growth(threshold - 1).rankRemaining, 1);
    assert.equal(C.growth(threshold).rank.name, r.name);
    assert.equal(C.growth(threshold).level, r.level);
    assert.equal(C.growth(threshold).xp, 0);
  }
  assert.equal(C.growth(0).remaining, 100);
  assert.equal(C.growth(99).remaining, 1);
  assert.equal(C.growth(10000).level, 101);
  assert.equal(C.growth(10000).next, null);
});

test('reward feedback reports level and rank transitions without extra rewards', () => {
  const s = C.fresh(); s.totalXp = 360;
  const r = C.completeQuest(s, 'reading', at('2026-11-05'));
  assert.equal(r.levelUp, true); assert.equal(r.rankUp, true);
  assert.equal(r.before.level, 4); assert.equal(r.after.level, 5);
  assert.equal(r.after.rank.name, '脈動');
  assert.equal(r.gain, 2); assert.equal(r.stat, 'intellect');
  assert.equal(s.totalXp, 400); assert.equal(s.stats.intellect, 12);
  assert.equal(C.completeQuest(s, 'reading', at('2026-11-05')), null);
  const again = C.migrate(s, at('2026-11-05'));
  assert.equal(again.totalXp, 400);
  s.focusEnd = at('2026-11-05').getTime(); s.totalXp = 480;
  const f = C.completeFocus(s, at('2026-11-05'));
  assert.equal(f.levelUp, true); assert.equal(f.rankUp, false);
  assert.equal(f.after.level, 6); assert.equal(s.totalXp, 520);
  assert.equal(C.completeFocus(s, at('2026-11-05')), null);
});
function legacy() {
  const s = C.fresh();
  for (const key of ['schemaVersion', 'daily', 'achievements', 'defeatedBosses']) delete s[key];
  return s;
}

test('v0.2/early v0.3 migration preserves existing fields and deduplicates overlapping evidence', () => {
  const old = legacy();
  old.totalXp = 740;
  old.stats.strength = 31;
  old.completed = { training: '2026-11-03', work: '2026-11-03', deleted: '2026-11-02' };
  old.focusEnd = at('2026-11-05').getTime();
  old.history = [
    { label: '筋力トレーニング', xp: 80, at: at('2026-11-03').toISOString() },
    { label: '集中して仕事を45分', xp: 80, at: at('2026-11-03').toISOString() },
    { label: '集中ダンジョン', xp: 40, at: at('2026-11-03').toISOString() }
  ];
  const original = JSON.stringify(old), s = C.migrate(old, at('2026-11-04'));
  for (const key of Object.keys(old)) assert.deepEqual(s[key], old[key]);
  assert.equal(JSON.stringify(old), original);
  assert.equal(s.daily['2026-11-03'].quests, 2);
  assert.equal(s.daily['2026-11-03'].focus, 1);
  assert.equal(C.progress(s, '2026-11-04').weekly, 3);
  assert.equal(C.progress(s, '2026-11-04').streak, 2);
  assert.deepEqual(C.migrate(s, at('2026-11-04')), s);
});

test('same quest on consecutive days retains the full streak, and repeated taps give no reward', () => {
  const s = C.fresh();
  for (let i = 0; i < 8; i++) {
    const now = at(C.shiftDay('2026-10-29', i));
    assert.equal(C.completeQuest(s, 'training', now).xp, 80);
    assert.equal(C.completeQuest(s, 'training', now), null);
  }
  assert.equal(s.totalXp, 640);
  assert.equal(C.progress(s, '2026-11-05').streak, 8);
  assert.equal(Object.keys(s.daily).length, 8);
  assert.ok(s.achievements['seven-days']);
  assert.equal(C.completeQuest(s, 'training', at('2026-10-29')), null);
});

test('yesterday streak stays visible before first completion today, then expires after a missed day', () => {
  const s = C.fresh();
  C.completeQuest(s, 'reading', at('2026-11-03'));
  assert.equal(C.progress(s, '2026-11-04').streak, 1);
  assert.equal(C.progress(s, '2026-11-05').streak, 0);
  C.completeQuest(s, 'reading', at('2026-11-05'));
  assert.equal(C.progress(s, '2026-11-05').streak, 1);
});

test('all five achievements unlock and stay unlocked after weekly reset and quest deletion', () => {
  const s = C.fresh();
  for (let i = 0; i < 7; i++) for (const q of s.quests) C.completeQuest(s, q.id, at(C.shiftDay('2026-11-02', i)));
  assert.equal(Object.keys(s.achievements).length, 5);
  assert.equal(C.progress(s, '2026-11-08').weekly, 21);
  assert.equal(Object.keys(s.defeatedBosses).length, 1);
  const unlocked = JSON.stringify(s.achievements);
  s.quests = [];
  C.unlock(s, at('2026-11-16'));
  assert.equal(C.progress(s, '2026-11-16').weekly, 0);
  assert.equal(C.progress(s, '2026-11-16').longest, 7);
  assert.equal(JSON.stringify(s.achievements), unlocked);
  assert.equal(Object.keys(s.defeatedBosses).length, 1);
  assert.ok(C.valid(s));
});

test('boss defeat occurs at exactly ten quests and awards no duplicate XP on render/reload', () => {
  const s = C.fresh();
  for (let i = 0; i < 3; i++) for (const q of s.quests) C.completeQuest(s, q.id, at(C.shiftDay('2026-11-02', i)));
  assert.equal(Object.keys(s.defeatedBosses).length, 0);
  C.completeQuest(s, 'training', at('2026-11-05'));
  const xp = s.totalXp, saved = JSON.stringify(s.defeatedBosses);
  C.unlock(s, at('2026-11-05'));
  assert.equal(C.migrate(s, at('2026-11-05')).totalXp, xp);
  assert.equal(JSON.stringify(s.defeatedBosses), saved);
  assert.equal(C.progress(s, '2026-11-05').weekly, 10);
});

test('daily records outlive the capped 100-item recent history', () => {
  const s = C.fresh();
  for (let i = 0; i < 120; i++) C.completeQuest(s, 'reading', at(C.shiftDay('2026-01-01', i)));
  assert.equal(s.history.length, 100);
  assert.equal(C.progress(s, C.shiftDay('2026-01-01', 119)).streak, 120);
  assert.equal(C.progress(C.migrate(s), C.shiftDay('2026-01-01', 119)).longest, 120);
});

test('calendar arithmetic handles Monday, year boundaries, leap years and DST', () => {
  assert.equal(C.weekStart('2027-01-01'), '2026-12-28');
  assert.equal(C.weekStart('2026-11-08'), '2026-11-02');
  assert.equal(C.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(C.shiftDay('2024-02-28', 1), '2024-02-29');
  assert.equal(C.shiftDay('2026-03-08', 1), '2026-03-09');
  assert.equal(C.shiftDay('2026-11-01', -1), '2026-10-31');
});

test('focus resumes from deadline and rewards exactly once without inflating quest counts', () => {
  const s = C.fresh(), now = at('2026-11-05');
  s.focusEnd = now.getTime();
  assert.equal(C.completeFocus(s, new Date(now.getTime() - 1)), null);
  assert.equal(C.completeFocus(s, now).xp, 40);
  assert.equal(C.completeFocus(C.migrate(s, now), now), null);
  assert.equal(s.stats.intellect, 12);
  assert.equal(C.progress(s, '2026-11-05').weekly, 0);
  assert.equal(C.progress(s, '2026-11-05').weeklyXp, 40);
  assert.equal(C.progress(s, '2026-11-05').streak, 0);
});

test('legacy history can recover past streak and boss achievements even after their week ends', () => {
  const old = legacy();
  for (let i = 0; i < 7; i++) for (const q of old.quests) old.history.push({ label: q.name, xp: q.xp, at: at(C.shiftDay('2026-10-26', i)).toISOString() });
  old.totalXp = 1400;
  const s = C.migrate(old, at('2026-11-05'));
  assert.equal(Object.keys(s.achievements).length, 5);
  assert.equal(C.progress(s, '2026-11-05').streak, 0);
  assert.equal(C.progress(s, '2026-11-05').weekly, 0);
});

test('malformed backups and future schema versions are rejected without mutating the input', () => {
  for (const mutate of [
    s => { s.quests[0].stat = 'unknown'; },
    s => { s.quests.push({ ...s.quests[0] }); },
    s => { s.completed.training = '2026-02-30'; },
    s => { s.completed = []; },
    s => { s.history = [null]; },
    s => { s.schemaVersion = 99; },
    s => { s.daily['2026-11-05'] = { quests: -1, focus: 0, xp: 0, questIds: [] }; },
    s => { s.quests[0].id = '__proto__'; }
  ]) {
    const s = C.fresh(); mutate(s);
    const before = JSON.stringify(s);
    assert.equal(C.valid(s), false);
    assert.throws(() => C.migrate(s));
    assert.equal(JSON.stringify(s), before);
  }
});
