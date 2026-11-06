// The sender uses an empty RFC 8030 push. Notification copy stays on the device.
const text = new TextEncoder();
const minute = 60000;
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const digest = async input => b64(await crypto.subtle.digest('SHA-256', text.encode(input)));
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export function localClock(time, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(time);
  const p = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return { day: p.year + '-' + p.month + '-' + p.day, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export function reminderPlan(device, now) {
  const local = localClock(now, device.zone);
  const focusToday = device.focusEnd && (device.focusEnd >= now || localClock(device.focusEnd, device.zone).day === local.day);
  const idle = device.activeDay !== local.day && device.sentDay !== local.day && !focusToday;
  const due = idle && local.minutes >= 1200 && local.minutes < 1260;
  // Recheck local time on waking so DST never causes a send in the wrong hour.
  const delta = (1200 - local.minutes + 1440) % 1440 || 1440;
  return { day: local.day, due, next: now - now % minute + Math.min(delta, 360) * minute };
}
export function validEndpoint(value) {
  try {
    const u = new URL(value);
    return typeof value === 'string' && value.length < 3000 && u.protocol === 'https:' &&
      !u.username && !u.password && !u.port && !u.hash && u.pathname.length > 1 &&
      (u.hostname === 'web.push.apple.com' || u.hostname.endsWith('.push.apple.com') ||
       u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' ||
       u.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}
function object(env, name) { return env.REMINDERS.get(env.REMINDERS.idFromName(name)); }

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    if (origin && origin !== env.APP_ORIGIN) return json({error:'origin'}, 403);
    const cors = { 'Access-Control-Allow-Origin': env.APP_ORIGIN, 'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type', 'Vary':'Origin', 'Cache-Control':'no-store' };
    if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
    const path = new URL(req.url).pathname;
    let reply;
    if (req.method === 'GET' && path === '/key') {
      reply = await object(env, 'signer').fetch('https://internal/key');
    } else if (path === '/device' && ['POST','DELETE'].includes(req.method) && origin === env.APP_ORIGIN) {
      if (!req.headers.get('Content-Type')?.startsWith('application/json') || Number(req.headers.get('Content-Length')) > 6000) return json({error:'body'}, 400);
      const raw = await req.text();
      let body;
      try { if (raw.length <= 6000) body = JSON.parse(raw); } catch { /* Rejected below. */ }
      if (!body || !validEndpoint(body.endpoint) || !/^[\w-]{43}$/.test(body.token || '')) return json({error:'device'}, 400);
      const id = await digest(body.endpoint);
      reply = await object(env, 'device-' + id).fetch('https://internal/device', {
        method: req.method, body: JSON.stringify({...body, token: await digest(body.token)})
      });
    } else return new Response('Not found', { status:404, headers:cors });
    return new Response(reply.body, {status:reply.status, headers:{...cors, 'Content-Type':'application/json'}});
  }
};

export class Reminder {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.storage = ctx.storage; }
  async key() {
    let key = await this.storage.get('vapid');
    if (!key) {
      const pair = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
      key = { public: b64(await crypto.subtle.exportKey('raw',pair.publicKey)), private:await crypto.subtle.exportKey('jwk',pair.privateKey) };
      await this.storage.put('vapid',key);
    }
    return key;
  }
  async send(endpoint) {
    const key = await this.key();
    const host = new URL(endpoint).origin;
    const now = Math.floor(Date.now()/1000);
    const jwtKey = 'jwt:' + host;
    let auth = await this.storage.get(jwtKey);
    if (!auth || auth.expires < now + 3600) {
      const expires = now + 12*3600;
      const encoded = data => b64(text.encode(JSON.stringify(data)));
      const unsigned = encoded({typ:'JWT',alg:'ES256'}) + '.' + encoded({aud:host,exp:expires,sub:'https://github.com/uverluv755-ui/solo-life'});
      const privateKey = await crypto.subtle.importKey('jwk',key.private,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
      const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,text.encode(unsigned));
      auth = {expires, jwt:unsigned + '.' + b64(signature)};
      await this.storage.put(jwtKey,auth);
    }
    const result = await fetch(endpoint, {method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),
      headers:{Authorization:'vapid t=' + auth.jwt + ', k=' + key.public,TTL:'900',Topic:'solo-life-inactivity',Urgency:'normal'},
      body: new Uint8Array(0)});
    return json({status:result.status});
  }
  async fetch(req) {
    const path = new URL(req.url).pathname;
    // Serialize access so key creation, activity, cancellation and alarms agree.
    return this.ctx.blockConcurrencyWhile(async () => {
      if (path === '/key') return json({publicKey:(await this.key()).public});
      if (path === '/send') {
        const {endpoint} = await req.json();
        return validEndpoint(endpoint) ? this.send(endpoint) : json({status:400});
      }
      const b = await req.json(), previous = await this.storage.get('device');
      if (previous && previous.token !== b.token) return json({error:'owner'}, 403);
      if (req.method === 'DELETE') {
        await this.storage.deleteAlarm();
        await this.storage.delete('device');
        return json({enabled:false});
      }
      const now = Date.now();
      let day;
      try { day = localClock(now, b.zone).day; } catch { return json({error:'timezone'},400); }
      if (typeof b.zone !== 'string' || b.zone.length > 80 || (b.activeDay !== null && b.activeDay !== day) ||
          (b.focusEnd !== null && !(Number.isSafeInteger(b.focusEnd) && b.focusEnd > 0 && b.focusEnd <= now + 46*minute))) return json({error:'activity'},400);
      const device = { endpoint:b.endpoint, token:b.token, zone:b.zone, activeDay:b.activeDay || previous?.activeDay || null,
        focusEnd:b.focusEnd, sentDay:previous?.sentDay || null, lastDelivery:previous?.lastDelivery || null };
      const plan = reminderPlan(device,now);
      await this.storage.put('device',device);
      await this.storage.setAlarm(plan.due ? Math.min((await this.storage.getAlarm()) ?? Infinity, now + minute) : plan.next);
      return json({enabled:true, nextCheck:await this.storage.getAlarm(), lastDelivery:device.lastDelivery});
    });
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const device = await this.storage.get('device');
      if (!device) return;
      const now = Date.now(), plan = reminderPlan(device,now);
      await this.storage.setAlarm(plan.next);
      if (!plan.due) return;
      // Persist first. A retry after an ambiguous network failure must not send twice.
      device.sentDay = plan.day;
      await this.storage.put('device',device);
      let status;
      try {
        const reply = await object(this.env,'signer').fetch('https://internal/send',{method:'POST',body:JSON.stringify({endpoint:device.endpoint})});
        status = (await reply.json()).status;
      } catch { status = 0; }
      device.lastDelivery = {day:plan.day, status};
      await this.storage.put('device',device);
      if ([404,410].includes(status)) {
        await this.storage.deleteAlarm(); await this.storage.delete('device');
      } else if ((status === 429 || status >= 500) && localClock(now,device.zone).minutes < 1250) {
        device.sentDay = null;
        await this.storage.put('device',device);
        await this.storage.setAlarm(now + 10*minute);
      }
    });
  }
}
