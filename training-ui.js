'use strict';
window.SoloTrainingUI={
  init({C,$,el,updateSaved,refresh,toast}){
    const T=window.SoloTraining,J=window.SoloJourney;
    let current,locked=false,busy=false,editing=null,limit=10,defaultDay=C.day();
    const form=$('workoutForm'),dialog=$('workoutDialog');
    const message=text=>{ $('workoutError').textContent=text;$('workoutError').hidden=!text; };
    const milestone=(before,after)=>[
      after.defeated>before.defeated?'灰霧の番人を討伐！ 第'+after.chapter+'章が開きました。':'',
      after.current.stage!==before.current.stage?'称号「'+after.current.name+'」を獲得。':''
    ].filter(Boolean).join(' ');
    function celebrate(text){
      $('trainingHero').classList.remove('training-spark');void $('trainingHero').offsetWidth;$('trainingHero').classList.add('training-spark');
      $('trainingReceipt').hidden=false;$('trainingReceipt').textContent=text;
    }
    for(const [id,label] of Object.entries(T.groups)){
      $('workoutGroup').add(new Option(label,id));$('trainingFilter').add(new Option(label,id));
    }
    for(const [id,label] of Object.entries(T.goals))$('trainingGoal').add(new Option(label,id));
    function names(){
      const group=$('workoutGroup').value;
      const list=[...new Set([...T.exercises[group],...T.rows(current||{}).filter(r=>r.group===group).map(r=>r.exercise)])];
      $('exerciseNames').replaceChildren(...list.map(n=>{const o=el('option');o.value=n;return o;}));
    }
    function renumber(){
      [...$('setRows').children].forEach((r,i)=>{
        r.querySelector('b').textContent=String(i+1);
        r.querySelector('.set-kg').setAttribute('aria-label',`${i+1}セット目の重量 kg`);
        r.querySelector('.set-reps').setAttribute('aria-label',`${i+1}セット目の回数`);
        r.querySelector('button').setAttribute('aria-label',`${i+1}セット目を削除`);
        r.querySelector('button').disabled=busy||$('setRows').children.length===1;
      });$('addSet').disabled=busy||$('setRows').children.length>=20;
    }
    function addSet(value={kg:'',reps:''}){
      if($('setRows').children.length>=20)return;
      const row=el('div','set-row'),kg=el('input','set-kg'),reps=el('input','set-reps'),remove=el('button','set-remove','×');
      kg.type=reps.type='number';kg.inputMode='decimal';reps.inputMode='numeric';
      kg.min='0';kg.max='1000';kg.step='0.01';reps.min='1';reps.max='500';reps.step='1';kg.required=reps.required=true;
      kg.value=value.kg;reps.value=value.reps;kg.placeholder='0';reps.placeholder='回数';
      kg.disabled=$('workoutMode').value==='bodyweight';if(kg.disabled)kg.value=0;
      remove.type='button';remove.onclick=()=>{row.remove();renumber();};row.append(el('b'),kg,reps,remove);$('setRows').append(row);renumber();
    }
    $('addSet').onclick=()=>{const last=$('setRows').lastElementChild;addSet({kg:last?.querySelector('.set-kg').value??'',reps:last?.querySelector('.set-reps').value??''});};
    $('workoutMode').onchange=()=>{for(const input of document.querySelectorAll('.set-kg')){input.disabled=$('workoutMode').value==='bodyweight';if(input.disabled)input.value=0;}};
    $('workoutGroup').onchange=names;
    function open(group=null,record=null){
      if(locked)return;editing=record?structuredClone(record):null;form.reset();message('');
      $('workoutDialogTitle').textContent=record?'トレーニングを編集':'今日のトレーニング';
      $('workoutDate').value=record?.day||C.day();$('workoutDate').max=C.day();
      $('workoutGroup').value=record?.group||group||'chest';$('workoutExercise').value=record?.exercise||'';
      $('workoutMode').value=record?.mode||'weighted';$('workoutFatigue').value=record?.fatigue||'moderate';
      $('setRows').replaceChildren();for(const set of record?.sets||[{kg:'',reps:''}])addSet(set);names();
      $('workoutSubmit').textContent=record?'変更を保存':'記録を保存';$('copyLast').disabled=busy;
      dialog.showModal();$('workoutExercise').focus();
    }
    $('startWorkout').onclick=()=>open();
    window.addEventListener('solo-season-record',event=>{
      const e=event.detail;if(locked||busy||!e)return;open(e.group);
      $('workoutExercise').value=e.exercise;$('workoutMode').value=e.mode;
      $('setRows').replaceChildren();for(let i=0;i<e.sets;i++)addSet({kg:e.mode==='bodyweight'?0:'',reps:''});
      message('目安 '+e.sets+'セット × '+e.reps+'回。実際に行った重量と回数を入力してください。セットは減らせます。');
    });
    $('guildWorkout').onclick=()=>open(T.advice(current).group);
    $('closeWorkout').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    $('copyLast').onclick=()=>{
      const group=$('workoutGroup').value,name=$('workoutExercise').value.trim().normalize('NFKC').toLowerCase();
      const previous=[...T.rows(current)].filter(r=>r.group===group&&r.day<=$('workoutDate').value&&(!name||r.exercise.trim().normalize('NFKC').toLowerCase()===name)&&r.id!==editing?.id).sort((a,b)=>b.day.localeCompare(a.day)).at(0);
      if(!previous){message('この部位・種目には前回の記録がありません');return;}
      $('workoutExercise').value=previous.exercise;$('workoutMode').value=previous.mode;$('setRows').replaceChildren();previous.sets.forEach(addSet);
      message('前回（'+previous.day+'）を入力しました。今日実際に行った内容に直して保存してください。');
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||locked)return;busy=true;
      const record={id:editing?.id||crypto.randomUUID(),day:$('workoutDate').value,group:$('workoutGroup').value,exercise:$('workoutExercise').value.trim(),mode:$('workoutMode').value,fatigue:$('workoutFatigue').value,
        sets:[...$('setRows').children].map(row=>({kg:Number(row.querySelector('.set-kg').value),reps:Number(row.querySelector('.set-reps').value)}))};
      const original=editing;let error='',personalBest=false,first=false,reward='';
      for(const control of form.elements)control.disabled=true;$('closeWorkout').disabled=true;
      const ok=await updateSaved(s=>{
        const matches=T.rows(s).filter(r=>T.key(r)===T.key(record)&&r.id!==record.id);
        const previous=T.best(matches),now=T.best([record]);first=!matches.length;
        personalBest=matches.length>0&&(record.mode==='bodyweight'?now.reps>previous.reps:now.kg>previous.kg||(now.kg===previous.kg&&now.atWeight>previous.atWeight));
        const previousAdventure=T.adventure(s);error=T.put(s,record,original);
        if(!error)reward=milestone(previousAdventure,T.adventure(s));return !error;
      });
      busy=false;for(const control of form.elements)control.disabled=false;$('closeWorkout').disabled=false;$('workoutMode').onchange();renumber();
      refresh();
      if(ok){dialog.close();editing=null;const a=T.adventure(current);
        celebrate((personalBest?'自己ベスト更新！ ':original?'記録を更新しました。 ':first?'最初の記録を刻みました。 ':'記録を保存しました。 ')+reward+T.groups[record.group]+' · '+record.sets.length+'セット / '+a.current.name+' · 冒険'+a.days+'日。実測の保存によるXP加算はありません。');
        toast(reward||(personalBest?'自己ベスト更新！ 実測記録を保存しました':'トレーニングを保存しました'));
      }else message(error||'保存できませんでした。入力内容は残っています');
    };
    $('restTraining').onclick=async()=>{
      if(busy||locked)return;busy=true;$('restTraining').disabled=true;
      let reward='';const ok=await updateSaved(s=>{const before=T.adventure(s);if(!T.rest(s))return false;reward=milestone(before,T.adventure(s));return J.checkIn(s,'rest');});busy=false;refresh();
      if(ok){celebrate('回復の灯をともしました。'+reward+'冒険'+T.adventure(current).days+'日。休養も遠征の一歩です。XPは変わりません。');toast(reward||'休養を記録。回復も遠征の一歩です。');}
    };
    $('trainingGoal').onchange=async()=>{const goal=$('trainingGoal').value;$('trainingGoal').disabled=true;await updateSaved(s=>{if(!Object.hasOwn(T.goals,goal))return false;T.state(s).goal=goal;return true;});refresh();};
    const showRecords=()=>{document.querySelector('[data-tab="records"]').click();$('trainingRecords').scrollIntoView({block:'start'});};
    $('viewTraining').onclick=showRecords;
    $('trainingFilter').onchange=()=>{limit=10;renderRecords();};$('trainingMore').onclick=()=>{limit+=10;renderRecords();};
    function renderRecords(){
      const filter=$('trainingFilter').value,list=[...T.rows(current)].reverse().filter(r=>filter==='all'||r.group===filter).sort((a,b)=>b.day.localeCompare(a.day));
      $('trainingRecordCount').textContent=list.length+'件';
      $('personalBests').replaceChildren(...T.personalBests(current,filter).map(pb=>{
        const card=el('article','personal-best');card.append(el('small','eyebrow',T.groups[pb.group]+' / '+(pb.mode==='bodyweight'?'自重':'外部負荷')),el('h3','',pb.exercise));
        card.append(el('strong','pb-value',pb.mode==='bodyweight'?pb.reps+' 回':pb.kg+' kg × '+pb.atWeight+' 回'));
        if(pb.mode==='weighted')card.append(el('small','note','最高重量時の回数 · 最大回数 '+pb.reps+'回'));
        const chart=el('div','pb-trend'),max=Math.max(1,...pb.trend.map(p=>pb.mode==='weighted'?p.kg:p.reps));
        for(const point of pb.trend){const value=pb.mode==='weighted'?point.kg:point.reps,col=el('div','pb-point'),bar=el('i');bar.style.height=(value/max*45+2)+'px';col.append(el('b','',String(value)),bar,el('small','',point.day.slice(5).replace('-','/')));chart.append(col);}
        chart.setAttribute('aria-label','直近6記録日の'+(pb.mode==='weighted'?'最大重量 kg':'最大回数'));
        card.append(chart,el('small','note',pb.mode==='weighted'?'日ごとの最大重量（kg）':'日ごとの最大回数'));return card;
      }));
      if(!list.length)$('personalBests').append(el('p','note','最初の記録から、あなたの自己ベストが始まります。'));
      $('trainingHistory').replaceChildren(...list.slice(0,limit).map(r=>{
        const row=el('article','training-log'),copy=el('div');copy.append(el('small','',r.day+' · '+T.groups[r.group]),el('h3','',r.exercise),el('p','',r.sets.map((s,i)=>(i+1)+': '+(r.mode==='bodyweight'?'自重':s.kg+'kg')+' × '+s.reps+'回').join(' / ')),el('small','',{'easy':'余裕あり','moderate':'ちょうどよい','hard':'疲れが強い'}[r.fatigue]));
        const actions=el('div','training-log-actions'),edit=el('button','secondary','編集'),remove=el('button','text-button','削除');edit.disabled=remove.disabled=locked;
        edit.setAttribute('aria-label',r.day+' '+r.exercise+'を編集');remove.setAttribute('aria-label',r.day+' '+r.exercise+'を削除');
        edit.onclick=()=>open(null,r);remove.onclick=async()=>{if(!confirm('この実測記録を削除しますか？獲得済みの称号・遠征の歩み・XPは保持します。'))return;remove.disabled=true;const ok=await updateSaved(s=>T.remove(s,r));refresh();if(!ok)toast('記録が変更されています。開き直してください');};
        actions.append(edit,remove);row.append(copy,actions);return row;
      }));$('trainingMore').hidden=list.length<=limit;
    }
    function render(s,today,saveLocked){
      current=s;locked=saveLocked;
      const a=T.adventure(s,today),sum=T.summary(s,today),advice=T.advice(s,today),rests=s.training?.restDays||[];
      $('trainingHero').dataset.forge=a.current.stage;
      $('forgeTitle').textContent=a.current.name;$('forgeNext').textContent=a.next?'あと'+(a.next.at-a.days)+'日で「'+a.next.name+'」':'星冠の装具を獲得。あなたの歩みは続く。';
      $('trainingLevel').textContent='Lv.'+C.growth(s.totalXp).level;$('trainingXp').textContent=s.totalXp.toLocaleString('ja-JP')+' XP · ゲーム内の成長';
      $('forgeDays').textContent=a.days+'日';$('realDays').textContent=sum.days+'日';$('realSets').textContent=sum.sets+'セット';
      $('forgeStatus').textContent=rests.includes(today)?'今日は回復の灯をともした':a.today?'今日の一歩を刻みました':'今日は、どんな一歩にする？';
      $('startWorkout').disabled=locked;$('restTraining').disabled=locked||busy||rests.includes(today);
      $('restTraining').textContent=rests.includes(today)?'休養を記録済み':'今日は休養を記録';
      $('trainingGoal').value=s.training?.goal||'muscle';$('trainingGoal').disabled=locked;
      $('trainingAdviceTitle').textContent=advice.title;$('trainingAdviceText').textContent=advice.text;$('trainingEvidence').textContent=advice.evidence;
      $('guildWorkout').hidden=!advice.group;$('guildWorkout').disabled=locked;
      $('guildWorkout').textContent=advice.group?T.groups[advice.group]+'の記録を開く':'記録を開く';
      $('forgeBossName').textContent='第'+a.chapter+'章 · 灰霧の番人';$('forgeBossCount').textContent=a.damage+' / 6 歩';
      $('forgeBossFill').style.width=(a.damage/6*100)+'%';$('forgeBossBar').setAttribute('aria-valuenow',a.damage);
      $('forgeBossHint').textContent=(a.defeated?a.defeated+'体討伐済み · ':'')+'あと'+(6-a.damage)+'日で霧が晴れる。期限なし。';
      $('forgeTitles').replaceChildren(...a.milestones.map(m=>{const item=el('span',a.days>=m.at?'earned':'',m.name+' · '+m.at+'日');return item;}));
      $('muscleMap').replaceChildren(...sum.groups.map(g=>{
        const b=el('button','muscle-tile'+(g.last?' trained':''));b.setAttribute('aria-label',g.label+'の履歴を見る');
        b.append(el('strong','',g.label),el('b','',g.sets+' set'),el('small','',g.last?'前回 '+g.last.slice(5).replace('-','/'):'記録から始めよう'));
        b.onclick=()=>{$('trainingFilter').value=g.id;limit=10;renderRecords();showRecords();};return b;
      }));
      const used=new Set(T.rows(s).map(r=>r.group));document.querySelectorAll('[data-armor]').forEach(p=>p.classList.toggle('forged',used.has(p.dataset.armor)));
      if(defaultDay!==today){defaultDay=today;$('workoutDate').max=today;}
      renderRecords();
    }
    return render;
  }
};
