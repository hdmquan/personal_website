/* ============================================================
   /timer — a minimal speedcube timer (3x3)
   Single file, plain JS, bundled by esbuild.
   - Cube engine (3D cubie model, validated by invariants)
   - Random-move scrambler
   - Cube-net preview
   - Inspection + timer state machine (keyboard + touch)
   - Penalties (+2 / DNF / delete), ao5 / ao12 / mo3 stats
   - VS mode (local only, never synced)
   - Supabase sync via /.netlify/functions/timer, localStorage-first
   ============================================================ */
(function () {
  "use strict";

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  // ============================================================
  // CUBE ENGINE  (faces U=+y D=-y R=+x L=-x F=+z B=-z)
  // ============================================================
  const FACES = ["U", "R", "F", "D", "L", "B"];
  const DIRV = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const vecFace = (v) => {
    for (const f in DIRV) { const d = DIRV[f]; if (d[0] === v[0] && d[1] === v[1] && d[2] === v[2]) return f; }
    return null;
  };
  // clockwise (viewed from outside) rotations
  const MOVES = {
    U: { sel: (c) => c.p[1] === 1,  rot: ([x, y, z]) => [-z, y, x] },
    D: { sel: (c) => c.p[1] === -1, rot: ([x, y, z]) => [z, y, -x] },
    R: { sel: (c) => c.p[0] === 1,  rot: ([x, y, z]) => [x, z, -y] },
    L: { sel: (c) => c.p[0] === -1, rot: ([x, y, z]) => [x, -z, y] },
    F: { sel: (c) => c.p[2] === 1,  rot: ([x, y, z]) => [y, -x, z] },
    B: { sel: (c) => c.p[2] === -1, rot: ([x, y, z]) => [-y, x, z] },
  };
  function solvedCube() {
    const cubies = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const s = {};
          if (y === 1) s.U = "U"; if (y === -1) s.D = "D";
          if (x === 1) s.R = "R"; if (x === -1) s.L = "L";
          if (z === 1) s.F = "F"; if (z === -1) s.B = "B";
          cubies.push({ p: [x, y, z], s });
        }
    return cubies;
  }
  function turn(cubies, name) {
    const m = MOVES[name];
    return cubies.map((c) => {
      if (!m.sel(c)) return c;
      const np = m.rot(c.p), ns = {};
      for (const f in c.s) ns[vecFace(m.rot(DIRV[f]))] = c.s[f];
      return { p: np, s: ns };
    });
  }
  function applyScramble(scr) {
    let c = solvedCube();
    for (const tok of scr.trim().split(/\s+/).filter(Boolean)) {
      const face = tok[0], times = tok.endsWith("2") ? 2 : tok.endsWith("'") ? 3 : 1;
      for (let i = 0; i < times; i++) c = turn(c, face);
    }
    return c;
  }
  // net extraction
  const FACEDEF = {
    U: { right: [1, 0, 0],  down: [0, 0, 1]  },
    L: { right: [0, 0, 1],  down: [0, -1, 0] },
    F: { right: [1, 0, 0],  down: [0, -1, 0] },
    R: { right: [0, 0, -1], down: [0, -1, 0] },
    B: { right: [-1, 0, 0], down: [0, -1, 0] },
    D: { right: [1, 0, 0],  down: [0, 0, -1] },
  };
  const at = (cubies, p) => cubies.find((c) => c.p[0] === p[0] && c.p[1] === p[1] && c.p[2] === p[2]);
  function faceGrid(cubies, face) {
    const n = DIRV[face], { right, down } = FACEDEF[face], out = [];
    for (let r = -1; r <= 1; r++)
      for (let cc = -1; cc <= 1; cc++)
        out.push(at(cubies, [
          n[0] + right[0] * cc + down[0] * r,
          n[1] + right[1] * cc + down[1] * r,
          n[2] + right[2] * cc + down[2] * r,
        ]).s[face]);
    return out;
  }

  // ---------- scrambler (random-move, WCA-style avoidance) ----------
  const SFACES = ["U", "D", "R", "L", "F", "B"];
  const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  const SUF = ["", "'", "2"];
  function scramble(len) {
    len = len || 22;
    const out = [];
    let last = -1, prev = -1;
    while (out.length < len) {
      const f = SFACES[(Math.random() * 6) | 0];
      if (f === last) continue;
      if (AXIS[f] === AXIS[last] && AXIS[last] === AXIS[prev]) continue;
      out.push(f + SUF[(Math.random() * 3) | 0]);
      prev = last; last = f;
    }
    return out.join(" ");
  }

  // ============================================================
  // TIME + STATS
  // ============================================================
  const fmt = (ms) => {
    if (ms == null) return "–";
    const s = ms / 1000;
    if (s >= 60) { const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2); }
    return s.toFixed(2);
  };
  // effective time in ms for a solve, or Infinity for DNF
  const eff = (sv) => sv.penalty === "dnf" ? Infinity : sv.ms + (sv.penalty === "plus2" ? 2000 : 0);
  const label = (sv) => {
    if (sv.penalty === "dnf") return "DNF";
    return fmt(sv.ms + (sv.penalty === "plus2" ? 2000 : 0)) + (sv.penalty === "plus2" ? "+" : "");
  };
  // WCA average of the last n solves (trim best+worst, mean of middle). DNFs count as worst.
  function avgOf(list, n) {
    if (list.length < n) return null;
    const slice = list.slice(-n).map(eff);
    const dnf = slice.filter((x) => x === Infinity).length;
    const trim = n <= 3 ? 0 : 1; // mo3 = plain mean; ao5/ao12 trim 1 each end
    if (dnf > trim) return Infinity;
    const sorted = slice.slice().sort((a, b) => a - b);
    const kept = trim ? sorted.slice(trim, n - trim) : sorted;
    const sum = kept.reduce((a, b) => a + b, 0);
    return sum / kept.length;
  }
  // best rolling average across the whole session
  function bestAvg(list, n) {
    let best = null;
    for (let i = n; i <= list.length; i++) {
      const a = avgOf(list.slice(0, i), n);
      if (a != null && a !== Infinity && (best == null || a < best)) best = a;
    }
    return best;
  }
  const fmtAvg = (a) => a == null ? "–" : a === Infinity ? "DNF" : fmt(a);

  // ============================================================
  // SYNC LAYER  (localStorage-first, Supabase best-effort)
  // ============================================================
  const API = "/.netlify/functions/timer";
  const LS_SOLVES = "cube_solves_v1";
  const LS_OUTBOX = "cube_outbox_v1";

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const Store = {
    solves: load(LS_SOLVES, []),
    outbox: load(LS_OUTBOX, []),
    persist() { save(LS_SOLVES, this.solves); },
    persistOutbox() { save(LS_OUTBOX, this.outbox); },

    add(sv) { this.solves.push(sv); this.persist(); this.queue({ op: "upsert", solve: sv }); },
    update(sv) { this.persist(); this.queue({ op: "upsert", solve: sv }); },
    remove(id) {
      const i = this.solves.findIndex((s) => s.id === id);
      if (i >= 0) { this.solves.splice(i, 1); this.persist(); }
      this.queue({ op: "delete", id });
    },
    clearAll() {
      const ids = this.solves.map((s) => s.id);
      this.solves = []; this.persist();
      ids.forEach((id) => this.queue({ op: "delete", id }));
    },

    queue(op) { this.outbox.push(op); this.persistOutbox(); syncFlush(); },
  };

  let syncing = false;
  function setDot(state) { const d = $("sync-dot"); if (d) d.className = state; }

  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  }

  async function syncFlush() {
    if (syncing || !Store.outbox.length) return;
    syncing = true; setDot("busy");
    try {
      while (Store.outbox.length) {
        const op = Store.outbox[0];
        await post(op);
        Store.outbox.shift(); Store.persistOutbox();
      }
      setDot("ok");
    } catch (e) {
      // offline or function not deployed (e.g. local dev) — keep the queue, try later
      setDot("off");
    } finally { syncing = false; }
  }

  // pull remote and merge in anything we don't have locally (added from another browser)
  async function syncPull() {
    try {
      const r = await fetch(API, { method: "GET" });
      if (!r.ok) throw new Error("http " + r.status);
      const { solves } = await r.json();
      if (!Array.isArray(solves)) return;
      const have = new Set(Store.solves.map((s) => s.id));
      let changed = false;
      for (const s of solves) if (!have.has(s.id)) { Store.solves.push(s); changed = true; }
      if (changed) { Store.solves.sort((a, b) => a.ts - b.ts); Store.persist(); renderStats(); }
      setDot(Store.outbox.length ? "off" : "ok");
    } catch { setDot("off"); }
  }

  // ============================================================
  // MAIN TIMER UI
  // ============================================================
  const opts = Object.assign({ inspection: true, hold: true, cube: true }, load("cube_opts_v1", {}));
  const saveOpts = () => save("cube_opts_v1", opts);

  let curScramble = scramble();
  let scrambleHistory = [curScramble];
  let scrambleIdx = 0;

  // timer state machine
  const S = { IDLE: 0, INSPECT: 1, HOLD: 2, RUNNING: 3, REVIEW: 4 };
  let state = S.IDLE;
  let startT = 0, raf = 0;
  let inspectStart = 0, inspectPenalty = "ok", inspTick = 0;
  let holdTimer = 0, holdReady = false;

  const timeEl = $("time"), hintEl = $("hint");
  const setTime = (txt) => { timeEl.textContent = txt; };
  const cls = (name) => { timeEl.className = name || ""; };
  const hint = (t) => { hintEl.textContent = t; };

  function newScramble() {
    curScramble = scramble();
    scrambleHistory.push(curScramble);
    if (scrambleHistory.length > 50) scrambleHistory.shift();
    scrambleIdx = scrambleHistory.length - 1;
    showScramble();
  }
  function showScramble() {
    $("scramble").textContent = curScramble;
    renderNet(curScramble);
  }
  function renderNet(scr) {
    const cube = applyScramble(scr);
    const net = $("cube-net"); net.innerHTML = "";
    for (const f of ["U", "L", "F", "R", "B", "D"]) {
      const face = el("div", "face " + f);
      for (const color of faceGrid(cube, f)) { const st = el("div", "st " + color); face.appendChild(st); }
      net.appendChild(face);
    }
  }

  // ---- inspection ----
  function startInspect() {
    state = S.INSPECT; inspectStart = performance.now(); inspectPenalty = "ok";
    hidePenaltyBar();
    cls("inspect"); hint("hold to start");
    startInspectTick();
  }
  function startInspectTick() {
    clearInterval(inspTick);
    inspTick = setInterval(() => {
      const t = (performance.now() - inspectStart) / 1000, remain = 15 - t;
      if (t > 17) { setTime("DNF"); cls("warn"); }
      else if (t > 15) { setTime("+2"); cls("warn"); }
      else { setTime(Math.max(0, Math.ceil(remain)).toString()); cls(remain <= 4 ? "warn" : "inspect"); }
    }, 50);
  }
  function stopInspect() { clearInterval(inspTick); inspTick = 0; }

  // ---- running ----
  function startRun() {
    // lock in the inspection penalty from elapsed time at the moment the solve starts
    if (opts.inspection && inspectStart) {
      const e = (performance.now() - inspectStart) / 1000;
      inspectPenalty = e > 17 ? "dnf" : e > 15 ? "plus2" : "ok";
    } else inspectPenalty = "ok";
    stopInspect();
    state = S.RUNNING; startT = performance.now();
    cls("running"); hint("");
    const tick = () => {
      if (state !== S.RUNNING) return;
      setTime(fmt(performance.now() - startT));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function stopRun() {
    cancelAnimationFrame(raf);
    const ms = performance.now() - startT;
    state = S.IDLE;
    const sv = { id: uid(), ms: Math.round(ms), penalty: inspectPenalty, scramble: curScramble, puzzle: "333", ts: Date.now() };
    inspectStart = 0;
    inputLockUntil = performance.now() + INPUT_LOCK_MS;   // ignore input briefly after a stop
    Store.add(sv);
    setTime(label(sv)); cls(sv.penalty === "dnf" ? "warn" : "");
    hint("any key / tap to inspect");
    renderStats();
    showPenaltyBar(sv.id);
    newScramble();
  }

  // ---- hold-to-start arming ----
  function beginHold() {
    stopInspect();                 // freeze the countdown so the ready/hold colour shows
    state = S.HOLD; holdReady = false;
    setTime(currentDisplayForHold()); cls("holding");
    if (opts.hold) {
      holdTimer = setTimeout(() => { holdReady = true; cls("ready"); }, 300);
    } else { holdReady = true; }
  }
  function currentDisplayForHold() {
    if (opts.inspection && inspectStart) {
      const t = (performance.now() - inspectStart) / 1000;
      if (t > 17) return "DNF"; if (t > 15) return "+2";
      return Math.max(0, Math.ceil(15 - t)).toString();
    }
    return "0.00";
  }
  function cancelHold() {
    clearTimeout(holdTimer);
    // released too early → back to prior state
    if (opts.inspection && inspectStart) { state = S.INSPECT; startInspectTick(); }
    else { state = S.IDLE; cls(""); setTime("0.00"); hint("any key / tap to inspect"); }
  }
  function releaseHold() {
    clearTimeout(holdTimer);
    if (holdReady) startRun();
    else cancelHold();
  }

  // ---- input events ----
  // brief lockout after a stop so the same frantic press can't instantly re-arm
  const INPUT_LOCK_MS = 500;
  let inputLockUntil = 0;
  const locked = () => performance.now() < inputLockUntil;

  let pressState = S.IDLE;
  function onDown() {
    if (locked()) return;
    pressState = state;
    if (state === S.RUNNING) { stopRun(); return; }
    if (state === S.IDLE) {
      if (opts.inspection) return;      // idle+inspection: press does nothing, release starts inspection
      beginHold(); return;              // no inspection: hold to start
    }
    if (state === S.INSPECT) { beginHold(); return; }
  }
  function onUp() {
    if (locked()) return;
    if (state === S.HOLD) { releaseHold(); return; }
    // start inspection only on a press that began in IDLE — so the keyup that
    // accompanies stopping a solve (press began while RUNNING) does not re-arm.
    if (state === S.IDLE && pressState === S.IDLE && opts.inspection) { startInspect(); return; }
  }

  // keyboard — ANY key drives the timer (space, letters, etc.). Mouse does NOT:
  // left-click can't start/stop, so a misclick never ruins a solve. One key at a
  // time; the exact key that pressed down is the one that releases.
  const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  function isTimerKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;                 // leave browser shortcuts alone
    if (["Escape", "Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return false;
    if (/^F\d+$/.test(e.key)) return false;                               // F1..F12 (reload, devtools, …)
    return true;
  }
  let downCode = null;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAllPops(); return; }
    if (isTyping(e.target) || !isTimerKey(e)) return;
    e.preventDefault();
    if (downCode !== null) return;      // ignore auto-repeat / a second key while one is held
    downCode = e.code;
    onDown();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== downCode) return;    // only the key that started the press ends it
    if (isTyping(e.target)) { downCode = null; return; }
    e.preventDefault();
    downCode = null;
    onUp();
  });

  // touch — only the timer zone reacts, so panel/buttons stay tappable. No mouse
  // handlers on purpose: clicking the page never controls the timer.
  const zone = $("timer-zone");
  zone.addEventListener("touchstart", (e) => { e.preventDefault(); onDown(); }, { passive: false });
  zone.addEventListener("touchend", (e) => { e.preventDefault(); onUp(); }, { passive: false });

  // ---------- penalty bar ----------
  let lastSolveId = null;
  function showPenaltyBar(id) { lastSolveId = id; $("penalty-bar").hidden = false; }
  function hidePenaltyBar() { $("penalty-bar").hidden = true; lastSolveId = null; }
  $("penalty-bar").addEventListener("click", (e) => {
    const b = e.target.closest(".pen"); if (!b || !lastSolveId) return;
    const pen = b.dataset.pen;
    const sv = Store.solves.find((s) => s.id === lastSolveId);
    if (!sv) return;
    if (pen === "del") { Store.remove(lastSolveId); hidePenaltyBar(); }
    else { sv.penalty = pen; Store.update(sv); }
    renderStats(); setTime("–"); cls(""); hidePenaltyBar();
    setTime("0.00");
  });

  // ---------- stats render ----------
  function renderStats() {
    const list = Store.solves;
    const last = list[list.length - 1];
    // current column
    $("cur-time").textContent = last ? label(last) : "–";
    $("cur-mo3").textContent  = fmtAvg(avgOf(list, 3));
    $("cur-ao5").textContent  = fmtAvg(avgOf(list, 5));
    $("cur-ao12").textContent = fmtAvg(avgOf(list, 12));
    // best column
    const singles = list.filter((s) => s.penalty !== "dnf").map(eff);
    $("best-time").textContent = singles.length ? fmt(Math.min(...singles)) : "–";
    $("best-mo3").textContent  = fmtAvg(bestAvg(list, 3));
    $("best-ao5").textContent  = fmtAvg(bestAvg(list, 5));
    $("best-ao12").textContent = fmtAvg(bestAvg(list, 12));
    // summary
    const meanAll = singles.length ? singles.reduce((a, b) => a + b, 0) / singles.length : null;
    $("solve-summary").textContent = `solves: ${list.length}` + (meanAll ? `   mean: ${fmt(meanAll)}` : "");

    // solve list (newest first), mark session best/worst
    const ol = $("solve-list"); ol.innerHTML = "";
    const effs = list.map(eff);
    const bestE = Math.min(...effs), worstE = Math.max(...effs.filter((x) => x !== Infinity), -1);
    for (let i = list.length - 1; i >= 0; i--) {
      const sv = list[i], li = el("li", "solve");
      if (sv.penalty === "dnf") li.classList.add("dnf");
      else if (eff(sv) === bestE) li.classList.add("best");
      else if (eff(sv) === worstE && list.length > 2) li.classList.add("worst");
      const idx = el("span", "idx"); idx.textContent = (i + 1);
      const t = el("span"); t.textContent = label(sv);
      li.appendChild(idx); li.appendChild(t);
      li.addEventListener("click", () => openSolveMenu(sv, li));
      ol.appendChild(li);
    }
  }

  // click a past solve → cycle a small inline menu of actions
  function openSolveMenu(sv, li) {
    const choice = prompt(
      `Solve #${Store.solves.indexOf(sv) + 1}: ${label(sv)}\n` +
      `Scramble: ${sv.scramble}\n\n` +
      `Type: ok / +2 / dnf / delete`, sv.penalty === "plus2" ? "+2" : sv.penalty
    );
    if (choice == null) return;
    const c = choice.trim().toLowerCase();
    if (c === "delete" || c === "del") { Store.remove(sv.id); }
    else if (c === "+2" || c === "plus2") { sv.penalty = "plus2"; Store.update(sv); }
    else if (c === "dnf") { sv.penalty = "dnf"; Store.update(sv); }
    else if (c === "ok") { sv.penalty = "ok"; Store.update(sv); }
    renderStats();
  }

  // ---------- scramble nav ----------
  $("scramble-next").addEventListener("click", newScramble);
  $("scramble-prev").addEventListener("click", () => {
    if (scrambleIdx > 0) { scrambleIdx--; curScramble = scrambleHistory[scrambleIdx]; showScramble(); }
  });
  $("scramble").addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(curScramble).catch(() => {});
    const s = $("scramble"); s.classList.add("copied");
    setTimeout(() => s.classList.remove("copied"), 500);
  });

  // ---------- panel controls ----------
  $("panel-collapse").addEventListener("click", () => {
    const p = $("panel"); p.classList.toggle("collapsed");
    $("panel-collapse").textContent = p.classList.contains("collapsed") ? "+" : "–";
  });
  $("btn-clear").addEventListener("click", () => {
    if (confirm("Clear this session's solves? (also removes them from the database)")) { Store.clearAll(); renderStats(); }
  });

  // ---------- settings popover ----------
  const setPop = $("settings-pop");
  $("opt-inspection").checked = opts.inspection;
  $("opt-hold").checked = opts.hold;
  $("opt-cube").checked = opts.cube;
  function applyCubeVis() { $("cube-wrap").classList.toggle("hidden", !opts.cube); }
  applyCubeVis();
  $("btn-settings").addEventListener("click", (e) => { e.stopPropagation(); setPop.hidden = !setPop.hidden; });
  $("opt-inspection").addEventListener("change", (e) => { opts.inspection = e.target.checked; saveOpts(); });
  $("opt-hold").addEventListener("change", (e) => { opts.hold = e.target.checked; saveOpts(); });
  $("opt-cube").addEventListener("change", (e) => { opts.cube = e.target.checked; saveOpts(); applyCubeVis(); });
  document.addEventListener("click", (e) => {
    if (!setPop.hidden && !e.target.closest("#settings-pop") && e.target !== $("btn-settings")) setPop.hidden = true;
  });
  function closeAllPops() { setPop.hidden = true; }

  // ============================================================
  // VS MODE  (local only — never touches Store / DB)
  // ============================================================
  const VS = {
    open: false, players: [], rounds: 0, round: 0, turn: 0,
    scrambles: [], results: [],   // results[player] = [ms|null per round]; null=DNF
    state: S.IDLE, startT: 0, raf: 0, inspStart: 0, inspPen: "ok", inspTick: 0, holdReady: false, holdTimer: 0, pending: 0,
  };
  const vsOverlay = $("vs"), vsSetup = $("vs-setup"), vsPlay = $("vs-play"), vsResults = $("vs-results");

  $("btn-vs").addEventListener("click", openVsSetup);
  $("vs-cancel").addEventListener("click", closeVs);
  $("vs-quit").addEventListener("click", closeVs);
  $("vs-done").addEventListener("click", closeVs);
  $("vs-again").addEventListener("click", () => { buildVsGame(VS.players.map((p) => p.name), VS.rounds); showVsPlay(); });
  $("vs-start").addEventListener("click", startVs);
  $("vs-n").addEventListener("input", renderVsNames);

  function openVsSetup() {
    VS.open = true; vsOverlay.hidden = false;
    vsSetup.hidden = false; vsPlay.hidden = true; vsResults.hidden = true;
    renderVsNames();
  }
  function closeVs() { VS.open = false; vsOverlay.hidden = true; clearInterval(VS.inspTick); cancelAnimationFrame(VS.raf); }

  function renderVsNames() {
    const n = Math.max(2, Math.min(12, parseInt($("vs-n").value) || 2));
    const wrap = $("vs-names"); wrap.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const inp = el("input"); inp.type = "text"; inp.placeholder = "Player " + (i + 1); inp.dataset.i = i;
      wrap.appendChild(inp);
    }
  }
  function startVs() {
    const n = Math.max(2, Math.min(12, parseInt($("vs-n").value) || 2));
    const rounds = Math.max(1, Math.min(20, parseInt($("vs-rounds").value) || 1));
    const names = Array.from($("vs-names").querySelectorAll("input")).map((inp, i) => inp.value.trim() || ("Player " + (i + 1)));
    buildVsGame(names, rounds);
    showVsPlay();
  }
  function buildVsGame(names, rounds) {
    VS.players = names.map((name) => ({ name }));
    VS.rounds = rounds; VS.round = 0; VS.turn = 0;
    VS.scrambles = Array.from({ length: rounds }, () => scramble());
    VS.results = names.map(() => Array(rounds).fill(undefined));
  }

  function showVsPlay() {
    vsSetup.hidden = true; vsResults.hidden = true; vsPlay.hidden = false;
    VS.state = S.IDLE; VS.inspStart = 0; VS.inspPen = "ok";
    $("vs-round").textContent = `Round ${VS.round + 1} / ${VS.rounds}`;
    $("vs-turn").textContent = VS.players[VS.turn].name;
    $("vs-scramble").textContent = VS.scrambles[VS.round];
    $("vs-time").textContent = "0.00"; $("vs-time").className = "vs-time";
    $("vs-hint").textContent = opts.inspection ? "any key / tap to inspect" : "any key / tap to start";
  }
  function vsAdvance() {
    VS.turn++;
    if (VS.turn >= VS.players.length) { VS.turn = 0; VS.round++; }
    if (VS.round >= VS.rounds) { showVsResults(); return; }
    showVsPlay();
  }
  function vsRecord(ms, pen) {
    VS.results[VS.turn][VS.round] = pen === "dnf" ? null : Math.round(ms + (pen === "plus2" ? 2000 : 0));
    vsAdvance();
  }

  // VS timer (mirrors main, scoped to VS.state)
  const vsTimeEl = $("vs-time");
  function vsSetT(t) { vsTimeEl.textContent = t; }
  function vsCls(c) { vsTimeEl.className = "vs-time" + (c ? " " + c : ""); }
  function vsHint(t) { $("vs-hint").textContent = t; }

  function vsStartInspect() {
    VS.state = S.INSPECT; VS.inspStart = performance.now(); VS.inspPen = "ok";
    vsCls("inspect"); vsHint("hold to start");
    VS.inspTick = setInterval(() => {
      const t = (performance.now() - VS.inspStart) / 1000, remain = 15 - t;
      if (t > 17) { VS.inspPen = "dnf"; vsSetT("DNF"); vsCls("warn"); }
      else if (t > 15) { VS.inspPen = "plus2"; vsSetT("+2"); vsCls("warn"); }
      else { vsSetT(Math.max(0, Math.ceil(remain)).toString()); vsCls(remain <= 4 ? "warn" : "inspect"); }
    }, 50);
  }
  function vsStartRun() {
    clearInterval(VS.inspTick); VS.state = S.RUNNING; VS.startT = performance.now();
    vsCls("running"); vsHint("");
    const tick = () => { if (VS.state !== S.RUNNING) return; vsSetT(fmt(performance.now() - VS.startT)); VS.raf = requestAnimationFrame(tick); };
    VS.raf = requestAnimationFrame(tick);
  }
  function vsStopRun() {
    cancelAnimationFrame(VS.raf);
    const ms = performance.now() - VS.startT; VS.state = S.IDLE;
    inputLockUntil = performance.now() + INPUT_LOCK_MS;
    vsRecord(ms, VS.inspPen);
  }
  function vsBeginHold() {
    VS.state = S.HOLD; VS.holdReady = false; vsCls("ready-hold");
    vsTimeEl.classList.remove("ready"); vsTimeEl.classList.add("warn");
    if (opts.hold) VS.holdTimer = setTimeout(() => { VS.holdReady = true; vsCls("ready"); }, 300);
    else VS.holdReady = true;
  }
  function vsReleaseHold() {
    clearTimeout(VS.holdTimer);
    if (VS.holdReady) vsStartRun();
    else { if (opts.inspection && VS.inspStart) { VS.state = S.INSPECT; vsCls("inspect"); } else { VS.state = S.IDLE; vsCls(""); vsSetT("0.00"); } }
  }
  let vsPressState = S.IDLE;
  function vsDown() {
    if (locked()) return;
    vsPressState = VS.state;
    if (VS.state === S.RUNNING) { vsStopRun(); return; }
    if (VS.state === S.IDLE) { if (opts.inspection) return; vsBeginHold(); return; }
    if (VS.state === S.INSPECT) { vsBeginHold(); return; }
  }
  function vsUp() {
    if (locked()) return;
    if (VS.state === S.HOLD) { vsReleaseHold(); return; }
    if (VS.state === S.IDLE && vsPressState === S.IDLE && opts.inspection) { vsStartInspect(); return; }
  }
  vsTimeEl.addEventListener("touchstart", (e) => { e.preventDefault(); vsDown(); }, { passive: false });
  vsTimeEl.addEventListener("touchend", (e) => { e.preventDefault(); vsUp(); }, { passive: false });
  // when VS is open, ANY key drives the VS timer instead of the main one (no mouse)
  let vsDownCode = null;
  document.addEventListener("keydown", (e) => {
    if (!VS.open || isTyping(e.target) || !isTimerKey(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (vsDownCode !== null) return;
    vsDownCode = e.code; vsDown();
  }, true);
  document.addEventListener("keyup", (e) => {
    if (!VS.open || e.code !== vsDownCode) return;
    e.preventDefault(); e.stopImmediatePropagation();
    vsDownCode = null; vsUp();
  }, true);
  // +2 / DNF mark a pending penalty applied when the current turn's solve is recorded
  $("vs-plus2").addEventListener("click", () => { VS.inspPen = VS.inspPen === "plus2" ? "ok" : "plus2"; flashVsPen("+2"); });
  $("vs-dnf").addEventListener("click", () => { VS.inspPen = VS.inspPen === "dnf" ? "ok" : "dnf"; flashVsPen("DNF"); });
  function flashVsPen(t) { vsHint("penalty: " + (VS.inspPen === "ok" ? "none" : t)); }

  function showVsResults() {
    vsPlay.hidden = true; vsResults.hidden = false;
    // score = sum of effective times; DNF counts as a large penalty per missing solve
    const board = VS.players.map((p, i) => {
      const times = VS.results[i];
      const done = times.filter((t) => t !== undefined);
      const dnfs = done.filter((t) => t === null).length;
      const valid = done.filter((t) => t !== null);
      const sum = valid.reduce((a, b) => a + b, 0) + dnfs * 999999;
      const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      const best = valid.length ? Math.min(...valid) : null;
      return { name: p.name, sum, mean, best, dnfs, solved: valid.length };
    });
    board.sort((a, b) => a.sum - b.sum);
    const wrap = $("vs-board"); wrap.innerHTML = "";
    board.forEach((b, i) => {
      const row = el("div", "vs-row" + (i === 0 ? " lead" : ""));
      const rank = el("span", "rank"); rank.textContent = i + 1;
      const who = el("span", "who"); who.textContent = b.name;
      const score = el("span", "score");
      score.textContent = b.solved ? `best ${fmt(b.best)} · avg ${fmt(b.mean)}` + (b.dnfs ? ` · ${b.dnfs} DNF` : "") : "no solves";
      row.appendChild(rank); row.appendChild(who); row.appendChild(score);
      wrap.appendChild(row);
    });
  }

  // ============================================================
  // BOOT
  // ============================================================
  showScramble();
  renderStats();
  setTime("0.00"); hint("any key / tap to inspect");
  setDot(Store.outbox.length ? "off" : "ok");
  syncPull();       // merge anything from other browsers
  syncFlush();      // push anything queued while offline
  window.addEventListener("online", () => { syncFlush(); syncPull(); });
  // periodic light pull so a second browser stays roughly in sync
  setInterval(syncPull, 60000);
})();
