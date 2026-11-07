(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./training.js'));
  else root.SoloSeason=factory(root.SoloTraining);
})(globalThis,function(T){
  'use strict';
  const levels={beginner:'初心者',intermediate:'中級者',advanced:'上級者'};
  const splits={full:'全身 · 週3回の目安',five:'5分割 · 胸 / 背中 / 脚 / 肩 / 腕'};
  const cycles={full:['fullA','rest','fullB','rest','fullA','rest','rest'],five:['chest','back','legs','rest','shoulders','arms','rest']};
  const labels={fullA:'全身の礎',fullB:'全身の共鳴',chest:'胸の鍛錬',back:'背中の鍛錬',legs:'脚の鍛錬',shoulders:'肩の鍛錬',arms:'腕と体幹の鍛錬',rest:'回復の聖域'};
  // Editable examples, never a mandatory load or a test of physical ability.
  const ex=(group,exercise,mode='weighted')=>({group,exercise,mode});
  const library={
    beginner:{chest:[ex('chest','壁腕立て','bodyweight')],back:[ex('back','ダンベルロウ')],legs:[ex('legs','椅子スクワット','bodyweight')],shoulders:[ex('shoulders','サイドレイズ')],arms:[ex('arms','アームカール'),ex('core','クランチ','bodyweight')]},
    intermediate:{chest:[ex('chest','ダンベルプレス'),ex('chest','腕立て伏せ','bodyweight')],back:[ex('back','ラットプルダウン'),ex('back','ダンベルロウ')],legs:[ex('legs','スクワット'),ex('legs','レッグカール')],shoulders:[ex('shoulders','ショルダープレス'),ex('shoulders','サイドレイズ')],arms:[ex('arms','アームカール'),ex('arms','トライセプスエクステンション'),ex('core','クランチ','bodyweight')]},
    advanced:{chest:[ex('chest','ベンチプレス'),ex('chest','インクラインダンベルプレス'),ex('chest','ケーブルフライ')],back:[ex('back','懸垂','bodyweight'),ex('back','ダンベルロウ'),ex('back','ラットプルダウン')],legs:[ex('legs','スクワット'),ex('legs','レッグカール'),ex('legs','カーフレイズ')],shoulders:[ex('shoulders','ショルダープレス'),ex('shoulders','サイドレイズ'),ex('shoulders','リアレイズ')],arms:[ex('arms','アームカール'),ex('arms','トライセプスエクステンション'),ex('core','レッグレイズ','bodyweight')]}
  };
  const config=x=>!!x&&Object.hasOwn(levels,x.level)&&Object.hasOwn(splits,x.split);
  const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&T.day(new Date(d+'T12:00:00'))===d;
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  function valid(x){
    if(!object(x)||x.version!==1||!config(x)||!Array.isArray(x.runs)||!x.runs.length||x.runs.length>100)return false;
    let last='';const ids=new Set();
    return x.runs.every((r,i)=>{
      if(!object(r)||typeof r.id!=='string'||!/^[-\w]{1,100}$/.test(r.id)||ids.has(r.id)||!validDay(r.started)||r.started<last||!Array.isArray(r.entries)||r.entries.length>66||(i<x.runs.length-1&&r.entries.length!==66))return false;
      ids.add(r.id);let previous='';
      if(!r.entries.every(e=>object(e)&&validDay(e.day)&&e.day>=r.started&&e.day>previous&&e.day>last&&config(e)&&['training','rest'].includes(e.kind)&&(previous=e.day)))return false;
      last=previous||r.started;return true;
    });
  }
  const active=s=>s.season?.runs.at(-1)||null;
  function start(s,settings,today=T.day(),id='season-'+today){
    const previous=active(s);
    if(!config(settings)||!validDay(today)||(s.season?.runs.length||0)>=100||previous&&(previous.entries.length!==66||previous.entries.at(-1).day>=today)||s.season?.runs.some(r=>r.id===id)||typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))return false;
    if(!s.season)s.season={version:1,...settings,runs:[]};
    s.season.level=settings.level;s.season.split=settings.split;
    s.season.runs.push({id,started:today,entries:[]});return true;
  }
  function configure(s,settings){if(!active(s)||!config(settings))return false;Object.assign(s.season,{level:settings.level,split:settings.split});return true;}
  function view(s,today=T.day()){
    const r=active(s);if(!r)return null;
    const doneToday=r.entries.at(-1)?.day===today,complete=r.entries.length===66;
    return {run:r,done:r.entries.length,complete,doneToday,number:Math.min(66,r.entries.length+(doneToday?0:1)),blocked:today<r.started||!!r.entries.length&&r.entries.at(-1).day>=today};
  }
  function plan(settings,number){
    if(!config(settings)||!Number.isInteger(number)||number<1||number>66)return null;
    const week=Math.floor((number-1)/7),slot=cycles[settings.split][(number-1)%7];
    const phase=number<=14?'I · 灯火の目覚め':number<=35?'II · 蒼鉄の旅路':number<=56?'III · 星霧の鍛錬':'IV · 暁への帰還';
    const light=week===3||week===7;
    const sets=Math.max(1,({beginner:number<=14?1:2,intermediate:2,advanced:3}[settings.level])-(light?1:0));
    let list=library[settings.level][slot]||[];
    if(slot.startsWith('full'))list=(slot==='fullA'?['legs','chest','back']:['legs','shoulders','arms']).map(g=>library[settings.level][g][0]);
    return {number,slot,title:labels[slot],phase,light,rest:slot==='rest',items:list.map(e=>({...e,sets,reps:settings.level==='beginner'?'5–8':settings.level==='intermediate'?'8–12':'6–12'}))};
  }
  function guidance(s,menu,today=T.day()){
    const check=s.journey?.checkIn?.day===today?s.journey.checkIn.fatigue:'normal';
    if(menu.rest)return {rest:true,text:'今日は予定された休養日。何もしない休息も、このシーズンの大切な一歩です。'};
    const recent=T.rows(s).filter(r=>r.day>=T.shift(today,-1)&&r.day<=today);
    if(['rest','tired'].includes(check)||recent.some(r=>r.fatigue==='hard'))return {rest:true,text:'ギルドより：疲れの記録があります。今日は休養への変更をおすすめします。進捗は同じ1日分です。'};
    const groups=new Set(menu.items.map(e=>e.group));
    // Include overlapping muscle groups, not just the exercise's primary label.
    if(groups.has('chest')||groups.has('back')||groups.has('shoulders'))groups.add('arms');
    if(groups.has('arms')){groups.add('chest');groups.add('back');groups.add('shoulders');}
    if(recent.some(r=>r.day<today&&groups.has(r.group)))return {rest:true,text:'ギルドより：昨日、関連する部位を記録しています。回復を待つ休養日にも変更できます。'};
    return {rest:false,text:check==='light'?'今日は軽めの希望。種目やセットを減らしても1日分として進めます。':'目安は自由に短縮・変更できます。実際に行った分だけ記録しましょう。'};
  }
  const matches=(r,e)=>T.key(r)===T.key(e);
  function comparison(s,e,today=T.day()){
    const list=T.rows(s).filter(r=>r.day<today&&matches(r,e)).sort((a,b)=>b.day.localeCompare(a.day));
    const previous=list[0];if(!previous)return {previous:null,current:T.rows(s).filter(r=>r.day===today&&matches(r,e)),delta:null};
    const prior=T.rows(s).filter(r=>r.day===previous.day&&matches(r,e)),current=T.rows(s).filter(r=>r.day===today&&matches(r,e));
    const sum=rows=>rows.flatMap(r=>r.sets).reduce((n,x)=>n+x.reps,0);
    return {previous:{day:previous.day,sets:prior.flatMap(r=>r.sets)},current,delta:current.length?{kg:Math.round((T.best(current).kg-T.best(prior).kg)*100)/100,reps:sum(current)-sum(prior)}:null};
  }
  function finish(s,kind,expected,today=T.day()){
    const v=view(s,today);
    if(!v||v.complete||v.blocked||v.run.id!==expected?.id||v.done!==expected?.done||!['training','rest'].includes(kind))return false;
    const menu=plan(s.season,v.number);
    if(kind==='training'&&(menu.rest||!T.rows(s).some(r=>r.day===today)))return false;
    if(kind==='rest'&&!T.rest(s,today))return false;
    v.run.entries.push({day:today,kind,level:s.season.level,split:s.season.split});return true;
  }
  return {levels,splits,valid,active,start,configure,view,plan,guidance,comparison,finish};
});
