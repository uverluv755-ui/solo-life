// Runs in fresh, isolated browser contexts; it never reads a user's browser save.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const base='https://uverluv755-ui.github.io/solo-life/';
const output=process.env.TEST_OUTPUT||path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const names=['index.html','app.js','progress.js','habits.js','difficulty.js','difficulty-ui.js','journey.js','journey-ui.js','planner.js','reminders.js','app.css','journey.css','training.js','training-ui.js','training.css','season.js','season-ui.js','season.css','sw.js','manifest.webmanifest','push-config.json','icon-180.png','icon-192.png','icon-512.png','blue-flame.webp'];
(async()=>{
 for(const name of names){const response=await fetch(base+name+'?verify='+version+'-'+Date.now(),{cache:'no-store'});assert.equal(response.status,200,name);const remote=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(root,name));if(/\.(png|webp)$/.test(name))assert.ok(remote.equals(local),name);else assert.equal(remote.toString().replace(/\r\n/g,'\n'),local.toString().replace(/\r\n/g,'\n'),name+' differs');}
 console.log('All '+names.length+' deployed assets match v'+version+'.');
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
  try{
   const context=await browser.newContext({...devices['iPhone 13'],timezoneId:'Asia/Tokyo',locale:'ja-JP'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   assert.equal(await page.locator('.version').innerText(),'v'+version.split('.').slice(0,2).join('.'));
   await page.locator('.season-settings summary').click();await page.locator('#seasonLevel').selectOption('advanced');await page.locator('#seasonSplit').selectOption('five');await page.locator('#seasonStart').click();await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('solo-life-v01')).season);await page.locator('.season-settings summary').click();
   await page.locator('#startWorkout').click();await page.locator('#workoutExercise').fill('ベンチプレス');await page.locator('.set-kg').fill('40');await page.locator('.set-reps').fill('10');await page.locator('#addSet').click();await page.locator('#workoutSubmit').click();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training?.sessions.length===1);await page.locator('#restTraining').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).training.restDays.length===1);
   await page.reload();assert.equal(await page.locator('#realSets').innerText(),'2セット');assert.equal(await page.locator('#forgeDays').innerText(),'1日');
   assert.ok(await page.evaluate(()=>window.SoloLife.valid(JSON.parse(localStorage.getItem('solo-life-v01')))));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('solo-life-v01')).totalXp),0);
   assert.equal(await page.locator('#seasonMenuTitle').innerText(),'胸の鍛錬');assert.equal(await page.locator('.season-exercise').count(),3);
   await page.clock.fastForward(5000);await page.locator('#seasonPanel').screenshot({path:path.join(output,'solo-life-v017-'+engine+'-season.png'),animations:'disabled',scale:'css'});
   await page.locator('#seasonComplete').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('solo-life-v01')).season.runs[0].entries.length===1);await page.reload();assert.match(await page.locator('#seasonProgressText').innerText(),/1 \/ 66/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('solo-life-v01')).totalXp),0);
   await page.clock.fastForward(5000);await page.screenshot({path:path.join(output,'solo-life-v017-'+engine+'-home.png'),animations:'disabled',scale:'css'});
   await page.locator('#viewTraining').click();assert.match(await page.locator('#personalBests').innerText(),/40 kg × 10 回/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#trainingRecords').screenshot({path:path.join(output,'solo-life-v017-'+engine+'-records.png'),animations:'disabled',scale:'css'});
   if(engine==='chromium'){await context.setOffline(true);await page.reload();assert.equal(await page.locator('#realSets').innerText(),'2セット');assert.match(await page.locator('#seasonProgressText').innerText(),/1 \/ 66/);}
   assert.deepEqual(errors,[]);console.log(engine+': live mobile UI, set log, rest, PB, reload, unchanged XP, valid save'+(engine==='chromium'?', offline':'')+' passed.');await context.close();
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
