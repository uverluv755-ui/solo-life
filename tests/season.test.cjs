const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../progress.js'),S=require('../season.js'),T=require('../training.js'),J=require('../journey.js');
const day='2026-11-07',settings={level:'beginner',split:'full'};
const begin=()=>{const s=C.fresh();assert.ok(S.start(s,settings,day));return s;};
const expected=s=>({id:S.active(s).id,done:S.active(s).entries.length});
const log=(s,d=day,e=S.plan(settings,1).items[0])=>T.put(s,{id:'log-'+d,day:d,...e,fatigue:'moderate',sets:[{kg:e.mode==='bodyweight'?0:20,reps:8}]},null,d);
test('legacy migration adds no season and preserves all existing save fields',()=>{const s=C.fresh();T.rest(s,day);J.putBody(s,{id:'weight',day,metric:'weight',value:70});const migrated=C.migrate(s);assert.deepEqual(migrated,s);assert.equal(migrated.season,undefined);});
test('all levels and splits produce 66 bounded days with recovery and no prescribed weight',()=>{
 for(const level of Object.keys(S.levels))for(const split of Object.keys(S.splits)){
  const menus=Array.from({length:66},(_,i)=>S.plan({level,split},i+1));assert.ok(menus.filter(p=>p.rest).length>=18);
  assert.ok(menus.every(p=>p.rest?p.items.length===0:p.items.length>=1&&p.items.every(e=>e.sets>=1&&e.sets<=3&&e.reps&&!Object.hasOwn(e,'kg'))));
  if(split==='five')assert.deepEqual(menus.slice(0,7).map(p=>p.slot),['chest','back','legs','rest','shoulders','arms','rest']);
 }
 assert.equal(S.plan(settings,0),null);assert.equal(S.plan(settings,67),null);
});
test('training completion needs real records; partial work is enough; claims are idempotent',()=>{
 const s=begin(),before=structuredClone(s),claim=expected(s);assert.equal(S.finish(s,'training',claim,day),false);assert.deepEqual(s,before);assert.equal(log(s),'');
 assert.ok(S.finish(s,'training',claim,day));assert.equal(S.finish(s,'training',claim,day),false);assert.equal(S.view(s,day).number,1);assert.equal(S.view(s,day).doneToday,true);assert.equal(S.view(s,T.shift(day,1)).number,2);assert.equal(s.totalXp,0);
});
test('recovery completes a day, shares cosmetic step, and never changes XP, quests or history',()=>{
 const s=begin(),before=structuredClone(s);T.rest(s,day);assert.ok(S.finish(s,'rest',expected(s),day));assert.equal(T.adventure(s,day).days,1);assert.deepEqual(s.quests,before.quests);assert.deepEqual(s.history,before.history);assert.deepEqual(s.stats,before.stats);assert.equal(s.totalXp,before.totalXp);
});
test('missed days pause progress; planned rest cannot be completed as training',()=>{
 const s=begin();S.finish(s,'rest',expected(s),day);const later=T.shift(day,20);assert.equal(S.view(s,later).number,2);log(s,later);assert.equal(S.finish(s,'training',expected(s),later),false);assert.ok(S.finish(s,'rest',expected(s),later));assert.equal(S.view(s,T.shift(later,1)).number,3);
});
test('all 66 days, new season, old archive and one step across season boundary',()=>{
 const s=begin();for(let i=0;i<66;i++)assert.ok(S.finish(s,'rest',expected(s),T.shift(day,i)));
 assert.equal(S.view(s,T.shift(day,65)).complete,true);assert.equal(S.start(s,settings,T.shift(day,65),'second'),false);
 assert.ok(S.start(s,{level:'advanced',split:'five'},T.shift(day,66),'second'));assert.equal(S.active(s).entries.length,0);assert.equal(s.season.runs[0].entries.length,66);assert.ok(C.valid(s));assert.deepEqual(C.migrate(s),s);assert.equal(s.totalXp,0);
});
test('configuration changes only future menus; achieved settings survive backup',()=>{
 const s=begin();S.finish(s,'rest',expected(s),day);S.configure(s,{level:'advanced',split:'five'});assert.deepEqual(s.season.runs[0].entries[0],{day,kind:'rest',...settings});assert.deepEqual(C.migrate(s),s);
});
test('stale tabs, earlier dates and mismatched season cannot advance progress',()=>{
 const s=begin(),claim=expected(s);assert.equal(S.finish(s,'rest',claim,T.shift(day,-1)),false);assert.equal(S.finish(s,'rest',{id:'bad',done:0},day),false);S.finish(s,'rest',claim,day);const snapshot=structuredClone(s);assert.equal(S.finish(s,'rest',claim,T.shift(day,1)),false);assert.deepEqual(s,snapshot);
});
test('unknown or corrupted season backup fails validation without erasing data',()=>{
 for(const change of [s=>s.season.version=2,s=>s.season.level='unknown',s=>s.season.runs[0].entries.push({day:'2026-02-30',kind:'rest',...settings}),s=>s.season.runs[0].entries.push({...s.season.runs[0].entries[0]}),s=>s.season.runs.push({...s.season.runs[0]})]){const s=begin();S.finish(s,'rest',expected(s),day);change(s);assert.equal(C.valid(s),false);assert.throws(()=>C.migrate(s));}
});
test('previous comparison separates modes and groups, aggregates same-day sets',()=>{
 const s=begin(),e={group:'chest',exercise:'ダンベルプレス',mode:'weighted'};log(s,T.shift(day,-1),e);
 T.put(s,{id:'today',day,...e,fatigue:'easy',sets:[{kg:22.5,reps:10},{kg:20,reps:8}]},null,day);
 const cmp=S.comparison(s,e,day);assert.equal(cmp.previous.day,T.shift(day,-1));assert.deepEqual(cmp.delta,{kg:2.5,reps:10});assert.equal(S.comparison(s,{...e,mode:'bodyweight'},day).previous,null);
});
test('guild fatigue, recovery and overlapping muscles suggest rest',()=>{
 const s=begin(),p=S.plan({level:'advanced',split:'five'},5);J.checkIn(s,'tired',day);assert.equal(S.guidance(s,p,day).rest,true);J.checkIn(s,'normal',day);log(s,T.shift(day,-1),{group:'chest',exercise:'プレス',mode:'weighted'});assert.equal(S.guidance(s,p,day).rest,true);
});
