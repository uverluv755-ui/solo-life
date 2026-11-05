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
  // Presentation preferences are separate from the unchanged progression save.
  const presentationKey = 'solo-life-presentation-v1';
  let preferences = { sound: false, calm: false }, audioContext;
  try {
    const saved = JSON.parse(localStorage.getItem(presentationKey));
    if (saved && typeof saved === 'object') preferences = { sound: saved.sound === true, calm: saved.calm === true };
  } catch { /* Invalid or unavailable settings never affect player progress. */ }
  function applyPreferences() {
    document.documentElement.dataset.motion = preferences.calm ? 'calm' : 'full';
    $('soundEnabled').checked = preferences.sound;
    $('calmMotion').checked = preferences.calm;
  }
  function savePreferences() {
    applyPreferences();
    try { localStorage.setItem(presentationKey, JSON.stringify(preferences)); }
    catch { $('presentationNote').textContent = '演出設定を保存できませんでした。この画面を開いている間だけ適用します。'; }
  }
  function armAudio() {
    if (!preferences.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* Audio is optional, including on silent/unsupported devices. */ }
  }
  function sound(kind = 'reward') {
    if (!preferences.sound || !audioContext || audioContext.state !== 'running' || document.hidden) return;
    try {
      const tones = kind === 'rank' ? [220, 330, 440, 660, 880] : kind === 'level' ? [330, 440, 660] : [520, 780];
      tones.forEach((hz, i) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const start = audioContext.currentTime + i * .105;
        oscillator.type = 'sine'; oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.045, start + .015);
        gain.gain.exponentialRampToValueAtTime(.001, start + .25);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start + .27);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Feedback never blocks a reward or a save. */ }
  }
  $('soundEnabled').onchange = () => { preferences.sound = $('soundEnabled').checked; savePreferences(); armAudio(); };
  $('calmMotion').onchange = () => { preferences.calm = $('calmMotion').checked; savePreferences(); };
  applyPreferences();
  function toast(text, kind = 'info') {
    $('toast').dataset.kind = kind;
    $('toast').dataset.label = kind === 'reward' ? 'REWARD CONFIRMED / 報酬受取' : 'SYSTEM NOTICE / 通知';
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
    const preview = result.preview === true;
    $('awakening').classList.toggle('rank-up', result.rankUp);
    $('awakeningKind').textContent = preview ? 'AWAKENING PREVIEW' : result.rankUp ? 'RANK AWAKENING' : 'LEVEL UP';
    $('awakeningNumber').textContent = result.after.level;
    $('levelTransition').textContent = preview ? `CURRENT LEVEL / LV.${result.after.level}` : `LV.${result.before.level} → LV.${result.after.level}`;
    $('awakeningTitle').textContent = preview ? '次なる覚醒を、その手に。' : result.rankUp ? `「${result.after.rank.name}」へ、覚醒。` : '限界を突破。';
    $('awakeningText').textContent = preview ? 'これは演出のプレビューです。次の覚醒は、現実の行動から始まる。' : result.rankUp ? result.after.rank.description : '成長を検知。プレイヤーレベルの上昇を確認しました。';
    $('awardDetail').textContent = preview ? 'プレビュー / 経験値・能力値の変更なし' : `+${result.xp} XP  ·  ${C.names[result.stat]} +${result.gain}` +
      (result.dailyClear ? '\nDAILY CLEAR / 本日の任務、完遂。' : '') +
      (result.badges.length ? `\n称号「${result.badges.join('」「')}」を獲得` : '');
    $('awakeningFootnote').textContent = preview ? 'PREVIEW / セーブデータは変わりません' : result.saved === false ? '未保存 / 記録からバックアップを書き出してください' : 'SYSTEM / 成長記録を更新しました';
    $('continueGrowth').textContent = preview ? 'プレビューを終了' : '能力の更新を確認';
    $('toast').style.display = 'none';
    if (typeof $('awakening').showModal === 'function') $('awakening').showModal();
    else toast(`${$('awakeningTitle').textContent} LV.${result.after.level}`);
    sound(result.rankUp ? 'rank' : 'level');
  }
  $('previewAwakening').onclick = () => {
    armAudio();
    const growth = C.growth(s.totalXp);
    celebrations.push({ preview: true, before: growth, after: growth, rankUp: true });
    showCelebration();
  };
  $('continueGrowth').onclick = () => $('awakening').close();
  $('awakening').addEventListener('close', () => {
    if (celebrations.length) showCelebration();
    else document.querySelector('.tabs button.active').focus({ preventScroll: true });
  });
  function afterAward(result, focus = false) {
    if (!result) return;
    result.saved = save(); render();
    result.dailyClear = !focus && s.quests.length > 0 && s.quests.every(q => C.isDone(s, q.id));
    document.querySelector(`[data-stat="${result.stat}"]`)?.classList.add('gained');
    if (result.dailyClear) $('dailyClear').classList.add('just-cleared');
    if (result.levelUp) { celebrations.push(result); showCelebration(); }
    else {
      let text = `${focus ? '集中セッション完了' : 'クエスト達成'} · +${result.xp} XP\n${result.label} / ${C.names[result.stat]} +${result.gain}`;
      if (result.badges.length) text += `\n称号「${result.badges.join('」「')}」を獲得`;
      if (result.dailyClear) text += '\nDAILY CLEAR / 本日の任務、完遂。';
      if (!result.saved) text += '\n未保存です。「記録」からバックアップを書き出してください。';
      toast(text, 'reward');
      const receipt = el('div', 'reward-receipt');
      receipt.append(el('strong', '', `+${result.xp}`), el('span', '', 'XP 獲得'));
      $('toast').prepend(receipt);
      sound('reward');
    }
  }
  function render() {
    const today = C.day(), g = C.growth(s.totalXp), l = g.level, p = g.xp;
    lastDay = today;
    $('level').textContent = l;
    $('rank').textContent = `${g.rank.mark} · ${g.rank.name}`;
    $('playerTitle').textContent = g.next ? '次の覚醒へ、成長中' : '最高位到達 · 成長継続';
    document.querySelector('.status-panel').dataset.rank = g.rank.mark;
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
      const track = el('div', 'attribute-track'), fill = el('i');
      track.setAttribute('aria-hidden', 'true');
      fill.style.width = Math.max(0, s.stats[key] / Math.max(1, ...Object.values(s.stats)) * 100) + '%';
      track.append(fill); node.append(track);
      return node;
    }));
    $('abilityTotal').textContent = 'TOTAL ' + Object.values(s.stats).reduce((sum, value) => sum + value, 0);
    let completed = 0;
    $('quests').replaceChildren(...s.quests.map(q => {
      const done = C.isDone(s, q.id, today);
      if (done) completed++;
      const row = el('div', 'quest' + (done ? ' completed' : '')), button = el('button', '', done ? '✓' : '+');
      button.disabled = done || saveLocked;
      button.setAttribute('aria-label', q.name + 'を達成');
      button.onclick = () => {
        armAudio();
        afterAward(C.completeQuest(s, q.id));
      };
      const name = el('div', 'name' + (done ? ' done' : ''), q.name);
      name.append(el('small', '', done ? 'COMPLETE / 報酬受取済み' : `難易度 ${q.xp === 80 ? 'III' : q.xp === 40 ? 'II' : 'I'} · ${C.names[q.stat]} +${Math.max(1, Math.floor(q.xp / 20))}`));
      row.append(button, name, el('div', 'xp', done ? '受取済み' : '+' + q.xp + ' XP'));
      return row;
    }));
    if (!s.quests.length) $('quests').append(el('p', 'note', '「クエスト」から新しい挑戦を追加しましょう。'));
    $('progress').textContent = `${completed} / ${s.quests.length} 達成`;
    const pv = C.progress(s, today), defeated = !!s.defeatedBosses[pv.start];
    const allDone = s.quests.length > 0 && completed === s.quests.length;
    $('dailyClear').hidden = !allDone;
    $('dailyClear').classList.remove('just-cleared');
    document.querySelector('.system-message').classList.toggle('cleared', allDone);
    $('missionDirective').textContent = !s.quests.length ? '任務未登録。新たな挑戦を設定せよ。' : allDone ? '全任務の完了を確認。次の挑戦に備えよ。' : `未完了の任務 ${s.quests.length - completed}件。行動を開始せよ。`;
    $('dailyStatus').textContent = `本日の獲得 ${s.daily[today]?.xp || 0} XP · 記録はこの端末に保存`;
    $('streak').textContent = `連続達成 ${pv.streak}日`;
    $('bestStreak').textContent = `最長 ${pv.longest}日`;
    $('boss').textContent = defeated ? '継続の番人 · 討伐成功！' : '週間ボス「継続の番人」';
    $('bossCount').textContent = `${pv.weekly} / 10 クエスト達成`;
    const barrier = Math.max(0, 100 - pv.weekly * 10);
    $('bossHealth').textContent = barrier + '%';
    $('barrierFill').style.width = barrier + '%';
    document.querySelector('.weekly-challenge').classList.toggle('defeated', defeated);
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
    home: ['AWAKENING PROTOCOL / 01', 'その限界を、更新せよ。', '現実の行動が、次の覚醒を引き起こす。'],
    missions: ['QUEST CONTROL / 02', '任務を選択せよ。', '行動の完了を確認し、成長報酬を受け取れ。'],
    focus: ['FOCUS CHAMBER / 03', '集中領域へ接続。', '意識を研ぎ澄ませ。時間を力に変えよ。'],
    records: ['SYSTEM ARCHIVE / 04', '成長の軌跡を照合。', 'すべての達成が、次の自分をつくる。']
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
  $('add').onclick = () => {
    const name = $('qname').value.trim();
    if (!name) return toast('クエスト名を入力してください');
    if (s.quests.length >= 30) return toast('クエストは最大30件です');
    s.quests.push({ id: 'q' + Date.now() + Math.random().toString(36).slice(2, 7), name, stat: $('qstat').value, xp: Number($('qxp').value) });
    $('qname').value = ''; save(); render(); toast('クエストを追加しました');
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
    $('start').textContent = running ? '領域接続中…' : focusCompleted ? 'もう一度、領域へ入る' : '集中領域へ入る';
    $('minutes').disabled = running || saveLocked;
    $('resetTimer').disabled = !running || saveLocked;
    $('timerState').textContent = running ? 'CHAMBER ACTIVE' : focusCompleted ? 'MISSION COMPLETE' : 'STANDBY';
    $('timerHint').textContent = running ? '集中を継続せよ。完了まで記録中。' : focusCompleted ? '集中任務の完了を確認。報酬を獲得。' : '集中領域への接続を待機中。';
    $('timerRing').style.setProperty('--elapsed', (running ? Math.min(100, Math.max(0, (1 - remain / (s.focusMinutes * 60)) * 100)) : focusCompleted ? 100 : 0) + '%');
    document.querySelector('.focus-panel').classList.toggle('running', running);
    $('focusDot').hidden = !running;
  }
  $('minutes').onchange = () => { focusCompleted = false; s.focusMinutes = Number($('minutes').value); save(); updateTimer(); };
  $('start').onclick = () => {
    if (s.focusEnd != null) return;
    armAudio();
    focusCompleted = false;
    s.focusMinutes = Number($('minutes').value);
    s.focusEnd = Date.now() + s.focusMinutes * 60000;
    save(); updateTimer(); toast('集中領域への接続を確認。\n完了報酬 +40 XP / 知力 +2'); sound();
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
