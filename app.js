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
  function showCelebration() {
    if ($('awakening').open || !celebrations.length) return;
    const result = celebrations.shift();
    $('awakening').classList.toggle('rank-up', result.rankUp);
    $('awakeningKind').textContent = result.rankUp ? 'RANK AWAKENING' : 'LEVEL UP';
    $('levelTransition').textContent = `LV.${result.before.level} → LV.${result.after.level}`;
    $('awakeningTitle').textContent = result.rankUp ? `「${result.after.rank.name}」へ、覚醒。` : '新しい自分へ。';
    $('awakeningText').textContent = result.rankUp ? result.after.rank.description : '積み重ねた一歩が、新しい力になりました。';
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
  function afterAward(result, focus = false) {
    if (!result) return;
    save(); render();
    document.querySelector(`[data-stat="${result.stat}"]`)?.classList.add('gained');
    if (result.levelUp) { celebrations.push(result); showCelebration(); }
    else {
      let text = `${focus ? '集中セッション完了' : 'クエスト達成'} · +${result.xp} XP\n${result.label} / ${C.names[result.stat]} +${result.gain}`;
      if (result.badges.length) text += `\n称号「${result.badges.join('」「')}」を獲得`;
      toast(text);
    }
  }
  function render() {
    const today = C.day(), g = C.growth(s.totalXp), l = g.level, p = g.xp;
    lastDay = today;
    $('level').textContent = l;
    $('rank').textContent = `${g.rank.mark} · ${g.rank.name}`;
    // Cosmetic avatar evolution derives from existing level; no save schema changes.
    const avatar = $('heroAvatar');
    avatar.dataset.stage = l >= 25 ? 'legend' : l >= 15 ? 'ascended' : l >= 5 ? 'awakened' : 'novice';
    $('heroStage').textContent = l >= 25 ? '星界の先駆者' : l >= 15 ? '蒼光の覚醒者' : l >= 5 ? '黎明の挑戦者' : '覚醒の旅人';
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
      node.append(el('span', 'stat-code', statCodes[key]), el('span', 'stat-name', name), el('b', '', s.stats[key]));
      return node;
    }));
    let completed = 0;
    $('quests').replaceChildren(...s.quests.map(q => {
      const done = C.isDone(s, q.id, today);
      if (done) completed++;
      const row = el('div', 'quest' + (done ? ' completed' : '')), button = el('button', '', done ? '✓' : '+');
      button.disabled = done || saveLocked;
      button.setAttribute('aria-label', q.name + 'を達成');
      button.onclick = () => {
        afterAward(C.completeQuest(s, q.id));
      };
      const name = el('div', 'name' + (done ? ' done' : ''), q.name);
      name.append(el('small', '', done ? '達成済み · また明日' : `${C.names[q.stat]} +${Math.max(1, Math.floor(q.xp / 20))}`));
      row.append(button, name, el('div', 'xp', done ? '受取済み' : '+' + q.xp + ' XP'));
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
      button.onclick = () => { s.quests = s.quests.filter(v => v.id !== q.id); save(); render(); };
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
  const pages = {
    home: ['YOUR NEXT CHAPTER', '日常から、覚醒へ。', '今日の一歩が、まだ見ぬ自分をつくる。'],
    missions: ['DAILY QUESTS', '挑戦を、日常に。', '自分で選んだ行動が、成長のきっかけになる。'],
    focus: ['MAKE TIME COUNT', '集中する時間。', 'ひとつのことに向き合う、小さな旅。'],
    records: ['GROWTH RECORD', '歩んだ道が、力になる。', '昨日までの挑戦は、ここに残っている。']
  };
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('[data-tab]').forEach(other => {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      });
      document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === button.dataset.tab));
      ['pageEyebrow', 'pageTitle', 'pageDescription'].forEach((id, i) => { $(id).textContent = pages[button.dataset.tab][i]; });
      render(); window.scrollTo(0, 0);
    };
  });
  $('createQuest').onclick = () => { document.querySelector('[data-tab="missions"]').click(); $('qname').focus(); };
  document.querySelector('.brand').onclick = event => { event.preventDefault(); document.querySelector('[data-tab="home"]').click(); };
  const presetSelect = $('goalPreset');
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
    const reward = presetRewards[option.value];
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
    save(); updateTimer();
  };
  $('resetTimer').onclick = () => { focusCompleted = false; s.focusEnd = null; save(); updateTimer(); toast('集中を中断しました。ここまでの経験値は変わりません。'); };
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
  function showUpdate() { if (registration?.waiting) $('updateNotice').hidden = false; }
  async function checkUpdate(manual = false) {
    if (!registration) { if (manual) toast('オンラインで開いてから、もう一度お試しください'); return; }
    try {
      await registration.update(); showUpdate();
      if (manual && !registration.waiting) toast('更新を確認しました。準備ができるとお知らせします');
    } catch { if (manual) toast('更新を確認できませんでした。接続を確認してください'); }
  }
  $('applyUpdate').onclick = () => {
    if (!registration?.waiting || !save()) return;
    reloadForUpdate = true; $('applyUpdate').disabled = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  $('checkUpdate').onclick = () => checkUpdate(true);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadForUpdate) location.reload(); });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      registration = reg; showUpdate();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
      checkUpdate();
    }).catch(() => { /* Online play and local saves work without offline support. */ });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { updateTimer(); render(); checkUpdate(); }
  });
})();
