// Builds a Railway Postgres from scratch and copies a backup into it, then
// checks every table's row count. Used for the rehearsal and the real move.
//   DATABASE_URL=… node scripts/railway-setup.mjs <backup-folder>
// Order: supabase/railway/00_base.sql → migrations → 99_app_user.sql → data.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const bak = process.argv[2];
if (!bak || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=… node scripts/railway-setup.mjs <backup-folder>");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "..", "supabase");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false } });
await c.connect();

const sqlFile = async (f) => { await c.query(fs.readFileSync(f, "utf8")); console.log("ok", path.basename(f)); };
await sqlFile(path.join(root, "railway", "00_base.sql"));
for (const f of fs.readdirSync(path.join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort())
  await sqlFile(path.join(root, "migrations", f));
await sqlFile(path.join(root, "railway", "99_app_user.sql"));

// Users: ids and emails only. Passwords are set afterwards with set-password.mjs.
for (const u of JSON.parse(fs.readFileSync(path.join(bak, "auth_users.json"), "utf8")))
  await c.query("insert into auth.users (id, email) values ($1, lower($2)) on conflict do nothing", [u.id, u.email]);

// Parents before children.
const order = ["blueprints","blueprint_members","settings","projects","items","captures","day_inputs","future_tasks","routine_days","calendar_week_assignments","calendar_day_overrides","calendar_drop_imports","google_calendar_connections","google_calendar_secrets"];
const want = JSON.parse(fs.readFileSync(path.join(bak, "row-counts.json"), "utf8"));
let bad = 0;
for (const t of order) {
  await c.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`, [fs.readFileSync(path.join(bak, `${t}.json`), "utf8")]);
  const n = +(await c.query(`select count(*) from public.${t}`)).rows[0].count;
  if (n !== want[t]) bad++;
  console.log(t.padEnd(30), want[t], n, n === want[t] ? "match" : "MISMATCH");
}
const nu = +(await c.query("select count(*) from auth.users")).rows[0].count;
console.log("users".padEnd(30), want.auth_users, nu, nu === want.auth_users ? "match" : "MISMATCH");
if (nu !== want.auth_users) bad++;
console.log(bad ? "PROBLEMS" : "ALL MATCH");
await c.end();
process.exit(bad ? 1 : 0);
