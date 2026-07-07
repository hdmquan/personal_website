/* Speedcube timer sync.
 *
 * Single-user (Alan) store for /timer solves, so the timer stays in sync across browsers.
 * Holds the DB connection string in an env var only — never the client, never the repo.
 *
 * Required Netlify env var (Site settings -> Environment variables), also in a local .env for `netlify dev`:
 *   SUPABASE_DB_URL   the Supabase Postgres connection string, e.g.
 *                     postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
 *
 * Endpoints:
 *   GET                       -> { solves: [...] }  (all solves, oldest first)
 *   POST { op:'upsert', solve} -> insert or update one solve
 *   POST { op:'delete', id }   -> delete one solve
 *
 * The table is created on first call, so there's no separate migration step.
 */
const { Pool } = require("pg");

const CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

// Reuse the pool across warm invocations. Supabase requires SSL; its cert isn't in the
// lambda trust store, so disable strict verification (fine for a personal single-user DB).
let pool;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

let ready;
async function ensureTable(db) {
  if (!ready) {
    ready = db.query(`
      create table if not exists cube_solves (
        id       text primary key,
        ms       integer     not null,
        penalty  text        not null default 'ok',
        scramble text        not null default '',
        puzzle   text        not null default '333',
        ts       bigint      not null
      );
    `);
  }
  return ready;
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.TIMER_ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ok = (body) => ({ statusCode: 200, headers, body: JSON.stringify(body) });
const bad = (code, msg) => ({ statusCode: code, headers, body: JSON.stringify({ error: msg }) });

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (!CONN) return bad(500, "server not configured (SUPABASE_DB_URL missing)");

  let db;
  try {
    db = getPool();
    await ensureTable(db);

    if (event.httpMethod === "GET") {
      const { rows } = await db.query(
        "select id, ms, penalty, scramble, puzzle, ts from cube_solves order by ts asc"
      );
      return ok({ solves: rows });
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); } catch { return bad(400, "bad json"); }

      if (body.op === "upsert") {
        const s = body.solve || {};
        if (!s.id || typeof s.ms !== "number" || typeof s.ts !== "number") return bad(400, "missing fields");
        await db.query(
          `insert into cube_solves (id, ms, penalty, scramble, puzzle, ts)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (id) do update set
             ms = excluded.ms, penalty = excluded.penalty,
             scramble = excluded.scramble, puzzle = excluded.puzzle, ts = excluded.ts`,
          [s.id, Math.round(s.ms), s.penalty || "ok", s.scramble || "", s.puzzle || "333", s.ts]
        );
        return ok({ ok: true });
      }

      if (body.op === "delete") {
        if (!body.id) return bad(400, "missing id");
        await db.query("delete from cube_solves where id = $1", [body.id]);
        return ok({ ok: true });
      }

      return bad(400, "unknown op");
    }

    return bad(405, "method not allowed");
  } catch (e) {
    return bad(502, "db error: " + (e && e.message ? e.message : "unknown"));
  }
};
