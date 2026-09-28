/* Single-user persistence API for /timer. SUPABASE_DB_URL stays server-side. */
const { Pool } = require("pg");
const CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
let pool, ready;
function db() {
  if (!pool) pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}
function ensureTables(client) {
  if (!ready) ready = client.query(`
    create table if not exists accountability_todos (
      id text primary key, text text not null, created_at timestamptz not null,
      expires_at timestamptz not null, completed_at timestamptz,
      acknowledged_at timestamptz, updated_at timestamptz not null
    );
    create table if not exists accountability_sessions (
      id text primary key, started_at timestamptz not null,
      block_started_at timestamptz not null, waiting_at timestamptz,
      ended_at timestamptz, updated_at timestamptz not null
    );
    create unique index if not exists one_active_accountability_session
      on accountability_sessions ((ended_at is null)) where ended_at is null;
    create table if not exists accountability_work_blocks (
      id text primary key, session_id text not null,
      started_at timestamptz not null, ended_at timestamptz not null,
      duration_seconds integer not null check (duration_seconds between 0 and 900),
      reflection text, verified_at timestamptz not null, updated_at timestamptz not null
    );
  `);
  return ready;
}
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": process.env.TIMER_ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const validId = (id) => typeof id === "string" && id.length > 5 && id.length < 100;
const date = (value) => value ? new Date(value) : null;

async function upsertTodo(client, r) {
  if (!validId(r.id) || typeof r.text !== "string" || !r.text.trim() || r.text.length > 180) throw new Error("invalid todo");
  await client.query(`insert into accountability_todos
    (id,text,created_at,expires_at,completed_at,acknowledged_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7)
    on conflict(id) do update set text=excluded.text, expires_at=excluded.expires_at,
    completed_at=excluded.completed_at, acknowledged_at=excluded.acknowledged_at, updated_at=excluded.updated_at
    where accountability_todos.updated_at <= excluded.updated_at`,
    [r.id, r.text.trim(), date(r.created_at), date(r.expires_at), date(r.completed_at), date(r.acknowledged_at), date(r.updated_at)]);
}
async function upsertSession(client, r) {
  if (!validId(r.id)) throw new Error("invalid session");
  if (!r.ended_at) {
    await client.query("update accountability_sessions set ended_at=$1, updated_at=$1 where ended_at is null and id<>$2", [date(r.started_at), r.id]);
  }
  await client.query(`insert into accountability_sessions
    (id,started_at,block_started_at,waiting_at,ended_at,updated_at) values ($1,$2,$3,$4,$5,$6)
    on conflict(id) do update set block_started_at=excluded.block_started_at,
    waiting_at=excluded.waiting_at, ended_at=excluded.ended_at, updated_at=excluded.updated_at
    where accountability_sessions.updated_at <= excluded.updated_at`,
    [r.id, date(r.started_at), date(r.block_started_at), date(r.waiting_at), date(r.ended_at), date(r.updated_at)]);
}
async function upsertBlock(client, r) {
  const seconds = Math.round(Number(r.duration_seconds));
  if (!validId(r.id) || !validId(r.session_id) || !Number.isFinite(seconds) || seconds < 0 || seconds > 900 || (r.reflection && r.reflection.length > 600)) throw new Error("invalid block");
  await client.query(`insert into accountability_work_blocks
    (id,session_id,started_at,ended_at,duration_seconds,reflection,verified_at,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict(id) do update set duration_seconds=excluded.duration_seconds,
    reflection=excluded.reflection, verified_at=excluded.verified_at, updated_at=excluded.updated_at
    where accountability_work_blocks.updated_at <= excluded.updated_at`,
    [r.id, r.session_id, date(r.started_at), date(r.ended_at), seconds, r.reflection || null, date(r.verified_at), date(r.updated_at)]);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (!CONN) return response(500, { error: "server not configured" });
  try {
    const client = db(); await ensureTables(client);
    if (event.httpMethod === "GET") {
      const [todos, sessions, blocks] = await Promise.all([
        client.query("select * from accountability_todos order by created_at"),
        client.query("select * from accountability_sessions order by started_at"),
        client.query("select * from accountability_work_blocks order by verified_at")
      ]);
      return response(200, { todos: todos.rows, sessions: sessions.rows, blocks: blocks.rows });
    }
    if (event.httpMethod === "POST") {
      let body; try { body = JSON.parse(event.body || "{}"); } catch (_) { return response(400, { error: "bad json" }); }
      if (!body.record || !["todo", "session", "block"].includes(body.kind)) return response(400, { error: "invalid operation" });
      if (body.kind === "todo") await upsertTodo(client, body.record);
      if (body.kind === "session") await upsertSession(client, body.record);
      if (body.kind === "block") await upsertBlock(client, body.record);
      return response(200, { ok: true });
    }
    return response(405, { error: "method not allowed" });
  } catch (error) {
    console.error("timer API", error);
    return response(error.message.startsWith("invalid") ? 400 : 502, { error: error.message.startsWith("invalid") ? error.message : "database unavailable" });
  }
};
