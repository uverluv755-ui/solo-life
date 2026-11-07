'use strict';
window.SoloSeasonUI={init({C,$,el,updateSaved,refresh,toast}){
  const S=window.SoloSeason,T=window.SoloTraining,J=window.SoloJourney;
  let current,locked=false,busy=false,selected=null,identity='';
  for(const [key,label] of Object.entries(S.levels))$('seasonLevel').add(new Option(label,key));
  for(const [key,label] of Object.entries(S.splits))$('seasonSplit').add(new Option(label,key));
  const settings=()=>({level:$('seasonLevel').value,split:$('seasonSplit').value});
  async function commit(action,success){
    if(locked||busy)return;busy=true;
    $('seasonError').hidden=true;render(current,C.day(),locked);
    const ok=await updateSaved(action);busy=false;
    if(ok){selected=null;toast(success);}else{$('seasonError').textContent='保存できませんでした。別の画面での更新、日付、保存容量を確認してください。';$('seasonError').hidden=false;}
    refresh();
  }
  $('seasonStart').onclick=()=>{const choice=settings();commit(s=>S.start(s,choice,C.day(),crypto.randomUUID()),'66日の旅を始めました');};
  $('seasonConfigure').onclick=()=>{const choice=settings();commit(s=>S.configure(s,choice),'次の未達成メニューに設定を反映しました');};
  $('seasonToday').onclick=()=>{selected=null;refresh();};
  async function finish(kind){
    const v=S.view(current),today=C.day();if(!v)return;
    const expected={id:v.run.id,done:v.done};
    await commit(s=>today===C.day()&&S.finish(s,kind,expected,today)&&(kind!=='rest'||J.checkIn(s,'rest',today)),kind==='rest'?'回復の灯を記録。シーズンが1日進みました':'今日の一歩を記録。シーズンが1日進みました');
  }
  $('seasonComplete').onclick=()=>finish('training');$('seasonRest').onclick=()=>finish('rest');
  function render(s,today,saveLocked){
    current=s;locked=saveLocked;const v=S.view(s,today);
    const key=(v?.run.id||'')+':'+today;if(identity!==key){identity=key;selected=null;}
    $('seasonSetup').hidden=!!v;$('seasonContent').hidden=!v;
    $('seasonSettingsTitle').textContent=v?'メニュー設定 · 未達成の日に適用':'自分に合う旅を選ぶ';
    if(s.season){$('seasonLevel').value=s.season.level;$('seasonSplit').value=s.season.split;}
    $('seasonLevel').disabled=$('seasonSplit').disabled=locked||busy;
    $('seasonConfigure').hidden=!v;$('seasonConfigure').disabled=locked||busy;
    $('seasonStart').hidden=!!v&&!v.complete;$('seasonStart').textContent=v?'次の66日シーズンを開始':'66日の旅を始める';
    $('seasonStart').disabled=locked||busy||!!v&&(v.blocked||s.season.runs.length>=100);
    if(!v){$('seasonDay').textContent='66';$('seasonCaption').textContent='DAYS / あなたのペースで';return;}
    const number=selected||v.number,entry=v.run.entries[number-1],menu=S.plan(entry||s.season,number);
    const actionable=number===v.number&&!v.blocked&&!v.complete;
    const guide=S.guidance(s,menu,today),logged=T.rows(s).filter(r=>r.day===(entry?.day||today));
    $('seasonDay').textContent=String(number).padStart(2,'0');$('seasonCaption').textContent='DAY / 66 · SEASON '+s.season.runs.length;
    $('seasonPhase').textContent=menu.phase;$('seasonMenuTitle').textContent=menu.title;
    $('seasonMenuMeta').textContent=S.levels[(entry||s.season).level]+' · '+(menu.rest?'休養':menu.items.length+'種目 · '+(menu.light?'軽めの週':'目安メニュー'));
    $('seasonProgressText').textContent=v.done+' / 66 日を記録';$('seasonProgress').value=v.done;
    $('seasonState').textContent=v.complete?'SEASON COMPLETE · 暁の記録者':entry?(entry.kind==='rest'?'休養で達成':'取り組みを達成')+' · '+entry.day:actionable?'今日の一歩': 'メニューのプレビュー';
    $('seasonGuidance').textContent=entry?'達成の歩みは、実測を訂正しても残ります。':guide.text;
    $('seasonGuidance').classList.toggle('recovery',guide.rest);
    $('seasonItems').replaceChildren(...menu.items.map((e,i)=>{
      const row=el('article','season-exercise'),heading=el('div','season-exercise-head'),copy=el('div');
      copy.append(el('small','eyebrow',T.groups[e.group]+' / '+(e.mode==='bodyweight'?'自重':'外部負荷')),el('h4','',e.exercise));
      heading.append(el('span','season-index',String(i+1).padStart(2,'0')),copy);row.append(heading);
      const prescription=el('p','season-prescription');prescription.append(el('strong','',e.sets+' SETS'),' × ',el('strong','',e.reps+' 回'));row.append(prescription);
      const cmp=S.comparison(s,e,entry?.day||today),previous=cmp.previous;
      row.append(el('p','season-previous',previous?'前回 '+previous.day+' · '+previous.sets.map(x=>(e.mode==='bodyweight'?'自重':x.kg+'kg')+' × '+x.reps+'回').join(' / '):'前回：まだ記録がありません'));
      if(cmp.current.length){
        row.append(el('p','season-logged','この日 '+cmp.current.flatMap(r=>r.sets).length+'セット記録済み'));
        if(cmp.delta){const sign=n=>n>0?'+'+n:String(n);row.append(el('p','season-delta',(e.mode==='weighted'?'最大重量 '+sign(cmp.delta.kg)+'kg · ':'')+'合計回数 '+sign(cmp.delta.reps)+'回（前回比）'));}
      }
      const button=el('button','secondary','実際のセットを記録');button.disabled=locked||busy||!actionable;
      button.onclick=()=>window.dispatchEvent(new CustomEvent('solo-season-record',{detail:e}));row.append(button);return row;
    }));
    if(menu.rest)$('seasonItems').append(el('div','season-rest-card','✧  休むことも、物語の一部。\n運動を追加する必要はありません。'));
    $('seasonComplete').hidden=menu.rest||!actionable;$('seasonRest').hidden=!actionable;
    $('seasonComplete').disabled=locked||busy||!logged.length;$('seasonRest').disabled=locked||busy;
    $('seasonComplete').textContent='今日の取り組みを完了';$('seasonRest').textContent=menu.rest?'休養を記録して1日進む':'今日は休養に切り替える';
    $('seasonCompletionHint').textContent=v.complete?'66日分の歩みを保存しました。次のシーズンは翌日以降に開始できます。':v.doneToday?'今日の一歩は保存済み。次のDAYは明日開きます。':actionable?'1種目・1セットから完了できます。全種目の達成は必須ではありません。記録・完了・休養でXPは増えません。':'先の日は閲覧のみ。1日1歩、順番に進みます。';
    $('seasonToday').hidden=!selected;
    $('seasonMap').replaceChildren(...Array.from({length:66},(_,i)=>{
      const n=i+1,record=v.run.entries[i],p=S.plan(record||s.season,n),button=el('button','season-node'+(record?' earned':'')+(p.rest?' rest':''),String(n));
      button.setAttribute('aria-label','DAY '+n+' '+p.title+(record?' 達成済み':''));button.setAttribute('aria-pressed',String(n===number));
      if(n===v.number)button.setAttribute('aria-current','step');
      button.onclick=()=>{selected=n;refresh();$('seasonMenuTitle').scrollIntoView({block:'start',behavior:'instant'});};return button;
    }));
    $('seasonArchive').textContent=s.season.runs.length>1?'過去の完走：'+s.season.runs.slice(0,-1).map((r,i)=>'第'+(i+1)+'シーズン '+r.started+'〜'+r.entries.at(-1).day).join(' / '):'未記録の日が続いても進捗は減りません。66日は記録した日数です。';
  }
  return render;
}};
