(() => {
  'use strict';
  const C = window.SoloLife, $ = id => document.getElementById(id);
  let s = C.fresh(), raw = null, saveLocked = false, warning = '', lastDay = C.day();
  try {
    raw = localStorage.getItem(C.KEY);
    if (raw) {
      const old = JSON.parse(raw);
      s = C.migrate(old);
      if (old.schemaVersion !== C.SCHEMA && !localStorage.getItem('solo-life-pre-v03')) {
        localStorage.setItem('solo-life-pre-v03', raw);
      }
    }
  } catch (error) {
    if (raw) {
      saveLocked = true;
      warning = '保存データを安全に更新できませんでした。元のデータは保持しています。「記録」からバックアップを書き出してください。';
    } else warning = '進捗を保存できません。Safariの設定と空き容量を確認してください。';
  }
  function showWarning(message) {
    $('storageWarning').textContent = message;
    $('storageWarning').hidden = !message;
  }
  function save() {
    if (saveLocked) { showWarning(warning); return false; }
    try {
      localStorage.setItem(C.KEY, JSON.stringify(s));
      showWarning('');
      return true;
    } catch {
      showWarning('進捗を保存できません。Safariの設定と空き容量を確認し、「記録」からバックアップを書き出してください。');
      return false;
    }
  }
  const statCodes = { strength: 'STR', intellect: 'INT', mind: 'MND', wealth: 'WLT', health: 'VIT', discipline: 'DSC' };
  const celebrations = [];
  let focusCompleted = false;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').style.display = 'block';
    clearTimeout(window.toastT);
    window.toastT = setTimeout(() => { $('toast').style.display = 'none'; }, 4000);
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function statIcon(key) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const use = document.createElementNS(ns, 'use');
    svg.setAttribute('class', 'stat-icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#stat-' + key);
    svg.append(use);
    return svg;
  }
  function showCelebration() {
    if ($('awakening').open || !celebrations.length) return;
    const result = celebrations.shift();
    $('awakening').classList.toggle('rank-up', result.rankUp);
    $('awakeningKind').textContent = result.rankUp ? 'RANK UP' : 'LEVEL UP';
    $('levelTransition').textContent = `LV.${result.before.level} → LV.${result.after.level}`;
    $('awakeningTitle').textContent = result.rankUp ? `${result.after.rank.name}に昇格` : 'レベルアップ';
    $('awardDetail').textContent = `+${result.xp} XP  ·  ${C.names[result.stat]} +${result.gain}` +
      (result.badges.length ? `\n称号「${result.badges.join('」「')}」を獲得` : '');
    $('toast').style.display = 'none';
    if (typeof $('awakening').showModal === 'function') $('awakening').showModal();
    else toast(`${$('awakeningTitle').textContent} LV.${result.after.level} / +${result.xp} XP`);
  }
  $('continueGrowth').onclick = () => $('awakening').close();
  $('awakening').addEventListener('close', () => {
    if (celebrations.length) showCelebration();
    else document.querySelector('.tabs button.active').focus({ preventScroll: true });
  });
  function afterAward(result, focus = false, alreadySaved = false) {
    if (!result) return;
    if (!alreadySaved) save();
    render();
    document.querySelector(`#stats [data-stat="${result.stat}"]`)?.classList.add('gained');
    if (result.levelUp) { celebrations.push(result); showCelebration(); }
    else {
      let text = `${focus ? '集中セッション完了' : 'クエスト達成'} · +${result.xp} XP\n${result.label} / ${C.names[result.stat]} +${result.gain}`;
      if (result.badges.length) text += `\n称号「${result.badges.join('」「')}」を獲得`;
      toast(text);
    }
  }
  let boardHour = -1;
  const reminder = window.SoloReminders?.init(() => s, toast);
  async function updateSaved(change) {
    if (saveLocked) { showWarning(warning); return null; }
    const complete = () => {
      const latest = localStorage.getItem(C.KEY);
      const updated = C.migrate(latest ? JSON.parse(latest) : s);
      const result = change(updated);
      if (result) localStorage.setItem(C.KEY, JSON.stringify(updated));
      s = updated;
      return result;
    };
    try {
      return navigator.locks ? await navigator.locks.request('solo-life-quest-reward', complete) : complete();
    } catch {
      showWarning('保存できませんでした。空き容量と保存データを確認してください。');
      return null;
    }
  }
  async function recordReward(button, applyReward) {
    button.disabled = true;
    const result = await updateSaved(applyReward);
    if (result) afterAward(result, false, true);
    else render();
  }
  const renderPlans = window.SoloPlanner?.init({C, $, el, statIcon, updateSaved, recordReward, refresh:render, toast});
  const renderJourney = window.SoloJourneyUI?.init({C, $, el, updateSaved, refresh:render, toast});
  const goalSelect = $('habitGoal');
  if (goalSelect && C.habits) {
    for (const [id, label] of Object.entries(C.habits.categories)) goalSelect.add(new Option(label, id));
    goalSelect.onchange = async () => {
      const goal = goalSelect.value;
      goalSelect.disabled = true;
      await updateSaved(data => { data.habitGoal = goal; return true; });
      render();
    };
  }
  function boardRow(q, today) {
    const done = C.boardDone(s, q.id, today);
    const row = el('div', done ? 'quest completed' : 'quest');
    row.dataset.stat = q.stat;
    const name = el('div', 'name', q.name);
    const workout = q.id === 'workout';
    const category = q.key ? C.habits.categories[q.category] : workout ? '今日の筋トレ' : C.names[q.stat];
    const difficulty = q.tier ? ' · ' + C.habits.levels[q.tier - 1] : '';
    const reward = el('small', '', category + difficulty + ' · ' + q.minutes + '分 · ');
    reward.append(el('span', 'xp', '+' + q.xp + ' XP'));
    name.append(reward);
    const button = el('button', '', done ? '達成済み' : '達成');
    button.disabled = saveLocked || done;
    button.setAttribute('aria-label', q.name + 'を達成');
    button.onclick = () => recordReward(button, data => C.completeBoardQuest(data, q.id, today, new Date(), q.key || q.name));
    row.append(statIcon(workout ? 'workout' : q.stat), name, button);
    return row;
  }
  function renderTraining(today) {
    const week = C.trainingWeek(s,today);
    $('trainingCount').textContent = Math.min(week.count,week.target) + ' / ' + week.target + ' 日';
    $('trainingPrize').textContent = week.claimed ? '＋' + week.bonus + ' XP 受取済み' : '＋' + week.bonus + ' XP';
    $('trainingDays').replaceChildren(...week.days.map(({date,trained}, i) => {
      const item = el('li', trained ? 'trained' : '');
      if (date === today) item.setAttribute('aria-current','date');
      const weekday = '月火水木金土日'[i];
      item.setAttribute('aria-label', date + ' ' + weekday + '曜日 ' + (trained ? '達成' : date > today ? 'これから' : '未達成'));
      item.append(el('span','',weekday), el('b','',trained ? '✓' : '–'));
      return item;
    }));
    const claim = $('claimTraining');
    claim.hidden = week.count < week.target || week.claimed;
    claim.disabled = saveLocked;
    claim.onclick = () => recordReward(claim, data => C.claimTrainingWeek(data,week.start));
  }
  function renderBoard(now = new Date()) {
    if (!$('todayBoard')) return;
    boardHour = now.getHours();
    const today = C.day(now), quests = C.boardQuests(s, now);
    if (goalSelect && C.habits) {
      goalSelect.value = s.habitGoal || 'balance';
      goalSelect.disabled = saveLocked;
      const {goal, tier} = C.boardSetup(s, today);
      const label = C.habits.levels[tier - 1];
      const next = tier === 1 ? '累計7日のクエスト達成で「習慣」へ' : tier === 2 ? '累計30日のクエスト達成で「挑戦」へ' : '3段階すべてのクエストが対象';
      $('boardLevel').textContent = goal !== goalSelect.value
        ? '今日は' + (C.habits.categories[goal] || 'バランス') + 'の提案です。新しい目標は明日から反映します。'
        : '今日の段階は' + label + '。' + next + '。';
    }
    const daily = quests.filter(q => !q.urgent), urgent = quests.find(q => q.urgent);
    $('dailyOffers').replaceChildren(...daily.map(q => boardRow(q, today)));
    $('boardCount').textContent = daily.filter(q => C.boardDone(s,q.id,today)).length + ' / ' + daily.length + ' 達成';
    $('urgentOffer').hidden = !urgent;
    $('urgentRow').replaceChildren(...(urgent ? [boardRow(urgent, today)] : []));
    if ($('trainingDays')) renderTraining(today);
    reminder?.sync();
  }
  let period = 7;
  function renderGrowth(today) {
    if (!$('growthNumbers')) return;
    const result = C.periodGrowth(s, period, today);
    const date = key => Number(key.slice(5, 7)) + '/' + Number(key.slice(8));
    $('growthDates').textContent = date(result.start) + ' 〜 ' + date(result.end);
    const metrics = [['クエスト達成', result.quests, '件'], ['活動日数', result.active, '日'], ['獲得XP', result.xp, 'XP']];
    $('growthNumbers').replaceChildren(...metrics.map(([label, value, unit]) => {
      const item = el('div'), number = el('strong', '', value.toLocaleString('ja-JP'));
      number.append(el('small', '', unit));
      item.append(el('span', '', label), number);
      return item;
    }));
    $('growthChange').textContent = result.change === 0 ? '前の' + period + '日間と同じ達成件数'
      : '前の' + period + '日間より達成が' + Math.abs(result.change) + '件' + (result.change > 0 ? '増えました' : '減りました');
    $('growthActions').textContent = 'おすすめで達成した歩行 ' + result.walk + '分 · 筋トレ ' + result.reps + '回';
  }
  for (const button of document.querySelectorAll('[data-period]')) {
    button.onclick = () => {
      period = Number(button.dataset.period);
      for (const tab of button.parentElement.children) tab.setAttribute('aria-pressed', String(tab === button));
      renderGrowth(C.day());
    };
  }
  function render() {
    const today = C.day(), g = C.growth(s.totalXp), l = g.level, p = g.xp;
    lastDay = today;
    renderBoard();
    renderGrowth(today);
    renderPlans?.(s, today, saveLocked);
    renderJourney?.(s, today, saveLocked);
    const onHome = $('home').classList.contains('active');
    if (onHome && $('planner')) {
      $('pageTitle').textContent = new Date().toLocaleDateString('ja-JP', {month:'long', day:'numeric', weekday:'short'});
    }
    const dateLabel = $('todayDate');
    if (dateLabel) {
      dateLabel.hidden = onHome && !!$('planner');
      dateLabel.dateTime = today;
      dateLabel.textContent = today.slice(5).replace('-', '.') + ' / ' +
        new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    }
    $('level').textContent = l;
    $('rank').textContent = `${g.rank.mark} · ${g.rank.name}`;
    // Cosmetic avatar evolution derives from existing level; no save schema changes.
    const avatar = $('heroAvatar');
    avatar.dataset.stage = window.SoloJourney.evolution(s).current.id;
    $('heroStage').textContent = window.SoloJourney.evolution(s).current.name;
    $('xpfill').style.width = p + '%';
    $('xptext').textContent = p + ' / 100 XP';
    $('xpBar').setAttribute('aria-valuenow', p);
    $('xpBar').setAttribute('aria-valuetext', `次のレベルまで ${g.remaining} XP`);
    $('nextLevel').textContent = `次のレベルまで ${g.remaining} XP`;
    $('totalXp').textContent = s.totalXp.toLocaleString('ja-JP') + ' XP';
    $('rankNext').textContent = g.next ? `次は「${g.next.name}」 · LV.${g.next.level} / あと${g.rankRemaining} XP` : '最終ランク「星冠」 · 成長は続く';
    $('rankDescription').textContent = g.rank.description;
    $('rankPath').replaceChildren(...C.ranks.map(r => {
      const current = r.level === g.rank.level;
      const node = el('li', current ? 'current' : l >= r.level ? 'reached' : '');
      if (current) node.setAttribute('aria-current', 'step');
      node.append(el('b', '', r.mark), el('span', '', r.name), el('small', '', `LV.${r.level}${current ? ' · 現在' : ''}`));
      return node;
    }));
    $('stats').replaceChildren(...Object.entries(C.names).map(([key, name]) => {
      const node = el('div', 'stat');
      node.dataset.stat = key;
      node.append(statIcon(key), el('span', 'stat-code', statCodes[key]), el('span', 'stat-name', name), el('b', '', s.stats[key]));
      return node;
    }));
    let completed = 0;
    $('quests').replaceChildren(...s.quests.map(q => {
      const done = C.isDone(s, q.id, today);
      if (done) completed++;
      const row = el('div', 'quest' + (done ? ' completed' : '')), button = el('button', '', done ? '済' : '達成');
      row.dataset.stat = q.stat;
      button.disabled = done || saveLocked;
      button.setAttribute('aria-label', q.name + 'を達成');
      button.onclick = () => recordReward(button, data => today === C.day() ? C.completeQuest(data,q.id) : null);
      const name = el('div', 'name' + (done ? ' done' : ''), q.name);
      const reward = el('small');
      reward.append(el('span', 'xp', '+' + q.xp + ' XP'), '  ·  ' + (done ? '受取済み' : `${C.names[q.stat]} +${Math.max(1, Math.floor(q.xp / 20))}`));
      name.append(reward);
      row.append(statIcon(q.stat), name, button);
      return row;
    }));
    if (!s.quests.length) $('quests').append(el('p', 'note', '「クエスト」から新しい挑戦を追加しましょう。'));
    $('progress').textContent = `${completed} / ${s.quests.length} 達成`;
    const pv = C.progress(s, today), defeated = !!s.defeatedBosses[pv.start];
    $('streak').textContent = `連続達成 ${pv.streak}日`;
    $('bestStreak').textContent = `最長 ${pv.longest}日`;
    $('boss').textContent = defeated ? '継続の番人 · 討伐成功！' : '週間ボス「継続の番人」';
    $('bossCount').textContent = `${pv.weekly} / 10 クエスト達成`;
    $('bossHint').textContent = defeated ? '今週の討伐を記録しました。次の挑戦は月曜日！' : `討伐まであと${Math.max(0, 10 - pv.weekly)}件`;
    $('bossFill').style.width = Math.min(100, pv.weekly * 10) + '%';
    $('bossBar').setAttribute('aria-valuenow', Math.min(pv.weekly, 10));
    $('bossBar').setAttribute('aria-valuetext', `${pv.weekly}件達成、目標10件`);
    const short = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    $('weekRange').textContent = `${short(pv.start)}〜${short(pv.end)}（月〜日）`;
    $('weekSummary').textContent = `${pv.activeDays}日活動 · ${pv.weekly}件達成 · ${pv.weeklyXp} XP`;
    const max = Math.max(3, ...pv.days.map(d => d.quests));
    $('weekDays').replaceChildren(...pv.days.map((d, i) => {
      const future = d.day > today, node = el('div', 'week-day' + (d.day === today ? ' today' : '') + (future ? ' future' : ''));
      node.setAttribute('aria-label', `${short(d.day)} ${future ? 'これから' : d.quests + '件達成'}`);
      if (d.day === today) node.setAttribute('aria-current', 'date');
      const track = el('div', 'day-track'), fill = el('div', 'day-fill');
      fill.style.height = (d.quests / max * 100) + '%';
      track.append(fill);
      node.append(el('b', '', future ? '—' : d.quests), track, el('span', '', '月火水木金土日'[i]));
      return node;
    }));
    $('achievements').replaceChildren(...C.badges.map(b => {
      const unlocked = !!s.achievements[b.id], node = el('div', 'achievement' + (unlocked ? ' unlocked' : ''));
      node.append(el('div', 'badge-name', (unlocked ? '◇ ' : '○ ') + b.name), el('small', '', b.description));
      if (unlocked) node.append(el('small', 'earned', '獲得済み'));
      return node;
    }));
    $('badgeCount').textContent = `${Object.keys(s.achievements).length} / 5 獲得`;
    $('manage').replaceChildren(...s.quests.map(q => {
      const row = el('div', 'quest'), button = el('button', '', '×');
      button.setAttribute('aria-label', q.name + 'を削除');
      button.disabled = saveLocked;
      button.onclick = () => { C.removeQuest(s,q.id); save(); render(); };
      row.append(el('div', 'name', q.name + ' / ' + C.names[q.stat] + ' / ' + q.xp + ' XP'), button);
      return row;
    }));
    if (!s.quests.length) $('manage').append(el('p', 'note', 'まだクエストがありません。最初の一歩を追加しましょう。'));
    $('add').disabled = saveLocked;
    $('summary').textContent = `総獲得経験値 ${s.totalXp} XP / 現在レベル ${l} / ランク「${g.rank.name}」`;
    $('bossRecord').textContent = `週間ボス討伐 ${Object.keys(s.defeatedBosses).length}回`;
    $('history').replaceChildren(...(s.history.length ? s.history.slice(0, 20).map(h => {
      const row = el('div', 'history'), info = el('div'), time = el('time', '', new Date(h.at).toLocaleString('ja-JP'));
      time.dateTime = h.at;
      info.append(time, el('span', '', h.label));
      row.append(info, el('b', '', `+${h.xp} XP`)); return row;
    }) : [el('p', 'muted', 'まだ記録がありません。最初の達成をここに。')]));
  }
  const pages = { home: 'ホーム', missions: 'クエスト', focus: '集中タイマー', records: '成長記録', journey: '育成の間' };
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('[data-tab]').forEach(other => {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      });
      document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === button.dataset.tab));
      $('pageTitle').textContent = pages[button.dataset.tab];
      render(); window.scrollTo(0, 0);
    };
  });
  $('createQuest').onclick = () => { document.querySelector('[data-tab="missions"]').click(); $('qname').focus(); };
  document.querySelector('.brand').onclick = event => { event.preventDefault(); document.querySelector('[data-tab="home"]').click(); };
  const presetSelect = $('goalPreset');
  const habitPresets = new Map();
  if (C.habits) {
    for (const [id, label] of Object.entries(C.habits.categories)) {
      let group = [...presetSelect.querySelectorAll('optgroup')].find(g => g.label === label);
      if (!group) { group = el('optgroup'); group.label = label; presetSelect.append(group); }
      for (const q of C.habits.catalog.filter(q => q.category === id)) {
        if ([...group.children].some(option => option.text === q.name)) continue;
        const key = 'habit-' + q.key;
        const option = new Option(q.name, key);
        option.label = C.habits.levels[q.tier - 1] + ' · ' + q.name;
        group.append(option);
        habitPresets.set(key, [q.stat, [20,40,80][q.tier - 1]]);
      }
    }
  }
  // A v0.7 worker can still serve its earlier HTML during a network update.
  const choices = $('goalChoices');
  if (choices) {
    const firstQuest = $('firstQuest');
    firstQuest.hidden = raw !== null || !!warning;
    firstQuest.onclick = () => {
      document.querySelector('[data-tab="missions"]').click();
      choices.firstElementChild.focus();
    };
    document.querySelector('[data-tab="missions"]').addEventListener('click', () => { firstQuest.hidden = true; });
    const prompt = presetSelect.options[0];
    const groups = [...presetSelect.querySelectorAll('optgroup')];
    for (const group of [null, ...groups]) {
      const button = el('button', '', group?.label ?? 'すべて');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(!group));
      button.setAttribute('aria-controls', 'goalPreset');
      button.onclick = () => {
        presetSelect.replaceChildren(prompt, ...(group ? [group] : groups));
        presetSelect.value = '';
        for (const choice of choices.children) {
          choice.setAttribute('aria-pressed', String(choice === button));
        }
      };
      choices.append(button);
    }
  }
  const presetRewards = {
    'fitness-squat': ['strength', 20], 'fitness-workout': ['strength', 80], 'fitness-walk': ['health', 40],
    'study-review': ['intellect', 20], 'study-read': ['intellect', 40], 'study-focus': ['intellect', 80],
    'work-next': ['discipline', 20], 'work-deep': ['discipline', 80], 'work-plan': ['wealth', 40],
    'beauty-skin': ['discipline', 20], 'health-care': ['mind', 20],
    'health-break': ['health', 20], 'health-stretch': ['health', 20]
  };
  presetSelect.onchange = () => {
    const option = presetSelect.selectedOptions[0];
    const reward = habitPresets.get(option.value) || presetRewards[option.value];
    if (!reward) return;
    $('qname').value = option.text;
    [$('qstat').value, $('qxp').value] = reward;
  };
  $('add').onclick = () => {
    const name = $('qname').value.trim();
    if (!name) return toast('クエスト名を入力してください');
    if (s.quests.length >= 30) return toast('クエストは最大30件です');
    if (s.quests.some(q => q.name.trim().toLocaleLowerCase('ja-JP') === name.toLocaleLowerCase('ja-JP'))) {
      return toast('同じ名前のクエストは登録済みです。既存のクエストをご利用ください');
    }
    const previousQuests = s.quests;
    s.quests = [...s.quests, { id: 'q' + Date.now() + Math.random().toString(36).slice(2, 7), name, stat: $('qstat').value, xp: Number($('qxp').value) }];
    if (!save()) { s.quests = previousQuests; return; }
    $('qname').value = '';
    $('goalPreset').value = '';
    render(); toast('クエストを追加しました。達成後に経験値を受け取れます');
  };
  $('minutes').value = String(s.focusMinutes);
  function updateTimer() {
    if (lastDay !== C.day()) { C.unlock(s); save(); render(); }
    if (boardHour !== new Date().getHours()) renderBoard();
    const result = C.completeFocus(s);
    if (result) { focusCompleted = true; afterAward(result, true); }
    const running = s.focusEnd != null;
    const remain = running ? Math.max(0, Math.ceil((s.focusEnd - Date.now()) / 1000)) : focusCompleted ? 0 : Number($('minutes').value) * 60;
    $('timer').textContent = String(Math.floor(remain / 60)).padStart(2, '0') + ':' + String(remain % 60).padStart(2, '0');
    $('start').disabled = running || saveLocked;
    $('start').textContent = running ? '集中しています…' : focusCompleted ? 'もう一度、集中する' : '集中を開始';
    $('minutes').disabled = running || saveLocked;
    $('resetTimer').disabled = !running || saveLocked;
    $('timerState').textContent = running ? 'FOCUS IN PROGRESS' : focusCompleted ? 'SESSION COMPLETE' : 'READY TO FOCUS';
    $('timerHint').textContent = running ? 'この時間が、あなたの力になる。' : focusCompleted ? 'おつかれさま。積み重ねを記録しました。' : 'ひとつのことに、意識を向けよう。';
    $('timerRing').style.setProperty('--elapsed', (running ? Math.min(100, Math.max(0, (1 - remain / (s.focusMinutes * 60)) * 100)) : focusCompleted ? 100 : 0) + '%');
    document.querySelector('.focus-panel').classList.toggle('running', running);
    $('focusDot').hidden = !running;
  }
  $('minutes').onchange = () => { focusCompleted = false; s.focusMinutes = Number($('minutes').value); save(); updateTimer(); };
  $('start').onclick = () => {
    if (s.focusEnd != null) return;
    focusCompleted = false;
    s.focusMinutes = Number($('minutes').value);
    s.focusEnd = Date.now() + s.focusMinutes * 60000;
    save(); updateTimer(); renderBoard();
  };
  $('resetTimer').onclick = () => { focusCompleted = false; s.focusEnd = null; save(); updateTimer(); renderBoard(); toast('集中を中断しました。ここまでの経験値は変わりません。'); };
  $('export').onclick = () => {
    const data = saveLocked && raw ? raw : JSON.stringify(s, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'solo-life-backup-' + C.day() + '.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  $('import').onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const restored = C.migrate(JSON.parse(await file.text()));
      if (!confirm('現在のセーブデータをバックアップの内容で置き換えますか？')) return;
      // Persist the replacement before changing the working state.
      localStorage.setItem(C.KEY, JSON.stringify(restored));
      s = restored; saveLocked = false; raw = null; focusCompleted = false; showWarning('');
      $('minutes').value = String(s.focusMinutes);
      render(); updateTimer(); toast('復元しました');
    } catch { toast('バックアップを読み込めませんでした。形式と保存容量を確認してください。'); }
    finally { event.target.value = ''; }
  };
  window.addEventListener('storage', event => {
    if (event.key !== C.KEY || !event.newValue) return;
    try {
      s = C.migrate(JSON.parse(event.newValue));
      saveLocked = false; raw = null;
      $('minutes').value = String(s.focusMinutes);
      render(); updateTimer();
    } catch { /* Keep the last valid state when another tab writes invalid data. */ }
  });
  render(); showWarning(warning); save(); updateTimer();
  setInterval(updateTimer, 1000);

  let registration, reloadForUpdate = false;
  function showUpdate() {
    $('updateNotice').hidden = !(registration?.waiting && navigator.serviceWorker.controller);
  }
  async function checkUpdate(manual = false) {
    if (!registration) { if (manual) toast('オンラインで開いてから、もう一度お試しください'); return; }
    try {
      await registration.update(); showUpdate();
      if (manual && !registration.waiting) toast('更新を確認しました。準備ができるとお知らせします');
    } catch { if (manual) toast('更新を確認できませんでした。接続を確認してください'); }
  }
  $('applyUpdate').onclick = () => {
    if (!registration?.waiting) { showUpdate(); return; }
    if (!save()) return;
    reloadForUpdate = true; $('applyUpdate').disabled = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  $('checkUpdate').onclick = () => checkUpdate(true);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadForUpdate) location.reload();
      else showUpdate();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      registration = reg; showUpdate();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (['installed','activating','activated','redundant'].includes(worker.state)) showUpdate();
        });
      });
      checkUpdate();
    }).catch(() => { /* Online play and local saves work without offline support. */ });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { updateTimer(); render(); checkUpdate(); }
  });
  function showToday() {
    if (location.hash !== '#todayBoard') return;
    document.querySelector('[data-tab="home"]').click();
    $('todayBoard')?.scrollIntoView({block:'start'});
  }
  window.addEventListener('hashchange',showToday);
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'SHOW_TODAY') {
      if (location.hash === '#todayBoard') showToday();
      else location.hash = 'todayBoard';
    }
  });
  showToday();
})();
