(() => {
  'use strict';
  const key = 'solo-life-reminder-device-v1';
  const noticeKey = 'solo-life-last-in-app-reminder';
  const configURL = './push-config.json?v=0.14.0';
  const bytes = base64 => Uint8Array.from(atob(base64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  function token() {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  }
  function init(getSave, toast) {
    const status = document.getElementById('pushStatus'), button = document.getElementById('pushToggle');
    if (!status || !button) return;
    const details = button.closest('details');
    let device, config, reg, busy = false, running = false, again = false, retry, lastPayload, toastDay;
    try { device = JSON.parse(localStorage.getItem(key)); } catch { /* In-app reminders still work. */ }
    function store(next) {
      if (next) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      device = next;
    }
    function activity() {
      const s = getSave(), day = window.SoloLife.day(), record = s.daily[day];
      return { zone:Intl.DateTimeFormat().resolvedOptions().timeZone,
        activeDay:record?.quests || record?.focus || window.SoloJourney?.fatigue(s, day) === 'rest' ? day : null, focusEnd:s.focusEnd ?? null };
    }
    function paint() {
      button.hidden = !device && (!config || !reg || Notification.permission === 'denied');
      button.disabled = busy;
      button.textContent = device ? '端末通知をオフにする' : '端末通知をオンにする';
    }
    async function request(state, method, fields = {}) {
      const reply = await fetch(state.service + '/device', {method, cache:'no-store', credentials:'omit',
        signal:AbortSignal.timeout(10000), headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:state.endpoint, token:state.token, ...fields})});
      if (!reply.ok && !(method === 'DELETE' && reply.status === 403)) throw new Error('Notification service unavailable');
    }
    async function flush() {
      if (!device) return;
      if (running) { again = true; return; }
      running = true;
      const current = device;
      try {
        const fields = activity(), serialized = JSON.stringify(fields);
        if (current.stopping) {
          await request(current,'DELETE');
          if (device === current) { store(null); lastPayload = null; status.textContent = '端末通知をオフにしました。'; }
        } else if (serialized !== lastPayload) {
          await request(current,'POST',fields);
          if (device === current) {
            lastPayload = serialized;
            if (!device.confirmed) store({...device,confirmed:true});
            status.textContent = '端末通知はオンです。未達成の日の20時ごろに届きます。';
          }
        }
        clearTimeout(retry);
      } catch {
        status.textContent = current.stopping ? 'この端末の通知は停止しました。接続後に登録を削除します。' :
          '配信サーバーと同期できていません。接続後に再試行します。';
        clearTimeout(retry); retry = setTimeout(flush, 5*60000);
      } finally {
        running = false; paint();
        if (again) { again = false; void flush(); }
      }
    }
    function sync() {
      void flush();
      if (document.hidden || (device?.confirmed && !device.stopping && window.Notification?.permission === 'granted')) return;
      const now = new Date(), today = window.SoloLife.day(now), a = activity();
      if (now.getHours() !== 20 || a.activeDay || a.focusEnd || toastDay === today) return;
      try {
        if (localStorage.getItem(noticeKey) === today) return;
        localStorage.setItem(noticeKey,today);
      } catch { /* Dedupe for this session when storage is unavailable. */ }
      toastDay = today;
      toast('今日の達成はまだです。ホームの緊急クエストは1分で取り組めます。');
    }
    async function prepare() {
      if (busy) return;
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      if (iphone && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) {
        status.textContent = 'iPhoneの端末通知は、Safariの共有 → ホーム画面に追加 → 追加したアイコンから開くと設定できます（iOS 16.4以降）。';
        return;
      }
      if (!('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window)) {
        status.textContent = 'この環境では、アプリを開いている間にお知らせします。'; return;
      }
      if (Notification.permission === 'denied' && !device) {
        status.textContent = '端末通知は許可されていません。端末の通知設定から変更できます。'; paint(); return;
      }
      busy = true; paint();
      status.textContent = '通知の接続を確認中…';
      try {
        const cfg = await fetch(configURL,{cache:'no-cache'}).then(r => r.json());
        if (!cfg.service || !cfg.publicKey) throw new Error('Unconfigured');
        const remote = await fetch(cfg.service + '/key',{cache:'no-store',signal:AbortSignal.timeout(8000)}).then(r => r.json());
        if (remote.publicKey !== cfg.publicKey) throw new Error('Unexpected notification server');
        reg = await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject) => setTimeout(reject,8000))]);
        config = cfg;
        status.textContent = device?.confirmed ? '端末通知はオンです。' :
          'オンにすると、この端末の匿名の通知先・達成した日付・タイマー終了時刻・時間帯を配信サーバーに送ります。';
      } catch { config = null; status.textContent = '配信サーバーに接続できません。端末通知の設定にはオンライン接続と稼働中の配信サーバーが必要です。'; }
      finally { busy = false; paint(); }
      if (device) void flush();
    }
    button.onclick = async () => {
      if (busy) return;
      busy = true; paint();
      try {
        if (device) {
          const registration = reg || await navigator.serviceWorker.getRegistration();
          const sub = await registration?.pushManager?.getSubscription();
          if (sub && !(await sub.unsubscribe())) throw new Error('unsubscribe');
          store({...device,stopping:true}); lastPayload = null;
          await flush();
        } else {
          // Enter subscribe directly from the tap so iOS can show its permission prompt.
          const sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(config.publicKey)});
          const next = {endpoint:sub.endpoint,token:token(),service:config.service,confirmed:false};
          try { store(next); } catch (err) { await sub.unsubscribe(); throw err; }
          lastPayload = null; await flush();
        }
      } catch {
        status.textContent = Notification.permission === 'denied' ? '通知が許可されませんでした。端末の通知設定で変更できます。' : '設定を完了できませんでした。接続と端末の通知設定を確認してください。';
      } finally { busy = false; paint(); }
    };
    details.addEventListener('toggle',() => { if (details.open) void prepare(); });
    window.addEventListener('online',() => { lastPayload = null; void flush(); if (details.open) void prepare(); });
    window.addEventListener('storage',e => {
      if (e.key === key) { try { device = JSON.parse(e.newValue); lastPayload = null; paint(); } catch {} }
    });
    return {sync};
  }
  window.SoloReminders = {init};
})();
