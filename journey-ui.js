window.SoloJourneyUI = {
  init({C,$,el,updateSaved,refresh,toast}) {
    const J=window.SoloJourney;
    let current, locked=false, bodyEditing=null, busy=false, shown=10, dateDefault='';
    const error=(target,message)=>{ $(target).textContent=message; $(target).hidden=!message; };
    for(const [id,label] of Object.entries(C.names)) $('goalBossStat').add(new Option(label,id));
    for(const [id,m] of Object.entries(J.metrics)) $('bodyMetric').add(new Option(m.name+'（'+m.unit+'）',id));
    function bodyFields() {
      const metric=$('bodyMetric').value;
      $('bodyExerciseLabel').hidden=!['reps','load'].includes(metric);
      $('bodyExercise').required=['reps','load'].includes(metric);
      $('bodyValue').step=metric==='reps'?'1':'0.1';
      $('bodyValue').min=metric==='weight'?'0.1':'0';
      $('bodyValue').max=J.metrics[metric].max;
      $('bodyValueLabel').textContent='実測値（'+J.metrics[metric].unit+'）';
    }
    $('bodyMetric').onchange=bodyFields; bodyFields();
    function resetBody() {
      bodyEditing=null; $('bodyForm').reset(); $('bodyDate').value=C.day();
      $('bodySubmit').textContent='実測記録を保存'; $('bodyCancel').hidden=true; bodyFields(); error('bodyError','');
    }
    $('bodyCancel').onclick=resetBody;
    $('bodyMore').onclick=()=>{shown+=10; renderBody();};
    $('guildFatigue').onchange=async()=>{
      const value=$('guildFatigue').value;
      $('guildFatigue').disabled=true;
      const ok=await updateSaved(s=>J.checkIn(s,value));
      refresh(); if(ok) toast(value==='rest'?'今日は休養。積み重ねは残ります。':'今日の提案を調整しました');
    };
    async function plan(q) {
      let message='';
      const ok=await updateSaved(s=>{
        if((s.plans||[]).some(p=>p.name===q.name) || s.daily[C.day()]?.planLog?.some(p=>p.name===q.name) ||
          s.quests.some(p=>p.name===q.name) || C.boardQuests(s).some(p=>p.name===q.name)) {
          message='この行動は予定・クエスト・今日の達成にあります'; return false;
        }
        message=C.putPlan(s,{id:crypto.randomUUID(),name:q.name,start:C.day(),weekdays:[],stat:q.stat});
        return !message;
      });
      refresh(); toast(ok?'今日の予定に追加しました。実際に取り組んだあとに完了できます。':message||'保存できませんでした');
    }
    $('bodyForm').onsubmit=async event=>{
      event.preventDefault(); if(busy) return; busy=true; $('bodySubmit').disabled=true;
      const original=bodyEditing;
      const r={id:original?.id||crypto.randomUUID(),day:$('bodyDate').value,metric:$('bodyMetric').value,
        value:Number($('bodyValue').value),exercise:['reps','load'].includes($('bodyMetric').value)?$('bodyExercise').value.trim():''};
      let message='';
      const ok=await updateSaved(s=>{
        if(original && JSON.stringify(s.journey?.body.find(x=>x.id===original.id))!==JSON.stringify(original)) {
          message='別の画面で変更されています。編集をやめて開き直してください'; return false;
        }
        message=J.putBody(s,r,!!original); return !message;
      });
      busy=false;
      if(ok) {resetBody(); toast('実測記録を保存しました。ゲームXPは変わりません。');}
      else error('bodyError',message||'保存できませんでした。入力内容は残っています');
      refresh();
    };
    $('goalBossForm').onsubmit=async event=>{
      event.preventDefault(); if(busy) return; busy=true; $('goalBossSubmit').disabled=true;
      const b={id:crypto.randomUUID(),name:$('goalBossName').value.trim(),stat:$('goalBossStat').value,
        target:Number($('goalBossTarget').value),start:C.day(),days:[],paused:false};
      let message=''; const ok=await updateSaved(s=>{message=J.addBoss(s,b); return !message;}); busy=false;
      if(ok) {$('goalBossForm').reset(); toast('目標ボスが現れました。自分のペースで挑戦しましょう。');}
      error('goalBossError',ok?'':message||'保存できませんでした'); refresh();
    };
    function renderGuild() {
      const advice=J.recommend(current,C.day(),C.boardQuests(current));
      $('guildFatigue').value=advice.mode; $('guildFatigue').disabled=locked;
      $('guildMessage').textContent=advice.message;
      $('guildEvidence').textContent='目標：'+(C.habits.categories[current.habitGoal]||'バランス')+' · 直近7日：'+advice.active+'日活動';
      $('guildSuggestions').replaceChildren(...advice.quests.map(q=>{
        const row=el('div','guild-offer'), copy=el('div');
        copy.append(el('strong','',q.name),el('small','',q.reason+' · 約'+q.minutes+'分'));
        const add=el('button','', '予定に追加'); add.disabled=locked;
        add.setAttribute('aria-label',q.name+'を予定に追加'); add.onclick=()=>{add.disabled=true;void plan(q);};
        row.append(copy,add); return row;
      }));
      if(!advice.quests.length && advice.mode!=='rest') $('guildSuggestions').append(el('p','note','今は追加の候補がありません。予定や達成済みの行動を確認できます。'));
    }
    function renderBody() {
      const rows=[...(current.journey?.body||[])].reverse().sort((a,b)=>b.day.localeCompare(a.day));
      $('bodyCount').textContent=rows.length+'件';
      $('bodySubmit').disabled=locked||busy;
      if(dateDefault!==C.day()) {
        if(!bodyEditing && (!$('bodyDate').value || $('bodyDate').value===dateDefault)) $('bodyDate').value=C.day();
        dateDefault=C.day(); $('bodyDate').max=dateDefault;
      }
      $('bodyList').replaceChildren(...rows.slice(0,shown).map(r=>{
        const row=el('div','body-row'), copy=el('div');
        const m=J.metrics[r.metric]; copy.append(el('strong','',r.exercise||m.name),el('small','',r.day+' · '+r.value+' '+m.unit));
        const edit=el('button','','編集'); edit.disabled=locked; edit.setAttribute('aria-label',r.day+' '+(r.exercise||m.name)+'を編集');
        edit.onclick=()=>{bodyEditing=r; $('bodyDate').value=r.day; $('bodyMetric').value=r.metric; $('bodyExercise').value=r.exercise; $('bodyValue').value=r.value;
          bodyFields(); $('bodySubmit').textContent='変更を保存'; $('bodyCancel').hidden=false; $('bodyValue').focus();};
        const remove=el('button','','削除'); remove.disabled=locked; remove.setAttribute('aria-label',r.day+' '+(r.exercise||m.name)+'を削除');
        remove.onclick=async()=>{
          if(!confirm('この実測記録を削除しますか？ゲームの履歴とXPは変わりません。')) return;
          const ok=await updateSaved(s=>{if(!s.journey?.body.some(x=>x.id===r.id)) return false; s.journey.body=s.journey.body.filter(x=>x.id!==r.id);return true;});
          if(ok && bodyEditing?.id===r.id) resetBody(); refresh();
        };
        row.append(copy,edit,remove); return row;
      }));
      if(!rows.length) $('bodyList').append(el('p','note','実際に測った値を残しましょう。おすすめの回数や時間は自動転記しません。'));
      $('bodyMore').hidden=rows.length<=shown;
      const groups=new Map();
      for(const r of rows) {const key=r.metric+'|'+r.exercise; if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(r);}
      $('bodyTrends').replaceChildren(...[...groups.values()].slice(0,12).map(list=>{
        // Compare distinct measurement dates, never infer a physical effect from XP.
        const latest=list[0], prior=list.find(r=>r.day<latest.day), m=J.metrics[latest.metric];
        const card=el('div','body-trend');
        card.append(el('b','',latest.exercise||m.name),el('span','',latest.value+' '+m.unit));
        card.append(el('small','',prior?prior.day+'比 '+(latest.value-prior.value>=0?'+':'')+Number((latest.value-prior.value).toFixed(2))+' '+m.unit:'別の日の記録を追加すると変化を表示'));
        return card;
      }));
    }
    function renderBosses() {
      $('goalBossSubmit').disabled=locked||busy;
      const bosses=current.journey?.bosses||[];
      $('goalBossList').replaceChildren(...bosses.map(b=>{
        const complete=b.days.length>=b.target;
        const card=el('article','goal-boss'+(complete?' defeated':''));
        card.append(el('span','eyebrow',complete?'CONQUERED':b.paused?'RESTING':'GOAL BOSS'),el('h3','',b.name));
        const bar=el('div','bar'), fill=el('div','fill'); fill.style.width=(b.days.length/b.target*100)+'%'; bar.append(fill);
        bar.setAttribute('role','progressbar'); bar.setAttribute('aria-label',b.name+'の討伐進捗');
        bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',b.target);bar.setAttribute('aria-valuenow',b.days.length);
        card.append(el('p','',b.days.length+' / '+b.target+'日 · '+(b.stat==='any'?'すべてのクエスト':C.names[b.stat]+'クエスト')),bar,
          el('small','',complete?'討伐の証を獲得。記録はずっと残ります。':'残りHP '+(b.target-b.days.length)+' · 1日1ダメージ・期限なし'));
        if(!complete) {const button=el('button','secondary',b.paused?'再開する':'休戦する');button.disabled=locked;
          button.onclick=async()=>{button.disabled=true;const ok=await updateSaved(s=>J.toggleBoss(s,b.id));refresh();if(!ok)toast('同時に挑戦できる目標は3つです');};card.append(button);}
        return card;
      }));
      if(!bosses.length) $('goalBossList').append(el('p','note','最初のボスは、あなたの目標から生まれます。'));
    }
    const avatar=$('heroAvatar').cloneNode(true); avatar.removeAttribute('id');
    // Keep an independent gradient when the home screen is hidden.
    avatar.querySelector('linearGradient').id='evolutionArmor';
    avatar.querySelector('.hero-body').style.fill='url(#evolutionArmor)';
    $('evolutionArt').append(avatar);
    function renderEvolution() {
      const e=J.evolution(current); avatar.dataset.stage=e.current.id;
      $('evolutionName').textContent=e.current.name;
      $('evolutionNext').textContent=e.next?'次は Lv.'+e.next.level+'「'+e.next.name+'」 · あと'+e.remaining+' XP':'星冠に到達。これからの一歩も、あなたの光に。';
      $('evolutionPath').replaceChildren(...J.stages.map(stage=>{
        const reached=stage.level<=C.growth(current.totalXp).level, item=el('li',reached?'reached':'');
        if(stage.id===e.current.id)item.setAttribute('aria-current','step');
        item.append(el('b','','Lv.'+stage.level),el('span','',stage.name));return item;
      }));
    }
    function renderSkills() {
      const learned=current.journey?.skills||[];
      $('skillCount').textContent=learned.length+' / '+J.skills.length+' 習得';
      $('skillTree').replaceChildren(...Object.entries(C.names).map(([stat,label])=>{
        const branch=el('section','skill-branch');branch.append(el('h3','',label+' · '+current.stats[stat]));
        for(const k of J.skills.filter(k=>k.stat===stat)) {
          const owned=learned.includes(k.id), ready=current.stats[stat]>=k.threshold && (!k.parent||learned.includes(k.parent));
          const node=el('div','skill-node'+(owned?' learned':''));node.dataset.skill=k.id;
          node.append(el('b','',k.name),el('small','',(owned?'習得済み':label+' '+k.threshold+'で解放')+(k.parent?' · 前の紋章が必要':'')));
          const button=el('button','',owned?'専用の候補を予定に追加':ready?'習得する':'未解放');button.disabled=locked||(!owned&&!ready);
          const q=C.habits.byKey.get(k.quest);
          if(owned) {
            node.append(el('p','note',q.name+' · 任意の行動'));
            const listed=(current.plans||[]).some(p=>p.name===q.name)||!!current.daily[C.day()]?.planLog?.some(p=>p.name===q.name)||
              current.quests.some(p=>p.name===q.name)||C.boardQuests(current).some(p=>p.name===q.name);
            button.disabled ||= listed; if(listed) button.textContent='予定・クエストに登録済み';
          }
          button.onclick=async()=>{button.disabled=true;if(owned) return plan(q); const ok=await updateSaved(s=>J.learn(s,k.id));refresh();if(ok)toast('紋章「'+k.name+'」を習得しました');};
          node.append(button);branch.append(node);
        }
        return branch;
      }));
    }
    return function renderJourney(s,today,saveLocked) {
      current=s;locked=saveLocked;renderGuild();renderBody();renderBosses();renderEvolution();renderSkills();
    };
  }
};
