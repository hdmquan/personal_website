(function (root, factory) {
  const api = factory();
  root.TimerCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const BLOCK_MS = 15 * 60 * 1000;
  const pad = (n) => String(n).padStart(2, "0");
  function dayKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function expiryFor(value) {
    const d = value instanceof Date ? new Date(value) : new Date(value);
    d.setHours(19, 0, 0, 0);
    return d.getTime();
  }
  function timerStatus(session, now) {
    if (!session || session.ended_at) return { state: "idle", elapsed: 0, remaining: BLOCK_MS };
    const started = new Date(session.block_started_at || session.started_at).getTime();
    const elapsed = Math.max(0, now - started);
    if (session.waiting_at || elapsed >= BLOCK_MS) return { state: "waiting", elapsed: BLOCK_MS, remaining: 0 };
    return { state: "running", elapsed, remaining: BLOCK_MS - elapsed };
  }
  function formatDuration(seconds, compact) {
    const total = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    if (m) return `${m}m`;
    return compact ? "0m" : "Less than a minute";
  }
  function lastSevenDays(now) {
    const end = new Date(now); end.setHours(12, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(end); d.setDate(end.getDate() - 6 + i); return d; });
  }
  function totalsByDay(blocks) {
    return blocks.reduce((acc, b) => {
      const key = dayKey(b.verified_at || b.ended_at);
      acc[key] = (acc[key] || 0) + Number(b.duration_seconds || 0);
      return acc;
    }, {});
  }
  return { BLOCK_MS, dayKey, expiryFor, timerStatus, formatDuration, lastSevenDays, totalsByDay };
});
