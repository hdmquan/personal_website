const assert = require("node:assert/strict");
const core = require("../src/assets/js/timer-core.js");

const start = new Date("2026-09-28T09:00:00+10:00").getTime();
const session = { started_at: new Date(start).toISOString(), block_started_at: new Date(start).toISOString(), ended_at: null, waiting_at: null };
assert.equal(core.timerStatus(session, start + 899999).state, "running");
assert.equal(core.timerStatus(session, start + 900000).state, "waiting");
assert.equal(core.timerStatus({ ...session, ended_at: new Date(start + 1000).toISOString() }, start + 1000).state, "idle");
assert.equal(core.formatDuration(3 * 3600 + 45 * 60, true), "3h 45m");
assert.equal(core.formatDuration(0, true), "0m");
assert.equal(core.lastSevenDays(new Date("2026-09-28T12:00:00")).length, 7);

const totals = core.totalsByDay([
  { verified_at: "2026-09-28T01:00:00", duration_seconds: 900 },
  { verified_at: "2026-09-28T02:00:00", duration_seconds: 300 }
]);
assert.equal(totals[core.dayKey("2026-09-28T01:00:00")], 1200);

const morning = new Date(2026, 8, 28, 9);
const expiry = new Date(core.expiryFor(morning));
assert.equal(expiry.getHours(), 19);
assert.equal(expiry.getDate(), morning.getDate());
console.log("accountability timer tests passed");
