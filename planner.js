window.SoloPlanner = {
  init({C, $, el, statIcon, updateSaved, recordReward, refresh, toast}) {
    if (!$('planner')) return;
    const form = $('planForm'), options = $('planOptions'), manager = $('planManager');
    const weekdays = [1, 2, 3, 4, 5, 6, 0], labels = '日月火水木金土';
    const shortDate = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));
    let editing = null, defaultDate = '', busy = false;
    for (const [key, label] of Object.entries(C.names)) $('planStat').append(new Option(label, key));
    $('planStat').value = 'discipline';
    for (const day of weekdays) {
      const button = el('button', '', labels[day]);
      button.type = 'button';
      button.value = day;
      button.setAttribute('aria-label', labels[day] + '曜日');
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
      $('planDays').append(button);
    }
    function setDays(selected) {
      for (const button of $('planDays').children) button.setAttribute('aria-pressed', String(selected.includes(Number(button.value))));
    }
    function showError(message) {
      $('planError').textContent = message;
      $('planError').hidden = !message;
    }
    function resetForm() {
      editing = null;
      form.reset();
      defaultDate = C.day();
      $('planStart').value = defaultDate;
      $('planStat').value = 'discipline';
      setDays([]);
      options.open = false;
      $('planSubmit').textContent = '追加';
      $('planCancel').hidden = true;
      showError('');
    }
    function edit(p) {
      editing = p;
      $('planName').value = p.name;
      $('planStart').value = p.start;
      $('planStat').value = p.stat;
      setDays(p.weekdays);
      $('planSubmit').textContent = '保存';
      $('planCancel').hidden = false;
      showError('');
      options.open = true;
      manager.open = false;
      $('planName').focus();
    }
    function schedule(p, today) {
      if (!p.weekdays.length) return p.start === today ? '今日の用事' :
        shortDate(p.start) + (p.start < today ? 'から繰り越し' : 'の予定');
      const repeat = p.weekdays.length === 7 ? '毎日' : '毎週 ' + weekdays.filter(d => p.weekdays.includes(d)).map(d => labels[d]).join('・');
      return p.start > today ? shortDate(p.start) + 'から · ' + repeat : repeat;
    }
    function planRow(p, detail) {
      const row = el('div', 'plan-row'), name = el('div', 'name', p.name);
      name.append(el('small', '', detail));
      row.append(statIcon(p.stat), name);
      return row;
    }
    async function remove(p) {
      if (!window.confirm('「' + p.name + '」を予定から削除しますか？')) return;
      const removed = await updateSaved(data => {
        if (!data.plans?.some(item => item.id === p.id)) return false;
        data.plans = data.plans.filter(item => item.id !== p.id);
        return true;
      });
      if (removed && editing?.id === p.id) resetForm();
      refresh();
      if (removed) toast('予定を削除しました');
    }
    $('planCancel').onclick = resetForm;
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      const name = $('planName').value.trim();
      if (!name) { showError('予定の名前を入力してください'); $('planName').focus(); return; }
      const selected = [...$('planDays').children].filter(b => b.getAttribute('aria-pressed') === 'true');
      const p = {id: editing?.id || crypto.randomUUID(), name, start:$('planStart').value || C.day(),
        weekdays:selected.map(b => Number(b.value)), stat:$('planStat').value};
      const original = editing;
      let error = '';
      busy = true;
      $('planSubmit').disabled = true;
      const saved = await updateSaved(data => {
        if (original && JSON.stringify(data.plans?.find(item => item.id === p.id)) !== JSON.stringify(original)) {
          error = '予定が変更されています。編集をやめて、もう一度開いてください';
        } else error = C.putPlan(data, p, !!original);
        return !error;
      });
      busy = false;
      if (saved) {
        resetForm();
        $('planName').blur();
        if (!C.duePlan(p, C.day())) manager.open = true;
        toast(original ? '予定を更新しました' : '予定を追加しました');
      } else showError(error || '保存できませんでした。入力した予定はこの欄に残っています');
      refresh();
    };
    return function renderPlans(s, today, locked) {
      if (!editing && defaultDate !== today) {
        if (!$('planStart').value || $('planStart').value === defaultDate) $('planStart').value = today;
        defaultDate = today;
      }
      const {pending, done} = C.todayPlans(s, today);
      const total = pending.length + done.length;
      $('planCount').textContent = total ? done.length + ' / ' + total + ' 完了' : '';
      $('planList').replaceChildren(...pending.map(p => {
        const row = planRow(p, schedule(p, today) + ' · +20 XP');
        const button = el('button', '', '完了');
        button.setAttribute('aria-label', '完了：' + p.name);
        button.disabled = locked || C.difficulty.claimed(s,p,today);
        if(C.difficulty.claimed(s,p,today)) button.textContent='本日報酬済み';
        button.onclick = () => recordReward(button, data => C.completePlan(data, p.id, today));
        row.append(button);
        return row;
      }), ...done.map(p => {
        const row = planRow(p, C.names[p.stat] + ' +1 · +20 XP');
        row.append(el('span', 'done-mark', '✓ 完了'));
        return row;
      }));
      const plans = s.plans || [];
      manager.hidden = !plans.length;
      $('planManageLabel').textContent = '予定を管理（' + plans.length + '件）';
      $('planManageList').replaceChildren(...plans.map(p => {
        const row = planRow(p, schedule(p, today) + ' · ' + C.names[p.stat]);
        const change = el('button', '', '編集'), del = el('button', '', '削除');
        change.type = del.type = 'button';
        change.disabled = del.disabled = locked;
        change.setAttribute('aria-label', '編集：' + p.name);
        del.setAttribute('aria-label', '削除：' + p.name);
        change.onclick = () => edit(p);
        del.onclick = () => remove(p);
        row.append(change, del);
        return row;
      }));
      $('planSubmit').disabled = busy || locked;
    };
  }
};
