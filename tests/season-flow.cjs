const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function(page,url,prefix,offline){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('solo-life-v01')));
 const tab=id=>page.locator('[data-tab="'+id+'"]').click();
 const time=async date=>{await page.clock.setSystemTime(new Date(date+'T12:00:00+09:00'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));};
 await page.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await page.goto(url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const before=await save();await page.locator('#seasonStart').click();await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('solo-life-v01')).season);
 assert.equal((await save()).season.level,'beginner');assert.equal(await page.locator('.season-exercise').count(),3);assert.ok(await page.locator('#seasonComplete').isDisabled());
 await page.locator('.season-exercise button').first().click();assert.equal(await page.locator('#workoutExercise').inputValue(),'椅子スクワット');assert.equal(await page.locator('.set-reps').inputValue(),'');
 await page.locator('.set-reps').fill('8');await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>!document.getElementById('workoutDialog').open);
 assert.match(await page.locator('.season-logged').innerText(),/1セット/);
 // Two tabs can both submit, but the shared save lock allows only one step.
 const another=await page.context().newPage();await another.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await another.goto(url);
 await Promise.all([page.locator('#seasonComplete').evaluate(e=>e.click()),another.locator('#seasonComplete').evaluate(e=>e.click())]);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.runs[0].entries.length===1);assert.equal((await save()).training.careDays.length,1);await another.close();
 assert.equal((await save()).totalXp,before.totalXp);assert.deepEqual((await save()).quests,before.quests);assert.deepEqual((await save()).history,before.history);
 await page.locator('.season-map-details summary').click();assert.equal(await page.locator('.season-node').count(),66);await page.locator('.season-node').nth(65).click();assert.equal(await page.locator('#seasonDay').innerText(),'66');assert.ok(await page.locator('#seasonComplete').isHidden());await page.locator('#seasonToday').click();
 await time('2026-11-08');assert.equal(await page.locator('#seasonDay').innerText(),'02');assert.match(await page.locator('#seasonMenuTitle').innerText(),/回復/);
 await page.locator('#seasonRest').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.runs[0].entries.length===2);assert.equal((await save()).journey.checkIn.fatigue,'rest');assert.equal((await save()).training.careDays.length,2);
 await time('2026-11-12');assert.equal(await page.locator('#seasonDay').innerText(),'03');
 await page.locator('.season-settings summary').click();await page.locator('#seasonLevel').selectOption('advanced');await page.locator('#seasonSplit').selectOption('five');await page.locator('#seasonConfigure').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.split==='five');
 assert.equal(await page.locator('#seasonMenuTitle').innerText(),'脚の鍛錬');assert.equal((await save()).season.runs[0].entries[0].level,'beginner');
 await page.locator('.season-settings summary').click();await page.locator('.season-map-details summary').click();
 for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('#seasonPanel').screenshot({path:prefix+'-season.png',animations:'disabled',scale:'css'});
 await page.locator('.season-exercise button').first().click();assert.equal(await page.locator('.set-row').count(),3);assert.equal(await page.locator('.set-kg').first().inputValue(),'');
 for(let i=0;i<3;i++){await page.locator('.set-kg').nth(i).fill('20');await page.locator('.set-reps').nth(i).fill('8');}await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>!document.getElementById('workoutDialog').open);
 await page.locator('.season-exercise button').first().click();await page.locator('#workoutDate').fill('2026-11-10');for(let i=0;i<3;i++){await page.locator('.set-kg').nth(i).fill('17.5');await page.locator('.set-reps').nth(i).fill('6');}await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>!document.getElementById('workoutDialog').open);
 assert.match(await page.locator('.season-previous').first().innerText(),/2026-11-10/);assert.match(await page.locator('.season-delta').first().innerText(),/\+2.5kg.*\+6回/);
 // Backups include the entire new extension and reject future versions.
 await tab('records');const snapshot=await save(),download=page.waitForEvent('download');await page.locator('#export').click();assert.deepEqual(JSON.parse(fs.readFileSync(await (await download).path())),snapshot);
 await page.locator('#import').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');assert.deepEqual(await save(),snapshot);
 const invalid=structuredClone(snapshot);invalid.season.version=2;await page.locator('#import').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('読み込めません'));assert.deepEqual(await save(),snapshot);
 await tab('home');await offline(true);await page.reload();await page.locator('#seasonComplete').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.runs[0].entries.length===3);await page.reload();assert.match(await page.locator('#seasonProgressText').innerText(),/3 \/ 66/);await offline(false);
 // Total 66 completion and subsequent season preserve the archive.
 const complete=await save();complete.season.runs[0].started='2026-08-01';complete.season.runs[0].entries=Array.from({length:66},(_,i)=>({day:new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10),kind:'rest',level:'beginner',split:'full'}));
 await tab('records');await page.locator('#import').setInputFiles({name:'complete.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(complete))});await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');await tab('home');assert.match(await page.locator('#seasonState').innerText(),/SEASON COMPLETE/);await page.locator('#seasonStart').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.runs.length===2);assert.equal((await save()).season.runs[0].entries.length,66);
 const old=await save();await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});await page.locator('#seasonRest').click();await page.locator('#seasonError').waitFor({state:'visible'});assert.deepEqual(await save(),old);assert.equal(await page.locator('#seasonDay').innerText(),'01');assert.deepEqual(errors,[]);
};
