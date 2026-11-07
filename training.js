(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.SoloTraining=factory();
})(globalThis,function(){
  'use strict';
  const groups={chest:'胸',back:'背中',legs:'脚',shoulders:'肩',arms:'腕',core:'体幹'};
  const goals={muscle:'筋肉を育てる',strength:'扱える重さを伸ばす',habit:'無理なく続ける'};
  const exercises={chest:['ベンチプレス','ダンベルプレス','腕立て伏せ'],back:['ラットプルダウン','ダンベルロウ','懸垂'],legs:['スクワット','レッグプレス','ランジ'],shoulders:['ショルダープレス','サイドレイズ'],arms:['アームカール','トライセプスエクステンション'],core:['クランチ','レッグレイズ']};
  const day=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const shift=(d,n)=>{const t=new Date(d+'T12:00:00');t.setDate(t.getDate()+n);return day(t);};
  const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&day(new Date(d+'T12:00:00'))===d;
  const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
  const unique=a=>new Set(a).size===a.length;
  function validSession(r){
    return obj(r)&&id(r.id)&&validDay(r.day)&&Object.hasOwn(groups,r.group)&&typeof r.exercise==='string'&&r.exercise.trim().length>0&&r.exercise.length<=60&&
      ['weighted','bodyweight'].includes(r.mode)&&['easy','moderate','hard'].includes(r.fatigue)&&Array.isArray(r.sets)&&r.sets.length>=1&&r.sets.length<=20&&
      r.sets.every(s=>obj(s)&&Number.isFinite(s.kg)&&s.kg>=0&&s.kg<=1000&&(r.mode!=='bodyweight'||s.kg===0)&&Number.isInteger(s.reps)&&s.reps>=1&&s.reps<=500);
  }
  function valid(t){
    return obj(t)&&t.version===1&&Object.hasOwn(goals,t.goal)&&Array.isArray(t.sessions)&&t.sessions.length<=5000&&t.sessions.every(validSession)&&unique(t.sessions.map(r=>r.id))&&
      Array.isArray(t.careDays)&&t.careDays.length<=20000&&t.careDays.every(validDay)&&unique(t.careDays)&&
      Array.isArray(t.restDays)&&t.restDays.every(d=>validDay(d)&&t.careDays.includes(d))&&unique(t.restDays);
  }
  const state=s=>s.training||={version:1,goal:'muscle',sessions:[],careDays:[],restDays:[]};
  const rows=s=>s.training?.sessions||[];
  const care=(s,d)=>{const t=state(s);if(!t.careDays.includes(d))t.careDays.push(d);};
  function put(s,r,original=null,today=day()){
    if(!validSession(r)||r.day>today) return '日付・種目・重量・回数を確認してください';
    const records=rows(s), exists=records.find(x=>x.id===r.id);
    if(original?JSON.stringify(exists)!==JSON.stringify(original):!!exists) return '別の画面で変更されています。開き直してください';
    if(!original&&records.length>=5000) return '記録が5000件に達しました。バックアップ後に整理してください';
    if(!(s.training?.careDays||[]).includes(r.day)&&(s.training?.careDays.length||0)>=20000) return '冒険日数の保存上限です';
    state(s).sessions=original?records.map(x=>x.id===r.id?r:x):[...records,r];care(s,r.day);return '';
  }
  function remove(s,original){
    if(JSON.stringify(rows(s).find(x=>x.id===original.id))!==JSON.stringify(original))return false;
    state(s).sessions=rows(s).filter(x=>x.id!==original.id);return true;
  }
  function rest(s,today=day()){
    if(!validDay(today)||((s.training?.careDays.length||0)>=20000&&!s.training.careDays.includes(today)))return false;
    care(s,today);const t=state(s);if(!t.restDays.includes(today))t.restDays.push(today);return true;
  }
  const key=r=>r.group+'|'+r.mode+'|'+r.exercise.trim().normalize('NFKC').toLowerCase();
  const best=rs=>{
    const sets=rs.flatMap(r=>r.sets),kg=Math.max(0,...sets.map(s=>s.kg));
    return {kg,reps:Math.max(0,...sets.map(s=>s.reps)),atWeight:Math.max(0,...sets.filter(s=>s.kg===kg).map(s=>s.reps))};
  };
  function personalBests(s,group='all'){
    const map=new Map();for(const r of rows(s).filter(r=>group==='all'||r.group===group)){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r);}
    return [...map.values()].map(rs=>{
      rs.sort((a,b)=>a.day.localeCompare(b.day));const r=rs.at(-1), dates=[...new Set(rs.map(r=>r.day))];
      return {key:key(r),exercise:r.exercise,group:r.group,mode:r.mode,...best(rs),trend:dates.slice(-6).map(d=>({day:d,...best(rs.filter(x=>x.day===d))}))};
    });
  }
  function summary(s,today=day()){
    const list=rows(s).filter(r=>r.day<=today), recent=list.filter(r=>r.day>=shift(today,-6));
    return {days:new Set(recent.map(r=>r.day)).size,sets:recent.reduce((n,r)=>n+r.sets.length,0),
      groups:Object.entries(groups).map(([id,label])=>{const rr=list.filter(r=>r.group===id).sort((a,b)=>b.day.localeCompare(a.day));return {id,label,last:rr[0]?.day||null,sets:recent.filter(r=>r.group===id).reduce((n,r)=>n+r.sets.length,0)};})};
  }
  function adventure(s,today=day()){
    const days=(s.training?.careDays||[]).filter(d=>d<=today).length;
    const milestones=[{at:0,name:'灯火の鍛冶師',stage:'ember'},{at:3,name:'蒼鉄の担い手',stage:'steel'},{at:6,name:'暁の守護者',stage:'dawn'},{at:12,name:'星冠の鍛錬者',stage:'star'}];
    const current=milestones.filter(x=>x.at<=days).at(-1),next=milestones.find(x=>x.at>days);
    // Persistent cosmetic ledger: correcting measurements cannot revoke earned cosmetics.
    return {days,current,next,milestones,chapter:Math.floor(days/6)+1,damage:days%6,defeated:Math.floor(days/6),today:(s.training?.careDays||[]).includes(today)};
  }
  function advice(s,today=day()){
    const mode=s.journey?.checkIn?.day===today?s.journey.checkIn.fatigue:'normal',goal=s.training?.goal||'muscle';
    const recent=rows(s).filter(r=>r.day>=shift(today,-1)&&r.day<=today),recentGroups=[...new Set(recent.map(r=>r.group))];
    const hard=recent.some(r=>r.fatigue==='hard'),resting=mode==='rest'||mode==='tired'||hard;
    if(resting)return {group:null,mode:'rest',title:'回復も、次の強さになる。',text:mode==='rest'?'今日は休養を選択中。記録した休養も遠征の一歩になります。':hard?'直近の記録に「疲れが強い」があります。今日は回復を優先する選択肢を。':'疲れが強い日は、休養を優先しましょう。',evidence:recentGroups.length?'直近2日：'+recentGroups.map(g=>groups[g]).join('・'):'今日の体調から提案'};
    const candidate=summary(s,today).groups.filter(g=>!recentGroups.includes(g.id)).sort((a,b)=>(a.last||'').localeCompare(b.last||'')||a.id.localeCompare(b.id))[0];
    if(!candidate)return {group:null,mode:'rest',title:'今日は回復の時間を。',text:'直近2日ですべての部位を記録しています。休んでも遠征の進捗は失われません。',evidence:'直近2日の部位記録から提案'};
    const notes={muscle:'前回のセットを参考に、フォームを保てる範囲で。',strength:'前回の重量と回数を確認。重さを増やす必要はありません。',habit:'1セットだけを記録する日も、立派な一歩です。'};
    return {group:candidate.id,mode,title:mode==='light'?'今日は軽めの一歩を。':groups[candidate.id]+'の記録を振り返ろう。',text:(mode==='light'?'少ないセットでも大丈夫。':'')+notes[goal],evidence:'目標：'+goals[goal]+' · '+(recentGroups.length?'直近2日：'+recentGroups.map(g=>groups[g]).join('・'):'最近の部位記録はまだありません')};
  }
  return {groups,goals,exercises,day,shift,valid,validSession,state,rows,put,remove,rest,key,best,personalBests,summary,adventure,advice};
});
