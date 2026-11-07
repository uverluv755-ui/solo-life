(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./habits.js'),require('./difficulty.js'));
  else root.SoloJourney = factory(root.SoloHabits,root.SoloDifficulty);
})(globalThis, function (H,D) {
  'use strict';
  const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && day(new Date(d+'T12:00:00')) === d;
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const id = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
  const title = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 60;
  const stats = ['strength','intellect','mind','wealth','health','discipline'];
  const unique = list => new Set(list).size === list.length;
  const metrics = {walk:{name:'歩行時間',unit:'分',max:1440}, reps:{name:'運動回数',unit:'回',max:100000}, load:{name:'トレーニング重量',unit:'kg',max:2000}, weight:{name:'体重',unit:'kg',max:1000}};
  const stages = [
    {level:1,id:'novice',name:'覚醒の旅人'}, {level:5,id:'awakened',name:'黎明の挑戦者'},
    {level:15,id:'ascended',name:'蒼光の覚醒者'}, {level:25,id:'legend',name:'星界の先駆者'}, {level:50,id:'crowned',name:'星冠の守護者'}
  ];
  const branches = [
    ['strength','剣の紋章','不屈の刃','strength-wall5','strength-wall8'],
    ['intellect','知の灯火','叡智の書','study-word','study-summary'],
    ['mind','静寂の守り','月夜の庇護','sleep-note','sleep-worry'],
    ['wealth','備えの印','星の金庫','food-check','food-list'],
    ['health','旅の一歩','翠の道標','walk-room1','walk-morning5'],
    ['discipline','秩序の糸','刻の織り手','tidy-one','work-split']
  ];
  const skills = branches.flatMap(([stat,a,b,qa,qb]) => [
    {id:stat+'-1',stat,name:a,threshold:15,parent:null,quest:qa},
    {id:stat+'-2',stat,name:b,threshold:30,parent:stat+'-1',quest:qb}
  ]);
  function validBody(r) {
    return object(r) && id(r.id) && validDay(r.day) && Object.hasOwn(metrics,r.metric) &&
      Number.isFinite(r.value) && r.value >= 0 && r.value <= metrics[r.metric].max &&
      (r.metric !== 'weight' || r.value > 0) && (r.metric !== 'reps' || Number.isInteger(r.value)) &&
      typeof r.exercise === 'string' && r.exercise.length <= 60 &&
      (!['reps','load'].includes(r.metric) || title(r.exercise));
  }
  function validBoss(b) {
    return object(b) && id(b.id) && title(b.name) && validDay(b.start) &&
      (b.stat === 'any' || stats.includes(b.stat)) && Number.isInteger(b.target) && b.target >= 1 && b.target <= 365 &&
      typeof b.paused === 'boolean' && Array.isArray(b.days) && b.days.length <= b.target &&
      b.days.every(d => validDay(d) && d >= b.start) && unique(b.days);
  }
  function valid(j) {
    return object(j) && j.version === 1 &&
      (j.checkIn === null || (object(j.checkIn) && validDay(j.checkIn.day) && ['normal','light','tired','rest'].includes(j.checkIn.fatigue))) &&
      Array.isArray(j.body) && j.body.length <= 5000 && j.body.every(validBody) && unique(j.body.map(r=>r.id)) &&
      Array.isArray(j.bosses) && j.bosses.length <= 100 && j.bosses.every(validBoss) && unique(j.bosses.map(b=>b.id)) &&
      Array.isArray(j.skills) && unique(j.skills) && j.skills.every(id => skills.some(k=>k.id===id)) &&
      j.skills.every(id => { const k=skills.find(k=>k.id===id); return !k.parent || j.skills.includes(k.parent); });
  }
  const state = s => s.journey ||= {version:1,checkIn:null,body:[],bosses:[],skills:[]};
  const fatigue = (s,today=day()) => s.journey?.checkIn?.day === today ? s.journey.checkIn.fatigue : 'normal';
  function checkIn(s, value, today=day()) {
    if (!validDay(today) || !['normal','light','tired','rest'].includes(value)) return false;
    state(s).checkIn = {day:today,fatigue:value}; return true;
  }
  function recommend(s, today=day(), offers=[]) {
    const mode = fatigue(s,today), goal = s.habitGoal || 'balance';
    const active = Object.entries(s.daily).filter(([d,v])=>d<=today && v.quests>0).map(([d])=>d).sort();
    const recentStart = new Date(today+'T12:00:00'); recentStart.setDate(recentStart.getDate()-6);
    const recent = Object.entries(s.daily).filter(([d])=>d>=day(recentStart) && d<=today);
    const recentNames = new Set(recent.flatMap(([,v])=>(v.planLog||[]).map(p=>p.name)));
    for(const h of s.history) {
      const d=day(new Date(h.at));
      if(d>=day(recentStart) && d<=today && h.type!=='focus') recentNames.add(h.label);
    }
    const recentKeys = new Set([...recent.flatMap(([,v])=>(v.habitLog||[]).map(h=>h.key)),
      ...D.all.filter(q=>recentNames.has(q.name)).map(q=>q.key)]);
    const done = s.daily[today];
    const doneKeys = new Set((done?.habitLog||[]).map(h=>h.key));
    const names = new Set([...(done?.planLog||[]).map(p=>p.name), ...(s.plans||[]).map(p=>p.name),
      ...s.quests.map(q=>q.name), ...offers.map(q=>q.name),
      ...s.history.filter(h=>day(new Date(h.at))===today).map(h=>h.label)]);
    const strengthIds=new Set(s.quests.filter(q=>q.stat==='strength').map(q=>q.id));
    const trained = d => !!(d?.trained || d?.trainingOfferDone || d?.planLog?.some(p=>p.stat==='strength') || d?.questIds.some(id=>strengthIds.has(id)));
    const trainedRecently = trained(done) || (() => {
      const previous = new Date(today+'T12:00:00'); previous.setDate(previous.getDate()-1);
      return trained(s.daily[day(previous)]);
    })();
    const maxTier = mode==='normal' ? (active.filter(d=>d<today).length>=30?3:active.filter(d=>d<today).length>=7?2:1) : 1;
    if (mode==='rest') return {mode,quests:[],message:'今日は休養を選びました。行動の提案はお休みです。目標ボスの進捗と習得スキルはそのまま残ります。',active:recent.filter(([,d])=>d.quests||d.focus).length};
    const source=s.difficulty ? [...H.catalog.filter(q=>!Object.hasOwn(D.categories,q.category)||mode!=='normal'), ...D.catalog.filter(q=>mode==='normal'&&q.rank===D.rank(s,q.category))] : H.catalog;
    const pool = source.filter(q=>(q.rank || q.tier<=maxTier) && !D.claimed(s,q,today) && !doneKeys.has(q.key) && !names.has(q.name) &&
      (mode!=='tired' || (!['strength','walk'].includes(q.category) && q.minutes<=2)) &&
      (mode!=='light' || q.minutes<=3) && (!trainedRecently || q.category!=='strength'));
    const score = q => (q.category===goal?20:0) + (!recentKeys.has(q.key)?5:0) - q.minutes/10;
    pool.sort((a,b)=>score(b)-score(a) || a.key.localeCompare(b.key));
    const selected=[], categories=new Set();
    for(const q of pool) { if(categories.has(q.category)) continue; selected.push(q); categories.add(q.category); if(selected.length===3) break; }
    return {mode, active:recent.filter(([,d])=>d.quests||d.focus).length,
      message:mode==='tired'?'疲れが強い日は、休養も選べます。行うなら短い身支度やメモから。':mode==='light'?'今日は入門の短い行動から。できそうなものだけ選んでください。':trainedRecently?'最近の筋トレ記録を踏まえ、筋トレ以外の候補を選びました。':'今日の一歩を、あなたの目標と記録から選びました。',
      quests:selected.map(q=>({...q,reason:[q.category===goal?'選択した目標に合う': '別の分野にも小さな一歩',!recentKeys.has(q.key)?'直近7日の達成にない候補':'最近取り組んだ行動',D.label(q)].join(' · ')}))};
  }
  function putBody(s,r,editing=false) {
    if(!validBody(r) || r.day>day()) return '日付・種目・数値を確認してください';
    const rows=s.journey?.body||[], exists=rows.some(x=>x.id===r.id);
    if(editing!==exists) return '記録が変更されています。開き直してください';
    if(!editing && rows.length>=5000) return '記録は最大5000件です。バックアップ後に不要な記録を整理してください';
    state(s).body=editing?rows.map(x=>x.id===r.id?r:x):[...rows,r]; return '';
  }
  function addBoss(s,b) {
    const rows=s.journey?.bosses||[];
    if(!validBoss(b) || b.days.length || rows.some(x=>x.id===b.id)) return '目標の内容を確認してください';
    if(rows.length>=100 || rows.filter(x=>!x.paused && x.days.length<x.target).length>=3) return '同時に挑戦できる目標は3つです。ひとつを休戦してから追加してください';
    state(s).bosses=[...rows,b]; return '';
  }
  function advanceBosses(s,stat,today) {
    for(const b of s.journey?.bosses||[]) {
      if(!b.paused && b.start<=today && b.days.length<b.target && !b.days.includes(today) && (b.stat==='any'||b.stat===stat)) b.days.push(today);
    }
  }
  function toggleBoss(s,id) {
    const b=s.journey?.bosses.find(b=>b.id===id); if(!b || b.days.length>=b.target) return false;
    if(b.paused && s.journey.bosses.filter(x=>!x.paused && x.days.length<x.target).length>=3) return false;
    b.paused=!b.paused; return true;
  }
  function learn(s,id) {
    const k=skills.find(k=>k.id===id), learned=s.journey?.skills||[];
    if(!k || learned.includes(id) || s.stats[k.stat]<k.threshold || (k.parent&&!learned.includes(k.parent))) return false;
    state(s).skills.push(id); return true;
  }
  function evolution(s) {
    const level=Math.floor(s.totalXp/100)+1;
    const current=stages.filter(x=>x.level<=level).at(-1), next=stages.find(x=>x.level>level);
    return {current,next,remaining:next?(next.level-1)*100-s.totalXp:0};
  }
  return {metrics,stages,skills,valid,validBody,validBoss,state,day,fatigue,checkIn,recommend,putBody,addBoss,advanceBosses,toggleBoss,learn,evolution};
});
