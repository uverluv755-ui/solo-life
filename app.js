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
  const level = () => Math.floor(s.totalXp / 100) + 1;
  function rank() {
    const l = level();
    return l >= 50 ? 'S' : l >= 35 ? 'A' : l >= 25 ? 'B' : l >= 15 ? 'C' : l >= 5 ? 'D' : 'E';
  }
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
  function afterAward(result, before, focus = false) {
    if (!result) return;
    save(); render();
    let text = level() > before ? `LEVEL UP! LV ${level()} に到達！` : `${focus ? '集中ダンジョンクリア' : 'クエスト達成'}！ +${result.xp} XP`;
    if (result.badges.length) text += ` ／ 称号「${result.badges.join('」「')}」獲得`;
    toast(text);
  }
  function render() {
    const today = C.day(), l = level(), p = s.totalXp % 100;
    lastDay = today;
    $('level').textContent = l;
    $('rank').textContent = rank() + ' RANK / 覚醒者';
    $('xpfill').style.width = p + '%';
    $('xptext').textContent = p + ' / 100 XP';
    $('stats').replaceChildren(...Object.entries(C.names).map(([key, name]) => {
      const node = el('div', 'stat');
      node.append(el('span', '', name), el('b', '', s.stats[key]));
      return node;
    }));
    let completed = 0;
    $('quests').replaceChildren(...s.quests.map(q => {
      const done = C.isDone(s, q.id, today);
      if (done) completed++;
      const row = el('div', 'quest'), button = el('button', '', done ? '✓' : '○');
      button.disabled = done;
      button.setAttribute('aria-label', q.name + 'を達成');
      button.onclick = () => {
        const before = level();
        afterAward(C.completeQuest(s, q.id), before);
      };
      row.append(button, el('div', 'name' + (done ? ' done' : ''), q.name), el('div', 'xp', '+' + q.xp + ' XP'));
      return row;
    }));
    if (!s.quests.length) $('quests').append(el('p', 'note', '「クエスト」から新しい挑戦を追加しましょう。'));
    $('progress').textContent = `本日の達成 ${completed} / ${s.quests.length}`;
    const pv = C.progress(s, today), defeated = !!s.defeatedBosses[pv.start];
    $('streak').textContent = `🔥 連続達成 ${pv.streak}日`;
    $('bestStreak').textContent = `最長 ${pv.longest}日`;
    $('boss').textContent = defeated ? '🏆 継続の番人 — 討伐成功！' : '👾 週間ボス「継続の番人」';
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
      node.append(el('div', 'badge-name', (unlocked ? '🏅 ' : '🔒 ') + b.name), el('small', '', b.description));
      if (unlocked) node.append(el('small', 'earned', '獲得済み'));
      return node;
    }));
    $('badgeCount').textContent = `${Object.keys(s.achievements).length} / 5 獲得`;
    $('manage').replaceChildren(...s.quests.map(q => {
      const row = el('div', 'quest'), button = el('button', '', '×');
      button.setAttribute('aria-label', q.name + 'を削除');
      button.onclick = () => { s.quests = s.quests.filter(v => v.id !== q.id); save(); render(); };
      row.append(el('div', 'name', q.name + ' / ' + C.names[q.stat] + ' / ' + q.xp + ' XP'), button);
      return row;
    }));
    $('summary').textContent = `総獲得経験値 ${s.totalXp} XP / 現在レベル ${l} / ${rank()}ランク`;
    $('bossRecord').textContent = `週間ボス討伐 ${Object.keys(s.defeatedBosses).length}回`;
    $('history').replaceChildren(...(s.history.length ? s.history.slice(0, 20).map(h => el('div', 'history',
      `${new Date(h.at).toLocaleString('ja-JP')}　${h.label}　+${h.xp} XP`)) : [el('p', 'muted', 'まだ記録がありません。')]));
  }
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('[data-tab]').forEach(other => {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      });
      document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === button.dataset.tab));
      render(); window.scrollTo(0, 0);
    };
  });
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
    const before = level(), result = C.completeFocus(s);
    if (result) afterAward(result, before, true);
    const remain = s.focusEnd != null ? Math.max(0, Math.ceil((s.focusEnd - Date.now()) / 1000)) : Number($('minutes').value) * 60;
    $('timer').textContent = String(Math.floor(remain / 60)).padStart(2, '0') + ':' + String(remain % 60).padStart(2, '0');
    $('start').disabled = s.focusEnd != null;
    $('minutes').disabled = s.focusEnd != null;
  }
  $('minutes').onchange = () => { s.focusMinutes = Number($('minutes').value); save(); updateTimer(); };
  $('start').onclick = () => {
    if (s.focusEnd != null) return;
    s.focusMinutes = Number($('minutes').value);
    s.focusEnd = Date.now() + s.focusMinutes * 60000;
    save(); updateTimer();
  };
  $('resetTimer').onclick = () => { s.focusEnd = null; save(); updateTimer(); toast('集中を中断しました'); };
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
      s = restored; saveLocked = false; raw = null; showWarning('');
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
