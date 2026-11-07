const assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../progress.js'),D=C.difficulty;
module.exports=async(page,url,prefix,setOffline=value=>page.context().setOffline(value))=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('solo-life-v01')));
  const dismiss=async()=>{if(await page.locator('#awakening[open]').count())await page.locator('#continueGrowth').click();};
  const tab=async id=>{await dismiss();await page.locator('[data-tab="'+id+'"]').click();};
  await page.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await page.goto(url);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.getByRole('button',{name:'実力に合わせて難易度を選ぶ'}).click();
  await page.locator('#difficulty-study').selectOption('B');await page.locator('#habitGoal').selectOption('study');
  await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('solo-life-v01'));return s.habitGoal==='study'&&s.difficulty?.levels.study==='B';});
  await page.waitForFunction(()=>document.querySelector('#dailyOffers').textContent.includes('60分'));
  const row=page.locator('#dailyOffers .quest').filter({hasText:'勉強 · B'}).first();
  const name=await row.locator('.name').evaluate(e=>e.firstChild.textContent);
  const other=await page.context().newPage();await other.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await other.goto(url);
  await Promise.all([row.locator('button').evaluate(b=>b.click()),other.getByRole('button',{name:name+'を達成',exact:true}).evaluate(b=>b.click())]);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).totalXp===20);await other.close();
  await page.locator('#difficulty-study').selectOption('A');
  assert.equal((await save()).totalXp,20);assert.equal((await save()).daily['2026-11-07'].quests,1);
  assert.ok(await page.getByRole('button',{name:name+'を達成',exact:true}).isDisabled());
  await page.locator('#difficultyFeedback').getByRole('button',{name:'余裕',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).daily['2026-11-07'].catalogLog[0].effort==='easy');
  await page.reload();await page.locator('#difficultySettings summary').click();assert.equal(await page.locator('#difficulty-study').inputValue(),'A');
  await page.locator('#difficulty-walk').selectOption('A');await page.locator('#habitGoal').selectOption('walk');
  const walk=page.locator('#guildSuggestions .guild-offer').filter({hasText:'45分'}).first();await walk.locator('button').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).plans?.length===1);
  await page.locator('#planList button').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).totalXp===40);
  await page.locator('#guildFatigue').selectOption('rest');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).journey?.checkIn?.fatigue==='rest');
  assert.equal(await page.locator('#guildSuggestions .guild-offer').count(),0);
  assert.equal(await page.locator('#dailyOffers .quest:not(.completed)').count(),0);
  assert.equal((await save()).totalXp,40);
  await page.locator('#guildFatigue').selectOption('normal');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).journey?.checkIn?.fatigue==='normal');
  // Separate days of effort are imported through the same backup path as real saves.
  const seeded=await save();D.setRank(seeded,'work','C');const q=D.catalog.find(q=>q.category==='work'&&q.rank==='C');
  for(const day of ['2026-11-01','2026-11-03','2026-11-05']) {
    C.putPlan(seeded,{id:'seed-'+day,name:q.name,stat:q.stat,start:day,weekdays:[]});
    C.completePlan(seeded,'seed-'+day,day,new Date(day+'T12:00:00+09:00'));D.feedback(seeded,q.key,'easy',day);
  }
  await tab('records');await page.locator('#import').setInputFiles({name:'difficulty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seeded))});
  await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');await tab('home');
  const advice=page.locator('#difficultyAdvice .difficulty-advice').filter({hasText:'仕事 · C'});await advice.getByRole('button',{name:'Bを試す'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).difficulty.levels.work==='B');assert.equal((await save()).totalXp,seeded.totalXp);
  for(const width of [320,375,390,430,1024]) {
    await page.setViewportSize({width,height:844});
    for(const id of ['home','missions','records','journey']) {await tab(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' overflow '+width);}
  }
  await page.setViewportSize({width:390,height:844});await tab('home');
  if(await page.locator('#difficultySettings').getAttribute('open')===null)await page.locator('#difficultySettings summary').click();
  await page.locator('#difficultySettings').screenshot({path:prefix+'-settings.png',scale:'css',animations:'disabled'});
  await page.locator('#difficultyAdvice').screenshot({path:prefix+'-guild.png',scale:'css',animations:'disabled'});
  await tab('records');const snapshot=await save();const event=page.waitForEvent('download');await page.locator('#export').click();assert.deepEqual(JSON.parse(fs.readFileSync(await(await event).path())),snapshot);
  await setOffline(true);await page.reload();await tab('home');
  assert.deepEqual(await save(),snapshot);await page.locator('#difficultySettings summary').click();await page.locator('#difficulty-study').selectOption('D');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).difficulty.levels.study==='D');await page.reload();assert.equal((await save()).difficulty.levels.study,'D');
  await setOffline(false);const prior=await save();await page.locator('#difficultySettings summary').click();
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});
  await page.locator('#difficulty-study').selectOption('A');await page.locator('#storageWarning').waitFor({state:'visible'});assert.deepEqual(await save(),prior);
  assert.deepEqual(errors,[]);
};
