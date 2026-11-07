const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const C=require('../progress.js'),D=C.difficulty,J=require('../journey.js');
const day='2026-11-07',at=d=>new Date(d+'T12:00:00');
const quest=(c,r,n=0)=>D.catalog.filter(q=>q.category===c&&q.rank===r)[n];
function plan(s,q,d=day,id='plan') {assert.equal(C.putPlan(s,{id,name:q.name,stat:q.stat,start:d,weekdays:[]}), '');return C.completePlan(s,id,d,at(d));}
test('75 new choices cover five ranks and categories while the original 100 remain unchanged',()=>{
  assert.equal(D.catalog.length,75);assert.equal(D.byKey.size,175);
  for(const c of Object.keys(D.categories)) for(const r of D.ranks) {
    const qs=D.catalog.filter(q=>q.category===c&&q.rank===r);assert.equal(qs.length,3);
    for(const q of qs) {assert.ok(q.name.length<=40);assert.equal(q.xp,20);}
  }
  assert.equal(quest('study','A').minutes,90);assert.equal(quest('walk','A').minutes,45);
  assert.equal(quest('strength','A',2).minutes,60);assert.equal(quest('strength','E').reps,10);
});
test('preferences apply immediately, independently, without XP gates or changing old saves',()=>{
  const s=C.fresh(),before=structuredClone(s);s.habitGoal='study';D.setRank(s,'study','A');D.setRank(s,'walk','D');
  assert.ok(C.boardQuests(s,at(day)).filter(q=>q.category==='study').every(q=>q.rank==='A'));
  assert.ok(J.recommend(s,day).quests.some(q=>q.category==='study'&&q.rank==='A'));
  assert.equal(s.totalXp,before.totalXp);assert.deepEqual(s.stats,before.stats);assert.equal(D.rank(s,'strength'),'E');
  assert.equal(D.setRank(s,'study','Z'),false);assert.equal(D.setRank(s,'__proto__','A'),false);assert.ok(C.valid(s));
  const offers=C.boardQuests(s,at(day));assert.equal(new Set(offers.map(q=>q.category)).size,offers.length);
});
test('legacy custom abilities and rewards remain intact while new series use their fixed rewards',()=>{
  const s=C.fresh(),old=C.habits.catalog[0],q=quest('strength','A');
  s.quests.push({id:'legacy-custom',name:old.name,stat:'wealth',xp:80});
  const legacy=C.completeQuest(s,'legacy-custom',at(day));assert.equal(legacy.xp,80);assert.equal(legacy.stat,'wealth');assert.equal(s.daily[day].trained,undefined);
  s.quests.push({id:'new-custom',name:q.name,stat:'wealth',xp:80});
  const modern=C.completeQuest(s,'new-custom',at(day));assert.equal(modern.xp,20);assert.equal(modern.stat,'strength');assert.equal(s.daily[day].trained,true);
});
test('rank switches, alternate slots, plans and registered copies cannot multiply rewards',()=>{
  const s=C.fresh();s.habitGoal='study';D.setRank(s,'study','B');
  const q=C.boardQuests(s,at(day)).find(q=>q.category==='study');
  D.setRank(s,'study','A');assert.equal(C.completeBoardQuest(s,q.id,day,at(day),q.key),null);
  D.setRank(s,'study','B');assert.equal(C.completeBoardQuest(s,q.id,day,at(day),q.key).xp,20);
  const frozen=C.boardQuests(s,at(day)).find(x=>x.id===q.id);
  D.setRank(s,'study','A');assert.deepEqual(C.boardQuests(s,at(day)).find(x=>x.id===q.id),frozen);
  for(const r of D.ranks) {
    const candidate=quest('study',r);assert.equal(plan(s,candidate,day,'plan-'+r),null);
    s.quests.push({id:r,name:candidate.name,stat:candidate.stat,xp:80});assert.equal(C.completeQuest(s,r,at(day)),null);
  }
  assert.equal(s.totalXp,20);assert.equal(s.daily[day].quests,1);assert.equal(s.history.length,1);
  assert.equal(C.completeQuest(s,'A',at('2026-11-08')).xp,20);assert.ok(C.valid(s));
  assert.deepEqual(C.migrate(s,at('2026-11-08')),s);
});
test('all completion paths use shared identity including old catalog and history beyond 100 rows',()=>{
  for(const path of ['plan','registered']) {
    const s=C.fresh(),q=quest('walk','A');
    if(path==='plan')assert.equal(plan(s,q).xp,20);
    else {s.quests.push({id:'copy',name:q.name,stat:q.stat,xp:80});assert.equal(C.completeQuest(s,'copy',at(day)).xp,20);C.removeQuest(s,'copy');}
    s.history=[];assert.ok(D.claimed(s,quest('walk','E'),day));assert.equal(plan(s,quest('walk','B'),day,'copy2'),null);assert.ok(C.valid(s));
  }
  const s=C.fresh(),q=C.habits.catalog[0];assert.equal(plan(s,q).xp,20);
  s.quests.push({id:'old',name:q.name,stat:q.stat,xp:40});assert.equal(C.completeQuest(s,'old',at(day)),null);
});
test('three separate easy days recommend one step only; difficulty is never changed automatically',()=>{
  const s=C.fresh();D.setRank(s,'study','C');
  for(const d of ['2026-11-03','2026-11-05','2026-11-07']) {
    const q=quest('study','C');assert.ok(plan(s,q,d));assert.ok(D.feedback(s,q.key,'easy',d));
  }
  const before=structuredClone(s);assert.equal(D.suggestion(s,'study',day).rank,'B');assert.deepEqual(s,before);
  assert.equal(D.suggestion(s,'study',day,'light').rank,'C');assert.equal(D.suggestion(s,'study',day,'rest').rank,'C');
  D.setRank(s,'study','B');assert.equal(D.suggestion(s,'study',day).rank,'B');
  const q=quest('study','B');plan(s,q,'2026-11-08');D.feedback(s,q.key,'hard','2026-11-08');
  assert.equal(D.suggestion(s,'study','2026-11-08').rank,'C');
  assert.equal(D.suggestion(s,'study','2026-12-08').rank,'B');assert.equal(D.feedback(s,q.key,'easy',day),false);
});
test('recovery controls suppress high load and automatic increases without deleting progress',()=>{
  const s=C.fresh();s.habitGoal='strength';D.setRank(s,'strength','A');
  C.completeQuest(s,'training',at('2026-11-06'));
  assert.ok(C.boardQuests(s,at(day)).every(q=>q.category!=='strength'));
  assert.ok(J.recommend(s,day).quests.every(q=>q.category!=='strength'));
  for(const mode of ['light','tired','rest']) {
    J.checkIn(s,mode,day);const rows=C.boardQuests(s,at(day));
    if(mode==='rest')assert.equal(rows.length,0);
    else assert.ok(rows.every(q=>!q.rank&&q.minutes<=3));
    assert.equal(D.rank(s,'strength'),'A');
  }
  assert.equal(D.suggestion(s,'strength',day,'rest').rank,'A');
  assert.ok(C.boardQuests(s,at('2026-11-08')).some(q=>q.rank==='A'));
});
test('v0.14 data and completed offers survive upgrade exactly; malformed extensions are rejected',()=>{
  const scope={module:{exports:{}},require};
  // Resolve historical dependencies against the current compatible modules.
  scope.require=p=>require('../'+p.slice(2));vm.runInNewContext(execFileSync('git',['show','811bc60:progress.js'],{encoding:'utf8'}),scope);
  const old=scope.module.exports,s=JSON.parse(JSON.stringify(old.fresh()));
  old.completeBoardQuest(s,'workout',day,at(day));s.extra={retained:true};
  const before=structuredClone(s);assert.deepEqual(C.migrate(s,at(day)),before);
  D.setRank(s,'strength','A');assert.equal(C.boardQuests(s,at(day)).find(q=>q.id==='workout').name,old.boardQuests(before,at(day))[0].name);
  assert.equal(C.completeBoardQuest(s,'workout',day,at(day)),null);
  for(const change of [x=>x.difficulty.version=9,x=>x.difficulty.levels.work='Z',x=>x.daily[day].catalogLog=[{key:'missing'}]]) {
    const copy=structuredClone(s);change(copy);assert.equal(C.valid(copy),false);assert.throws(()=>C.migrate(copy));
  }
});
