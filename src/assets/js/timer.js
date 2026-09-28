(function () {
  "use strict";
  const C = window.TimerCore, API = "/.netlify/functions/timer", KEY = "accountability_timer_v1";
  const $ = (id) => document.getElementById(id);
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const iso = (ms = Date.now()) => new Date(ms).toISOString();
  const parse = (v) => { try { return JSON.parse(v); } catch (_) { return null; } };
  const empty = () => ({ todos: [], sessions: [], blocks: [], outbox: [], activeSessionId: null, notifiedBlock: null });
  let data = Object.assign(empty(), parse(localStorage.getItem(KEY)) || {});
  let notificationTimer = 0, syncing = false;

  function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
  function activeSession() { return data.sessions.find((s) => s.id === data.activeSessionId && !s.ended_at) || null; }
  function queue(kind, record) {
    record.updated_at = iso();
    const index = data.outbox.findIndex((x) => x.kind === kind && x.record.id === record.id);
    const item = { kind, record: Object.assign({}, record) };
    if (index >= 0) data.outbox[index] = item; else data.outbox.push(item);
    save(); flush();
  }
  function merge(list, incoming) {
    incoming.forEach((record) => {
      const i = list.findIndex((x) => x.id === record.id);
      if (i < 0) list.push(record);
      else if (new Date(record.updated_at || 0) > new Date(list[i].updated_at || 0)) list[i] = record;
    });
  }
  async function flush() {
    if (syncing || !navigator.onLine || !data.outbox.length) return;
    syncing = true; renderSync("Saving…");
    try {
      while (data.outbox.length) {
        const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data.outbox[0]) });
        if (!response.ok) throw new Error("sync failed");
        data.outbox.shift(); save();
      }
      renderSync("");
    } catch (_) { renderSync("Offline"); }
    finally { syncing = false; }
  }
  async function pull() {
    try {
      const response = await fetch(API);
      if (!response.ok) throw new Error("pull failed");
      const remote = await response.json();
      merge(data.todos, remote.todos || []); merge(data.sessions, remote.sessions || []); merge(data.blocks, remote.blocks || []);
      const active = data.sessions.filter((s) => !s.ended_at).sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
      data.activeSessionId = active ? active.id : null; save(); render();
    } catch (_) { if (!navigator.onLine) renderSync("Offline"); }
  }

  function newTodoExpiry(now) { const at = C.expiryFor(now); return at > now ? at : at + 86400000; }
  function expiredTodos(now = Date.now()) { return data.todos.filter((t) => !t.completed_at && !t.acknowledged_at && new Date(t.expires_at).getTime() <= now); }
  function showExpiredIfNeeded() {
    const expired = expiredTodos(); if (!expired.length) return false;
    $("expired-list").replaceChildren(...expired.map((t) => { const li = document.createElement("li"); li.textContent = t.text; return li; }));
    $("expired-takeover").hidden = false; document.body.classList.add("locked"); $("expired-ack").focus(); return true;
  }
  function acknowledgeExpired() {
    const time = iso();
    expiredTodos().forEach((todo) => { todo.acknowledged_at = time; queue("todo", todo); });
    $("expired-takeover").hidden = true; document.body.classList.remove("locked"); render();
  }
  function startSession() {
    const now = iso(), session = { id: uuid(), started_at: now, block_started_at: now, waiting_at: null, ended_at: null, updated_at: now };
    data.sessions.push(session); data.activeSessionId = session.id; data.notifiedBlock = null;
    queue("session", session); scheduleBoundary(); render();
  }
  function stopSession() {
    const session = activeSession(); if (!session) return;
    const status = C.timerStatus(session, Date.now());
    if (status.state === "running" && status.elapsed >= 1000) {
      const now = iso(), block = { id: uuid(), session_id: session.id, started_at: session.block_started_at, ended_at: now, duration_seconds: Math.floor(status.elapsed / 1000), reflection: null, verified_at: now, updated_at: now };
      data.blocks.push(block); queue("block", block);
    }
    session.ended_at = iso(); session.waiting_at = null; data.activeSessionId = null; data.notifiedBlock = null;
    queue("session", session); clearTimeout(notificationTimer); hideCheckin(); render();
  }
  function markWaiting() {
    const session = activeSession(); if (!session || session.waiting_at) return;
    session.waiting_at = iso(new Date(session.block_started_at).getTime() + C.BLOCK_MS);
    queue("session", session); signalBoundary(session); render();
  }
  function submitCheckin(event) {
    event.preventDefault();
    const reflection = $("checkin-input").value.trim(); if (reflection.length < 20) return;
    const session = activeSession(); if (!session) return;
    const verified = iso(), block = { id: uuid(), session_id: session.id, started_at: session.block_started_at, ended_at: session.waiting_at || verified, duration_seconds: 900, reflection, verified_at: verified, updated_at: verified };
    data.blocks.push(block); queue("block", block);
    session.block_started_at = verified; session.waiting_at = null; data.notifiedBlock = null; queue("session", session);
    $("checkin-input").value = ""; updateCheckinCount(); hideCheckin(); scheduleBoundary(); render();
  }
  function signalBoundary(session) {
    const token = session.id + ":" + session.block_started_at;
    if (data.notifiedBlock === token) return;
    data.notifiedBlock = token; save(); playChime();
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification("Time to check in", { body: "What did you do in the last 15 minutes?", tag: "timer-checkin", renotify: false, icon: "/assets/favicons/android-chrome-192x192.png" })).catch(() => {});
    }
  }
  function playChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext, ctx = new AudioContext();
      [0, .12].forEach((delay, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i ? 740 : 554; g.gain.setValueAtTime(.0001, ctx.currentTime + delay); g.gain.exponentialRampToValueAtTime(.12, ctx.currentTime + delay + .01); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + delay + .18); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + .2); });
    } catch (_) {}
  }
  function scheduleBoundary() {
    clearTimeout(notificationTimer);
    const session = activeSession(); if (!session) return;
    const status = C.timerStatus(session, Date.now());
    if (status.state === "waiting") { markWaiting(); return; }
    notificationTimer = setTimeout(markWaiting, status.remaining + 20);
  }

  function todayBlocks() { const key = C.dayKey(new Date()); return data.blocks.filter((b) => C.dayKey(b.verified_at) === key); }
  function renderTimer() {
    const session = activeSession(), status = C.timerStatus(session, Date.now());
    const verified = todayBlocks().reduce((sum, b) => sum + Number(b.duration_seconds), 0);
    $("verified-time").textContent = C.formatDuration(verified, true);
    const button = $("timer-button"), label = $("session-status"); button.classList.toggle("is-running", status.state !== "idle");
    if (status.state === "idle") { button.textContent = "Start"; label.textContent = "Ready when you are."; }
    if (status.state === "running") {
      const seconds = Math.ceil(status.remaining / 1000), m = Math.floor(seconds / 60), s = seconds % 60;
      button.textContent = "Stop"; label.textContent = "Check-in in " + m + ":" + String(s).padStart(2, "0");
    }
    if (status.state === "waiting") { button.textContent = "Stop"; label.textContent = "Waiting for your check-in."; showCheckin(); }
  }
  function renderTodos() {
    const now = Date.now(), todos = data.todos.filter((t) => new Date(t.expires_at).getTime() > now).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const open = todos.filter((t) => !t.completed_at).length; $("todo-count").textContent = todos.length ? open + " open" : "";
    const nodes = todos.map((todo) => {
      const li = document.createElement("li"); li.className = todo.completed_at ? "todo completed" : "todo";
      const button = document.createElement("button"); button.type = "button"; button.className = "todo-toggle"; button.setAttribute("aria-label", (todo.completed_at ? "Mark incomplete: " : "Complete: ") + todo.text); button.setAttribute("aria-pressed", String(!!todo.completed_at));
      const mark = document.createElement("span"); mark.className = "todo-mark"; mark.setAttribute("aria-hidden", "true");
      const text = document.createElement("span"); text.className = "todo-text"; text.textContent = todo.text;
      button.append(mark, text); button.addEventListener("click", () => { todo.completed_at = todo.completed_at ? null : iso(); queue("todo", todo); renderTodos(); }); li.append(button); return li;
    });
    if (!nodes.length) { const empty = document.createElement("li"); empty.className = "empty-todos"; empty.textContent = "Nothing carried over. A clean page."; nodes.push(empty); }
    $("todo-list").replaceChildren(...nodes);
  }
  function renderChart() {
    const days = C.lastSevenDays(new Date()), totals = C.totalsByDay(data.blocks), max = Math.max(8 * 3600, ...Object.values(totals));
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
    $("week-average").textContent = C.formatDuration(days.reduce((sum, d) => sum + (totals[C.dayKey(d)] || 0), 0) / 7, true);
    $("week-chart").replaceChildren(...days.map((day) => {
      const key = C.dayKey(day), seconds = totals[key] || 0, button = document.createElement("button");
      button.type = "button"; button.className = "bar-column"; button.setAttribute("role", "listitem"); button.setAttribute("aria-label", day.toLocaleDateString(undefined, { weekday: "long" }) + ": " + C.formatDuration(seconds, true));
      const value = document.createElement("span"); value.className = "bar-value"; value.textContent = seconds ? C.formatDuration(seconds, true) : "";
      const track = document.createElement("span"); track.className = "bar-track"; const bar = document.createElement("span"); bar.className = "bar"; bar.style.height = (seconds ? Math.max(4, seconds / max * 100) : 0) + "%"; track.append(bar);
      const label = document.createElement("span"); label.className = "bar-label"; label.textContent = formatter.format(day); button.append(value, track, label); button.addEventListener("click", () => showDay(day)); return button;
    }));
  }
  function showDay(day) {
    const key = C.dayKey(day), blocks = data.blocks.filter((b) => C.dayKey(b.verified_at) === key && b.reflection);
    $("detail-title").textContent = day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const nodes = blocks.map((b) => { const li = document.createElement("li"), time = document.createElement("time"), p = document.createElement("p"); time.textContent = new Date(b.verified_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); p.textContent = b.reflection; li.append(time, p); return li; });
    if (!nodes.length) { const li = document.createElement("li"); li.className = "no-checkins"; li.textContent = "No written check-ins."; nodes.push(li); }
    $("detail-list").replaceChildren(...nodes); $("day-detail").hidden = false;
  }
  function renderSync(text) { $("sync-status").textContent = text; }
  function render() { renderTimer(); renderTodos(); renderChart(); }
  function showCheckin() { if (!$("expired-takeover").hidden) return; $("checkin-takeover").hidden = false; document.body.classList.add("locked"); setTimeout(() => $("checkin-input").focus(), 30); }
  function hideCheckin() { $("checkin-takeover").hidden = true; if ($("expired-takeover").hidden) document.body.classList.remove("locked"); }
  function updateCheckinCount() { const length = $("checkin-input").value.trim().length; $("checkin-count").textContent = length + " / 20"; $("checkin-submit").disabled = length < 20; }
  function addTodo(event) {
    event.preventDefault(); const input = $("todo-input"), text = input.value.trim(); if (!text) return;
    const now = Date.now(), todo = { id: uuid(), text, created_at: iso(now), expires_at: iso(newTodoExpiry(now)), completed_at: null, acknowledged_at: null, updated_at: iso(now) };
    data.todos.push(todo); queue("todo", todo); input.value = ""; $("todo-form").hidden = true; $("add-button").hidden = false; renderTodos();
  }
  async function enableNotifications() { const result = await Notification.requestPermission(); $("notification-button").hidden = result !== "default"; }
  function reconcile() { const session = activeSession(); if (session && C.timerStatus(session, Date.now()).state === "waiting") markWaiting(); render(); }
  function bind() {
    $("timer-button").addEventListener("click", () => activeSession() ? stopSession() : startSession());
    $("add-button").addEventListener("click", () => { $("todo-form").hidden = false; $("add-button").hidden = true; $("todo-input").focus(); });
    $("todo-form").addEventListener("submit", addTodo);
    $("todo-input").addEventListener("keydown", (event) => { if (event.key === "Enter") addTodo(event); });
    $("todo-input").addEventListener("blur", () => { if (!$("todo-input").value.trim()) { $("todo-form").hidden = true; $("add-button").hidden = false; } });
    $("checkin-input").addEventListener("input", updateCheckinCount); $("checkin-form").addEventListener("submit", submitCheckin); $("checkin-stop").addEventListener("click", stopSession);
    $("expired-ack").addEventListener("click", acknowledgeExpired); $("detail-close").addEventListener("click", () => $("day-detail").hidden = true); $("notification-button").addEventListener("click", enableNotifications);
    addEventListener("online", () => { flush(); pull(); }); addEventListener("focus", reconcile); document.addEventListener("visibilitychange", () => { if (!document.hidden) reconcile(); });
  }
  function init() {
    $("today-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    if ("Notification" in window) $("notification-button").hidden = Notification.permission !== "default";
    bind(); render(); showExpiredIfNeeded(); reconcile(); scheduleBoundary(); pull(); flush();
    setInterval(renderTimer, 1000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/timer-sw.js", { scope: "/timer/" }).catch(() => {});
  }
  init();
})();
