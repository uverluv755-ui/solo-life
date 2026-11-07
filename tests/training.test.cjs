const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../progress.js'),T=require('../training.js'),J=require('../journey.js');
const date='2026-11-07';
const row=(patch={})=>({id:'one',day:date,group:'chest',exercise:'ベンチプレス',mode:'weighted',fatigue:'moderate',sets:[{kg:40,reps:10},{kg:42.5,reps:8}],...patch});
test('old saves migrate without training fields or changes to XP, quests and measurements',()=>{
 const s=C.fresh();s.totalXp=240;J.putBody(s,{id:'body',day:date,metric:'load',exercise:'ベンチプレス',value:20});
 const migrated=C.migrate(s);assert.equal(migrated.training,undefined);assert.equal(migrated.totalXp,240);assert.deepEqual(migrated.quests,s.quests);assert.deepEqual(migrated.journey,s.journey);
});
test('training only adds optional data; backup round trip is lossless',()=>{
 const s=C.fresh(),before=structuredClone(s);assert.equal(T.put(s,row(),null,date),'');
 const {training,...rest}=s;assert.deepEqual(rest,before);assert.ok(C.valid(s));assert.deepEqual(C.migrate(s),s);assert.equal(training.careDays.length,1);
});
test('multiple sets, exercise entries and recovery share one cosmetic step per day',()=>{
 const s=C.fresh();T.put(s,row(),null,date);T.put(s,row({id:'two',group:'back'}),null,date);T.rest(s,date);T.rest(s,date);
 assert.equal(T.adventure(s,date).days,1);assert.equal(s.training.restDays.length,1);assert.equal(s.totalXp,0);assert.equal(T.summary(s,date).sets,4);
});
test('rest and long gaps do not penalize XP or cosmetic progress',()=>{
 const s=C.fresh();for(let i=0;i<6;i++)T.rest(s,T.shift(date,-i*4));
 assert.equal(T.adventure(s,date).defeated,1);assert.equal(T.adventure(s,date).current.stage,'dawn');assert.equal(T.adventure(s,'2027-01-01').days,6);assert.equal(s.totalXp,0);
});
test('PB separates exercise, muscle, and bodyweight; strongest weight uses its own reps',()=>{
 const s=C.fresh();T.put(s,row(),null,date);T.put(s,row({id:'two',sets:[{kg:50,reps:5},{kg:20,reps:20}]}),null,date);
 T.put(s,row({id:'three',mode:'bodyweight',sets:[{kg:0,reps:22}]}),null,date);T.put(s,row({id:'four',group:'back'}),null,date);
 const pb=T.personalBests(s,'chest');assert.equal(pb.length,2);assert.equal(pb[0].kg,50);assert.equal(pb[0].atWeight,5);assert.equal(pb[0].reps,20);assert.equal(pb[0].trend.length,1);assert.equal(pb[1].reps,22);
});
test('corrections recompute PB and history while keeping earned cosmetic days',()=>{
 const s=C.fresh(),r=row();T.put(s,r,null,date);const changed=row({sets:[{kg:10,reps:3}]});assert.equal(T.put(s,changed,r,date),'');assert.equal(T.personalBests(s)[0].kg,10);
 assert.ok(T.remove(s,changed));assert.deepEqual(T.personalBests(s),[]);assert.equal(T.adventure(s,date).days,1);assert.equal(s.totalXp,0);
});
test('stale edits and removals cannot clobber a changed record',()=>{
 const s=C.fresh(),r=row();T.put(s,r,null,date);T.put(s,row({exercise:'new'}),r,date);const snapshot=structuredClone(s);
 assert.ok(T.put(s,row({exercise:'stale'}),r,date));assert.equal(T.remove(s,r),false);assert.deepEqual(s,snapshot);
});
test('duplicate IDs and future dates rejected without mutation',()=>{
 const s=C.fresh();T.put(s,row(),null,date);const snapshot=structuredClone(s);
 assert.ok(T.put(s,row(),null,date));assert.ok(T.put(s,row({id:'future',day:'2026-11-08'}),null,date));assert.deepEqual(s,snapshot);
});
for(const [name,patch] of Object.entries({empty:{sets:[]},tooMany:{sets:Array(21).fill({kg:1,reps:1})},negative:{sets:[{kg:-1,reps:1}]},fraction:{sets:[{kg:2.5,reps:1.2}]},infinite:{sets:[{kg:Infinity,reps:1}]},zeroReps:{sets:[{kg:0,reps:0}]},bodyweightLoad:{mode:'bodyweight',sets:[{kg:2,reps:10}]},badDate:{day:'2026-02-30'},badGroup:{group:'__proto__'},badName:{exercise:' '}}))
 test('invalid '+name+' is rejected',()=>{const s=C.fresh();assert.equal(T.validSession(row(patch)),false);assert.ok(T.put(s,row(patch),null,date));assert.equal(s.training,undefined);});
test('unknown versions and corrupt nested data are rejected, not silently erased',()=>{
 const s=C.fresh();T.put(s,row(),null,date);s.training.version=99;assert.equal(C.valid(s),false);assert.throws(()=>C.migrate(s));s.training.version=1;s.training.sessions[0].sets[0].reps=-1;assert.equal(C.valid(s),false);
});
test('recommendations avoid recently trained muscles, consider fatigue and respect rest',()=>{
 const s=C.fresh();T.put(s,row({day:'2026-11-06'}),null,date);assert.notEqual(T.advice(s,date).group,'chest');
 assert.equal(J.recommend(s,date).quests.some(q=>q.category==='strength'),false);
 assert.equal(C.boardQuests(s,new Date(date+'T20:00:00')).some(q=>q.category==='strength'),false);
 T.put(s,row({id:'hard',group:'back',fatigue:'hard'}),null,date);assert.equal(T.advice(s,date).group,null);
 J.checkIn(s,'rest',date);assert.equal(T.advice(s,date).mode,'rest');assert.deepEqual(J.recommend(s,date).quests,[]);
 assert.deepEqual(C.boardQuests(s,new Date(date+'T20:00:00')),[]);
});
test('all recently trained groups recommend recovery; old fatigue expires',()=>{
 const s=C.fresh();for(const g of Object.keys(T.groups))T.put(s,row({id:g,group:g}),null,date);
 assert.equal(T.advice(s,date).group,null);assert.notEqual(T.advice(s,'2026-11-10').group,null);
});
test('bodybuilding goal changes language without prescribing heavier loads',()=>{
 const s=C.fresh();T.state(s).goal='strength';assert.match(T.advice(s,date).text,/増やす必要はありません/);T.state(s).goal='habit';assert.match(T.advice(s,date).text,/1セット/);
});
