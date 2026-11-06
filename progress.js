(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoloLife = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'solo-life-v01';
  const SCHEMA = 3;
  // v0.4 changes presentation, not the save schema or the 100 XP level curve.
  const ranks = [
    { level: 1, name: '灯火', mark: 'I', description: '小さな一歩が、光になる。' },
    { level: 5, name: '脈動', mark: 'II', description: '積み重ねた行動が、力を帯びる。' },
    { level: 15, name: '共鳴', mark: 'III', description: '日々の挑戦が、ひとつにつながる。' },
    { level: 25, name: '飛躍', mark: 'IV', description: '昨日の限界を、新しい出発点へ。' },
    { level: 35, name: '極光', mark: 'V', description: '続けてきた軌跡が、道を照らす。' },
    { level: 50, name: '星冠', mark: 'VI', description: 'ここからも、成長は続いていく。' }
  ];
  function growth(totalXp) {
    const level = Math.floor(totalXp / 100) + 1;
    const index = ranks.reduce((found, r, i) => level >= r.level ? i : found, 0);
    const rank = ranks[index], next = ranks[index + 1] || null;
    return { level, xp: totalXp % 100, remaining: 100 - totalXp % 100, rank, next,
      rankRemaining: next ? (next.level - 1) * 100 - totalXp : 0 };
  }
  const names = { strength: '筋力', intellect: '知力', mind: '精神力', wealth: '財力', health: '健康', discipline: '継続力' };
  const defaults = [
    { id: 'training', name: '筋力トレーニング', stat: 'strength', xp: 80 },
    { id: 'work', name: '集中して仕事を45分', stat: 'discipline', xp: 80 },
    { id: 'reading', name: '読書を20分', stat: 'intellect', xp: 40 }
  ];
  const badges = [
    { id: 'first-step', name: '初めての一歩', description: '初めて経験値を獲得' },
    { id: 'adventurer', name: '冒険者', description: '累計500 XPを獲得' },
    { id: 'three-days', name: '継続の芽', description: '3日連続でクエストを達成' },
    { id: 'seven-days', name: '七日の覚醒者', description: '7日連続でクエストを達成' },
    { id: 'boss-slayer', name: 'ボス討伐者', description: '週間ボスを1回討伐' }
  ];
  const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const nonnegative = x => Number.isFinite(x) && x >= 0;
  const count = x => Number.isSafeInteger(x) && x >= 0;
  const safeId = x => typeof x === 'string' && x.length > 0 && x.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(x);

  function day(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  const dateAt = key => new Date(key + 'T12:00:00');
  const validDay = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && day(dateAt(key)) === key;
  function shiftDay(key, amount) {
    const date = dateAt(key);
    date.setDate(date.getDate() + amount);
    return day(date);
  }
  const weekStart = key => shiftDay(key, -((dateAt(key).getDay() + 6) % 7));
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const planEntry = p => record(p) && safeId(p.id) && typeof p.name === 'string' &&
    p.name.trim().length > 0 && p.name.length <= 60 && Object.hasOwn(names, p.stat);
  const validPlan = p => planEntry(p) && validDay(p.start) && Array.isArray(p.weekdays) &&
    p.weekdays.every(n => Number.isInteger(n) && n >= 0 && n <= 6) && new Set(p.weekdays).size === p.weekdays.length;
  const validPlanList = (items, check) => Array.isArray(items) && items.every(check) &&
    new Set(items.map(p => p.id)).size === items.length;

  function fresh() {
    return {
      totalXp: 0, stats: Object.fromEntries(Object.keys(names).map(k => [k, 10])),
      quests: defaults.map(q => ({ ...q })), completed: {}, history: [],
      focusEnd: null, focusMinutes: 25, schemaVersion: SCHEMA,
      daily: {}, achievements: {}, defeatedBosses: {}
    };
  }

  function valid(x) {
    if (!record(x) || !nonnegative(x.totalXp) || !record(x.stats) ||
        !Object.keys(names).every(k => nonnegative(x.stats[k])) ||
        !Array.isArray(x.quests) || !x.quests.every(q => record(q) && safeId(q.id) &&
          typeof q.name === 'string' && q.name.trim().length > 0 && Object.hasOwn(names, q.stat) && [20, 40, 80].includes(q.xp)) ||
        new Set(x.quests.map(q => q.id)).size !== x.quests.length ||
        !record(x.completed) || !Object.entries(x.completed).every(([id, d]) => safeId(id) && validDay(d)) ||
        !Array.isArray(x.history) || !x.history.every(h => record(h) && typeof h.label === 'string' && nonnegative(h.xp) && timestamp(h.at)) ||
        !(x.focusEnd == null || nonnegative(x.focusEnd)) ||
        !(x.focusMinutes === undefined || [1, 15, 25, 45].includes(x.focusMinutes))) return false;
    if (x.plans !== undefined && !validPlanList(x.plans, validPlan)) return false;
    if (x.schemaVersion !== undefined && ![1, 2, SCHEMA].includes(x.schemaVersion)) return false;
    if (x.schemaVersion !== SCHEMA) return true;
    return record(x.daily) && Object.entries(x.daily).every(([d, v]) => validDay(d) && record(v) &&
      count(v.quests) && count(v.focus) && nonnegative(v.xp) && Array.isArray(v.questIds) &&
      [v.trainingOfferDone, v.trained, v.trainingRewardClaimed].every(flag => flag === undefined || typeof flag === 'boolean') &&
      (v.planLog === undefined || (validPlanList(v.planLog, planEntry) && v.planLog.length <= v.quests)) &&
      v.questIds.every(safeId) && new Set(v.questIds).size === v.questIds.length && v.quests >= v.questIds.length &&
      (v.boardClaims === undefined || (Array.isArray(v.boardClaims) && v.boardClaims.every(id => ['a','b','urgent'].includes(id)) &&
        new Set(v.boardClaims).size === v.boardClaims.length && v.quests >= v.questIds.length + v.boardClaims.length))) &&
      record(x.achievements) && Object.entries(x.achievements).every(([id, at]) => badges.some(b => b.id === id) && timestamp(at)) &&
      record(x.defeatedBosses) && Object.entries(x.defeatedBosses).every(([d, at]) => validDay(d) && weekStart(d) === d && timestamp(at));
  }

  function dailyRecord(s, key) {
    return s.daily[key] ||= { quests: 0, focus: 0, xp: 0, questIds: [] };
  }

  function migrate(input, now = new Date()) {
    if (!valid(input)) throw new Error('Invalid save data');
    const s = JSON.parse(JSON.stringify(input));
    s.focusEnd ??= null;
    s.focusMinutes ??= 25;
    if (s.schemaVersion !== SCHEMA) {
      s.daily = {};
      s.achievements = {};
      s.defeatedBosses = {};
      // Old saves retain only 100 history rows and the last completion per quest.
      // Use the larger count per date instead of adding overlapping evidence.
      for (const h of s.history) {
        const d = dailyRecord(s, day(new Date(h.at)));
        if (h.type === 'focus' || (!h.type && h.label === '集中ダンジョン')) d.focus++;
        else d.quests++;
        d.xp += h.xp;
      }
      for (const [id, key] of Object.entries(s.completed)) {
        const d = dailyRecord(s, key);
        d.questIds.push(id);
        d.quests = Math.max(d.quests, d.questIds.length);
      }
      s.schemaVersion = SCHEMA;
    }
    unlock(s, now);
    return s;
  }

  function progress(s, today = day()) {
    const activeDays = Object.keys(s.daily).filter(d => d <= today && s.daily[d].quests > 0).sort();
    let longest = 0, run = 0, previous;
    for (const key of activeDays) {
      run = previous && shiftDay(previous, 1) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = key;
    }
    let cursor = s.daily[today]?.quests ? today : shiftDay(today, -1), streak = 0;
    while (s.daily[cursor]?.quests > 0) { streak++; cursor = shiftDay(cursor, -1); }
    const start = weekStart(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const key = shiftDay(start, i), d = key <= today ? s.daily[key] : null;
      return { day: key, quests: d?.quests || 0, xp: d?.xp || 0, focus: d?.focus || 0 };
    });
    return {
      streak, longest, start, end: shiftDay(start, 6), days,
      weekly: days.reduce((n, d) => n + d.quests, 0),
      weeklyXp: days.reduce((n, d) => n + d.xp, 0),
      activeDays: days.filter(d => d.quests > 0).length
    };
  }

  function unlock(s, now = new Date()) {
    const today = day(now), at = now.toISOString(), weeks = {};
    for (const [d, value] of Object.entries(s.daily)) {
      if (d <= today) { const start = weekStart(d); weeks[start] = (weeks[start] || 0) + value.quests; }
    }
    for (const [start, quests] of Object.entries(weeks)) {
      if (quests >= 10 && !s.defeatedBosses[start]) s.defeatedBosses[start] = at;
    }
    const p = progress(s, today);
    const reached = [s.totalXp > 0 || s.history.length > 0, s.totalXp >= 500, p.longest >= 3, p.longest >= 7, Object.keys(s.defeatedBosses).length > 0];
    const added = [];
    badges.forEach((b, i) => {
      if (reached[i] && !s.achievements[b.id]) { s.achievements[b.id] = at; added.push(b.name); }
    });
    return added;
  }

  const isDone = (s, id, today = day()) => s.completed[id] === today || !!s.daily[today]?.questIds.includes(id);
  const boardDone = (s, id, today = day()) => id === 'workout'
    ? s.daily[today]?.trainingOfferDone === true : !!s.daily[today]?.boardClaims?.includes(id);
  const workouts = [
    ['スクワットを5回', 'strength', 1],
    ['壁に手をついて腕立てを5回', 'strength', 1],
    ['立ったままかかとを10回上げる', 'strength', 1],
    ['椅子からゆっくり5回立ち上がる', 'strength', 1]
  ];
  const dailyChoices = [
    ['机の上を2分だけ片づける', 'discipline', 2],
    ['本を3ページ読む', 'intellect', 5],
    ['窓の外を見ながら肩をゆっくり回す', 'health', 1],
    ['明日の予定をひとつ書く', 'discipline', 2],
    ['気になる言葉をひとつ調べる', 'intellect', 3],
    ['好きな曲を1曲、手を止めて聴く', 'mind', 4],
    ['身の回りのものを3つ元に戻す', 'discipline', 2],
    ['今日よかったことを1行書く', 'mind', 1]
  ];
  const urgentChoices = [
    ['明日最初にやることを1行書く', 'discipline'],
    ['目を閉じてゆっくり3呼吸する', 'mind'],
    ['手の届くものをひとつ片づける', 'discipline']
  ];
  function boardQuests(s, now = new Date()) {
    const today = day(now), sequence = Math.floor(Date.parse(today + 'T00:00:00Z') / 86400000);
    const pick = (pool, index) => pool[((index % pool.length) + pool.length) % pool.length];
    function entry(slot, choice) {
      const [name, stat, minutes = 1] = choice;
      return { id:slot, name, stat, minutes, xp:20, urgent:slot === 'urgent' };
    }
    const first = pick(dailyChoices, sequence);
    const otherStats = dailyChoices.filter(choice => choice[1] !== first[1]);
    const daily = [entry('workout', pick(workouts, sequence)), entry('a', first), entry('b', pick(otherStats, sequence + 3))];
    const urgentPool = urgentChoices.filter(choice => !daily.some(q => q.stat === choice[1]));
    const urgent = entry('urgent', pick(urgentPool.length ? urgentPool : urgentChoices, sequence));
    const activity = s.daily[today];
    if (boardDone(s, urgent.id, today) || (now.getHours() >= 18 && !activity?.quests && !activity?.focus && s.focusEnd == null)) daily.push(urgent);
    return daily;
  }
  function award(s, xp, stat, label, type, now) {
    const before = growth(s.totalXp);
    const gain = Math.max(1, Math.floor(xp / 20));
    s.totalXp += xp;
    s.stats[stat] += gain;
    s.history.unshift({ label, xp, at: now.toISOString(), type });
    s.history = s.history.slice(0, 100);
    dailyRecord(s, day(now)).xp += xp;
    const after = growth(s.totalXp);
    return { xp, stat, gain, label, before, after, levelUp: after.level > before.level,
      rankUp: after.rank.level > before.rank.level, badges: unlock(s, now) };
  }
  function completeQuest(s, id, now = new Date()) {
    const q = s.quests.find(q => q.id === id), today = day(now);
    if (!q || isDone(s, q.id, today)) return null;
    const d = dailyRecord(s, today);
    d.quests++;
    d.questIds.push(q.id);
    if (q.stat === 'strength') d.trained = true;
    s.completed[q.id] = today;
    return award(s, q.xp, q.stat, q.name, 'quest', now);
  }
  function completeBoardQuest(s, id, shownDay, now = new Date()) {
    if (shownDay !== day(now) || boardDone(s,id,shownDay)) return null;
    const q = boardQuests(s,now).find(q => q.id === id);
    if (!q) return null;
    const d = dailyRecord(s,shownDay);
    if (id === 'workout') d.trainingOfferDone = true;
    else (d.boardClaims ||= []).push(id);
    d.quests++;
    return award(s,q.xp,q.stat,q.name,'quest',now);
  }
  function duePlan(p, today) {
    return p.start <= today && (!p.weekdays.length || p.weekdays.includes(dateAt(today).getDay()));
  }
  function todayPlans(s, today = day()) {
    const done = s.daily[today]?.planLog || [];
    const doneIds = new Set(done.map(p => p.id));
    const pending = (s.plans || []).filter(p => duePlan(p, today) && !doneIds.has(p.id));
    return {pending, done};
  }
  function putPlan(s, plan, editing = false) {
    if (!validPlan(plan)) return '名前・日付・曜日を確認してください';
    const plans = s.plans || [];
    const index = plans.findIndex(p => p.id === plan.id);
    if (editing && index < 0) return 'この予定はすでに完了または削除されています';
    if (!editing && (index >= 0 || plans.length >= 100)) return '予定を追加できません。登録済みの予定を確認してください';
    if (plans.some(p => p.id !== plan.id && p.name === plan.name && p.start === plan.start &&
        p.weekdays.length === plan.weekdays.length && p.weekdays.every(d => plan.weekdays.includes(d)))) return '同じ予定が登録されています';
    s.plans = editing ? plans.map(p => p.id === plan.id ? plan : p) : [...plans, plan];
    return '';
  }
  function completePlan(s, id, shownDay, now = new Date()) {
    if (shownDay !== day(now)) return null;
    const p = todayPlans(s, shownDay).pending.find(item => item.id === id);
    if (!p) return null;
    const d = dailyRecord(s, shownDay);
    (d.planLog ||= []).push({id, name:p.name, stat:p.stat});
    if (!p.weekdays.length) s.plans = s.plans.filter(item => item.id !== id);
    d.quests++;
    if (p.stat === 'strength') d.trained = true;
    return award(s, 20, p.stat, p.name, 'quest', now);
  }
  const trainingTarget = 3, trainingBonus = 40;
  function trainingWeek(s, today = day()) {
    const start = weekStart(today);
    const strengthIds = new Set(s.quests.filter(q => q.stat === 'strength').map(q => q.id));
    const days = Array.from({length:7}, (_, i) => {
      const date = shiftDay(start, i), d = s.daily[date];
      const trained = date <= today && !!(d?.trained || d?.trainingOfferDone || d?.questIds.some(id => strengthIds.has(id)));
      return {date, trained};
    });
    return {start, days, count:days.filter(d => d.trained).length, target:trainingTarget, bonus:trainingBonus,
      claimed:days.some(d => s.daily[d.date]?.trainingRewardClaimed)};
  }
  function claimTrainingWeek(s, shownWeek, now = new Date()) {
    const today = day(now), week = trainingWeek(s, today);
    if (week.start !== shownWeek || week.count < week.target || week.claimed) return null;
    dailyRecord(s,today).trainingRewardClaimed = true;
    return award(s,week.bonus,'strength','週間筋トレ · 3日達成','weekly',now);
  }
  function removeQuest(s, id) {
    const quest = s.quests.find(q => q.id === id);
    // Older saves retained IDs but not the ability. Keep identifiable training days on removal.
    if (quest?.stat === 'strength') {
      for (const d of Object.values(s.daily)) if (d.questIds.includes(id)) d.trained = true;
    }
    s.quests = s.quests.filter(q => q.id !== id);
  }
  function completeFocus(s, now = new Date()) {
    if (s.focusEnd == null || s.focusEnd > now.getTime()) return null;
    s.focusEnd = null;
    dailyRecord(s, day(now)).focus++;
    return award(s, 40, 'intellect', '集中セッション', 'focus', now);
  }
  return { KEY, SCHEMA, names, badges, ranks, growth, day, shiftDay, weekStart, fresh, valid, migrate, progress, unlock,
    isDone, boardDone, boardQuests, completeBoardQuest, completeQuest, completeFocus, trainingWeek, claimTrainingWeek, removeQuest,
    duePlan, todayPlans, putPlan, completePlan };
});
