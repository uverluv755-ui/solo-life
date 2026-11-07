const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const C=require('../progress.js');
const J=require('../journey.js');
const date=d=>new Date(d+'T12:00:00');
const boss=(id='boss')=>({id,name:'散歩の道を育てる',stat:'any',target:3,start:'2026-11-01',days:[],paused:false});
test('v0.13 save retains every field and unknown fields without initializing extensions',()=>{
  const context={module:{exports:{}},require:()=>require('../habits.js')};
  vm.runInNewContext(execFileSync('git',['show','2d9f5fb:progress.js'],{encoding:'utf8'}),context);
  const old=context.module.exports,s=old.fresh();
  s.habitGoal='walk'; s.focusMinutes=15;s.focusEnd=Date.now()+900000;s.customFutureField={keep:'yes'};
  old.putPlan(s,{id:'plan',name:'買い物',stat:'discipline',start:'2026-11-07',weekdays:[6]});
  old.completeBoardQuest(s,'workout','2026-11-07',date('2026-11-07'));
  old.completeQuest(s,'reading',date('2026-11-07'));
  const original=JSON.parse(JSON.stringify(s));
  assert.deepEqual(C.migrate(original,date('2026-11-07')),original);
  assert.equal(original.journey,undefined);
  assert.deepEqual(C.migrate(C.migrate(original,date('2026-11-07')),date('2026-11-07')),original);
});
test('guild uses catalog, goal, daily fatigue and history without modifying saves',()=>{
  const s=C.fresh();s.habitGoal='strength';const before=JSON.stringify(s);
  assert.equal(J.recommend(s,'2026-11-07').quests[0].category,'strength');
  assert.equal(JSON.stringify(s),before);
  C.completeQuest(s,'training',date('2026-11-06'));
  assert.ok(J.recommend(s,'2026-11-07').quests.every(q=>q.category!=='strength'));
  J.checkIn(s,'tired','2026-11-07');
  assert.ok(J.recommend(s,'2026-11-07').quests.every(q=>q.tier===1&&q.minutes<=2&&!['strength','walk'].includes(q.category)));
  J.checkIn(s,'rest','2026-11-07');
  assert.equal(J.recommend(s,'2026-11-07').quests.length,0);
  assert.equal(J.fatigue(s,'2026-11-08'),'normal');
  assert.equal(J.checkIn(s,'invalid'),false); assert.ok(C.valid(s));
});
test('guild avoids completed and planned actions and levels by prior active days',()=>{
  const s=C.fresh();s.habitGoal='walk';
  const q=J.recommend(s,'2026-11-07').quests[0];
  C.putPlan(s,{id:'plan',name:q.name,stat:q.stat,start:'2026-11-07',weekdays:[]});
  assert.ok(J.recommend(s,'2026-11-07').quests.every(x=>x.key!==q.key));
  C.completePlan(s,'plan','2026-11-07',date('2026-11-07'));
  assert.ok(J.recommend(s,'2026-11-07').quests.every(x=>x.key!==q.key));
  assert.notEqual(J.recommend(s,'2026-11-08').quests[0].key,q.key,'Completed planner activities influence the next day');
  const board=C.boardQuests(s,date('2026-11-08'));
  assert.ok(J.recommend(s,'2026-11-08',board).quests.every(x=>!board.some(b=>b.name===x.name)));
  for(let i=1;i<=30;i++) C.completeQuest(s,'reading',date(C.shiftDay('2026-11-07',-i)));
  J.checkIn(s,'light','2026-11-07');
  assert.ok(J.recommend(s,'2026-11-07').quests.every(x=>x.tier===1));
});
test('rest suppresses unclaimed urgent offers without marking quests complete or losing progress',()=>{
  const s=C.fresh(), evening=new Date('2026-11-07T20:00:00');
  assert.ok(C.boardQuests(s,evening).some(q=>q.urgent));
  J.checkIn(s,'rest','2026-11-07');
  assert.ok(C.boardQuests(s,evening).every(q=>!q.urgent));
  assert.deepEqual(s.daily,{});assert.equal(s.totalXp,0);assert.deepEqual(s.stats,C.fresh().stats);
  assert.ok(C.boardQuests(s,new Date('2026-11-08T20:00:00')).some(q=>q.urgent));
});
test('body recording/editing changes neither XP, stats, history nor quest progress',()=>{
  const s=C.fresh(),base=structuredClone(s);
  const r={id:'measure',day:'2026-11-07',metric:'load',exercise:'ダンベルプレス',value:5.5};
  assert.equal(J.putBody(s,r),'');assert.equal(J.putBody(s,{...r,value:6},true),'');
  assert.equal(s.journey.body[0].value,6);assert.deepEqual({...s,journey:undefined},{...base,journey:undefined});
  for(const bad of [{...r,value:Infinity},{...r,value:-1},{...r,day:'2026-02-30'},{...r,exercise:''},{...r,metric:'reps',value:1.5},{...r,metric:'weight',value:0}]) {
    const before=structuredClone(s);assert.notEqual(J.putBody(s,bad,true),'');assert.deepEqual(s,before);
  }
  assert.deepEqual(C.migrate(JSON.parse(JSON.stringify(s))),s);
});
test('goal bosses count only future matching quest days, never rest or focus; no bonus XP',()=>{
  const s=C.fresh();const b={...boss(),stat:'strength'};assert.equal(J.addBoss(s,b),'');
  C.completeQuest(s,'reading',date('2026-11-01'));assert.equal(b.days.length,0);
  C.completeQuest(s,'training',date('2026-11-01'));
  C.completeBoardQuest(s,'workout','2026-11-01',date('2026-11-01'));
  assert.equal(b.days.length,1);
  J.toggleBoss(s,b.id);C.completeQuest(s,'training',date('2026-11-03'));assert.equal(b.days.length,1);
  const rested=C.migrate(s,date('2027-01-01'));assert.deepEqual(rested.journey.bosses[0],b);
  J.toggleBoss(s,b.id);C.completeQuest(s,'training',date('2026-11-08'));
  s.focusEnd=0;C.completeFocus(s,date('2026-11-09'));assert.equal(b.days.length,2);
  const xp=s.totalXp;C.completeQuest(s,'training',date('2026-11-15'));assert.equal(s.totalXp,xp+80);assert.equal(b.days.length,3);
  C.completeQuest(s,'training',date('2026-11-16'));assert.equal(b.days.length,3);assert.ok(C.valid(s));
});
test('active boss limit applies when resuming, completed and paused records remain',()=>{
  const s=C.fresh();for(let i=0;i<3;i++)assert.equal(J.addBoss(s,boss('b'+i)),'');
  assert.notEqual(J.addBoss(s,boss('b3')),'');assert.ok(J.toggleBoss(s,'b0'));
  assert.equal(J.addBoss(s,boss('b3')),'');assert.equal(J.toggleBoss(s,'b0'),false);assert.equal(s.journey.bosses.length,4);
});
test('skill prerequisites persist, unlocking cannot mint XP, gaps do not revoke skills',()=>{
  const s=C.fresh();s.stats.strength=30;
  assert.equal(J.learn(s,'strength-2'),false);assert.equal(J.learn(s,'strength-1'),true);
  assert.equal(J.learn(s,'strength-1'),false);assert.equal(J.learn(s,'strength-2'),true);
  assert.equal(J.learn(s,'__proto__'),false);assert.equal(s.totalXp,0);assert.equal(s.stats.strength,30);
  assert.deepEqual(C.migrate(s,date('2030-01-01')).journey.skills,['strength-1','strength-2']);
});
test('all evolution boundaries preserve existing 100 XP curve and save fields',()=>{
  const s=C.fresh();for(const stage of J.stages) {
    s.totalXp=(stage.level-1)*100;const before=JSON.stringify(s);
    assert.equal(J.evolution(s).current.id,stage.id);assert.equal(JSON.stringify(s),before);
    if(stage.level>1) {s.totalXp--;assert.notEqual(J.evolution(s).current.id,stage.id);}
  }
});
test('malformed or future extensions reject restoration rather than dropping records',()=>{
  const s=C.fresh();J.state(s);
  for(const edit of [x=>x.version=2,x=>x.body=[{}],x=>x.skills=['strength-2'],x=>x.bosses=[{...boss(),days:['2026-11-01','2026-11-01']}],x=>x.checkIn={day:'bad',fatigue:'rest'}]) {
    const bad=structuredClone(s);edit(bad.journey);assert.equal(C.valid(bad),false);assert.throws(()=>C.migrate(bad));
  }
});
