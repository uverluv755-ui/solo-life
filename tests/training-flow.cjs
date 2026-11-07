const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async function(page,url,prefix,offline){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('solo-life-v01')));
 const tab=id=>page.locator('[data-tab="'+id+'"]').click();
 await page.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await page.goto(url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const before=await save();assert.equal(await page.locator('#realDays').innerText(),'0日');
 await page.locator('#startWorkout').click();await page.locator('#workoutDate').fill('2026-11-06');await page.locator('#workoutExercise').fill('ベンチプレス');
 await page.locator('.set-kg').fill('40');await page.locator('.set-reps').fill('10');await page.locator('#addSet').click();await page.locator('.set-kg').nth(1).fill('42.5');await page.locator('.set-reps').nth(1).fill('8');
 await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training?.sessions.length===1);
 assert.equal(await page.locator('#realSets').innerText(),'2セット');assert.equal(await page.locator('[data-armor="chest"].forged').count(),1);
 assert.deepEqual(Object.fromEntries(Object.entries(await save()).filter(([k])=>k!=='training')),before);
 await page.locator('#startWorkout').click();await page.locator('#copyLast').click();assert.equal(await page.locator('#workoutExercise').inputValue(),'ベンチプレス');assert.equal(await page.locator('.set-row').count(),2);
 await page.locator('.set-kg').nth(0).fill('45');await page.locator('#workoutFatigue').selectOption('hard');await page.locator('#workoutSubmit').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.sessions.length===2);
 assert.match(await page.locator('#trainingReceipt').innerText(),/自己ベスト更新/);assert.ok(await page.locator('#guildWorkout').isHidden());
 await page.locator('#restTraining').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.restDays.length===1);
 assert.equal((await save()).training.careDays.length,2);assert.equal(await page.locator('#guildFatigue').inputValue(),'rest');
 await page.locator('#viewTraining').click();assert.match(await page.locator('#personalBests').innerText(),/45 kg × 10 回/);
 await page.locator('#trainingHistory button').filter({hasText:'編集'}).first().click();await page.locator('.set-kg').first().fill('30');await page.locator('#workoutSubmit').click();
 await page.waitForFunction(()=>!document.getElementById('workoutDialog').open);assert.match(await page.locator('#personalBests').innerText(),/42.5 kg × 8 回/);
 // Two windows: stale edit must retain its draft and cannot overwrite a correction.
 await page.locator('#trainingHistory button').filter({hasText:'編集'}).first().click();
 const another=await page.context().newPage();await another.clock.install({time:new Date('2026-11-07T12:00:00+09:00')});await another.goto(url);await another.locator('[data-tab="records"]').click();await another.locator('#trainingHistory button').filter({hasText:'編集'}).first().click();await another.locator('.set-reps').first().fill('11');await another.locator('#workoutSubmit').click();await another.waitForFunction(()=>!document.getElementById('workoutDialog').open);
 await page.locator('.set-reps').first().fill('12');await page.locator('#workoutSubmit').click();await page.locator('#workoutError').waitFor({state:'visible'});assert.match(await page.locator('#workoutError').innerText(),/別の画面/);assert.equal((await save()).training.sessions[1].sets[0].reps,11);await page.locator('#closeWorkout').click();await another.close();
 await tab('home');await page.locator('#startWorkout').click();await page.locator('#workoutGroup').selectOption('legs');await page.locator('#workoutExercise').fill('スクワット');await page.locator('#workoutMode').selectOption('bodyweight');await page.locator('.set-reps').fill('15');
 for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('#workoutDialog').evaluate(e=>e.scrollWidth<=e.clientWidth),'dialog overflow '+width);}
 await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.sessions.length===3);
 await tab('records');await page.locator('#trainingFilter').selectOption('legs');assert.equal(await page.locator('.personal-best').count(),1);assert.match(await page.locator('#personalBests').innerText(),/15 回/);await page.locator('#trainingFilter').selectOption('all');
 const snapshot=await save(),download=page.waitForEvent('download');await page.locator('#export').click();assert.deepEqual(JSON.parse(fs.readFileSync(await (await download).path())),snapshot);
 await page.locator('#import').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');assert.deepEqual(await save(),snapshot);
 const invalid=structuredClone(snapshot);invalid.training.version=999;await page.locator('#import').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('読み込めません'));assert.deepEqual(await save(),snapshot);
 // Recovery can finish a chapter and unlock a title without awarding XP.
 const milestone=structuredClone(snapshot);milestone.training.sessions=[];milestone.training.careDays=['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05'];milestone.training.restDays=[...milestone.training.careDays];
 await page.locator('#import').setInputFiles({name:'milestone.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(milestone))});await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');await tab('home');await page.locator('#restTraining').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.careDays.length===6);
 assert.match(await page.locator('#trainingReceipt').innerText(),/討伐/);assert.match(await page.locator('#forgeBossName').innerText(),/第2章/);assert.equal(await page.locator('#forgeTitle').innerText(),'暁の守護者');assert.equal((await save()).totalXp,snapshot.totalXp);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.forge-portrait').evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 await tab('records');await page.locator('#import').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});await page.waitForFunction(()=>document.getElementById('toast').textContent==='復元しました');await page.reload();
 for(const width of [320,375,390,430,1024]){await page.setViewportSize({width,height:844});for(const id of ['home','records','journey','missions']){await tab(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' overflow '+width);}}
 await page.setViewportSize({width:390,height:844});await tab('home');await page.clock.fastForward(5000);await page.screenshot({path:prefix+'-home.png',fullPage:false,animations:'disabled',scale:'css'});
 await page.locator('#startWorkout').click();await page.locator('#workoutExercise').fill('ベンチプレス');await page.locator('#copyLast').click();await page.locator('#workoutDialog').screenshot({path:prefix+'-log.png',animations:'disabled',scale:'css'});await page.locator('#closeWorkout').click();
 await tab('records');await page.locator('#trainingRecords').screenshot({path:prefix+'-records.png',animations:'disabled',scale:'css'});
 await offline(true);await page.reload();await tab('home');assert.equal(await page.locator('#realSets').innerText(),'5セット');
 await page.locator('#startWorkout').click();await page.locator('#workoutExercise').fill('オフライン記録');await page.locator('.set-kg').fill('5');await page.locator('.set-reps').fill('8');await page.locator('#workoutSubmit').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.sessions.length===4);await offline(false);await page.reload();
 // Deletion recalculates measurements, never revokes earned progress.
 await tab('records');await page.locator('#trainingHistory button').filter({hasText:'削除'}).first().click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.sessions.length===3);assert.equal((await save()).training.careDays.length,2);
 await tab('home');await page.locator('#startWorkout').click();await page.locator('#workoutExercise').fill('保存失敗テスト');await page.locator('.set-kg').fill('5');await page.locator('.set-reps').fill('8');const old=await save();
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};});await page.locator('#workoutSubmit').click();await page.locator('#workoutError').waitFor({state:'visible'});assert.equal(await page.locator('#workoutExercise').inputValue(),'保存失敗テスト');assert.deepEqual(await save(),old);assert.deepEqual(errors,[]);
};
