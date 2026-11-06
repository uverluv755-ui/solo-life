import test from 'node:test';
import assert from 'node:assert/strict';
import { Reminder, localClock, reminderPlan, validEndpoint } from '../notifications/worker.mjs';

test('20:00 local, once per day, including half-hour time zones and DST', () => {
  const at = s => Date.parse('2026-11-06T' + s + '+09:00');
  const d = {zone:'Asia/Tokyo'};
  assert.equal(reminderPlan(d,at('19:59')).due,false);
  assert.equal(reminderPlan(d,at('19:59')).next,at('20:00'));
  assert.equal(reminderPlan(d,at('20:00')).due,true);
  assert.equal(reminderPlan(d,at('21:00')).due,false);
  assert.equal(reminderPlan({...d,activeDay:'2026-11-06'},at('20:00')).due,false);
  assert.equal(reminderPlan({...d,sentDay:'2026-11-06'},at('20:00')).due,false);
  assert.equal(reminderPlan({...d,focusEnd:at('20:05')},at('20:00')).due,false);
  assert.equal(reminderPlan({...d,focusEnd:at('19:05')},at('20:00')).due,false);
  assert.equal(localClock(Date.parse('2026-11-06T14:30Z'),'Asia/Kolkata').minutes,1200);
  assert.equal(localClock(Date.parse('2026-11-02T01:00Z'),'America/New_York').minutes,1200);
});
test('delivery endpoints are limited to HTTPS browser push providers', () => {
  for (const value of ['http://web.push.apple.com/x','https://web.push.apple.com.attacker.test/x','https://fcm.googleapis.com:9443/x',
    'https://127.0.0.1/x','https://example.com/?web.push.apple.com','https://user@web.push.apple.com/x']) assert.equal(validEndpoint(value),false);
  assert.ok(validEndpoint('https://web.push.apple.com/example'));
});
test('alarm dispatch, duplicate suppression, activity and cancellation share device state', async t => {
  const now = Date.parse('2026-11-06T20:05:00+09:00');
  t.mock.method(Date,'now',() => now);
  const records = new Map();
  let alarm, sends = 0;
  const storage = {get:k => records.get(k), put:(k,v) => records.set(k,structuredClone(v)),delete:k => records.delete(k),
    setAlarm:value => {alarm = value;}, getAlarm:() => alarm,deleteAlarm:() => {alarm = undefined;}};
  const sender = {fetch:async () => { sends++; return Response.json({status:201}); }};
  const obj = new Reminder({storage,blockConcurrencyWhile:fn => fn()}, {REMINDERS:{idFromName:s=>s,get:()=>sender}});
  const device = {token:'owner',endpoint:'https://web.push.apple.com/test',zone:'Asia/Tokyo',activeDay:null,focusEnd:null};
  const update = (body,method='POST') => obj.fetch(new Request('https://internal/device',{method,body:JSON.stringify(body)}));
  assert.equal((await update(device)).status,200);
  assert.equal(alarm,now+60000);
  await obj.alarm(); await obj.alarm();
  assert.equal(sends,1);
  assert.equal((await update({...device,token:'wrong'},'DELETE')).status,403);
  await update(device,'DELETE');
  assert.equal(alarm,undefined);
  await obj.alarm(); assert.equal(sends,1);
  await update({...device,activeDay:'2026-11-06'}); await update(device);
  await obj.alarm(); assert.equal(sends,1);
});
