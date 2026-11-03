// Creates a login, or sets a new password for an existing one.
//   DATABASE_URL=… node scripts/set-password.mjs someone@example.com
// The password is read from the terminal (hidden), never from the command line.
import pg from "pg";
import bcrypt from "bcryptjs";
import readline from "node:readline";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=… node scripts/set-password.mjs <email>");
  process.exit(1);
}
const password = await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  process.stdout.write("New password (8+ characters): ");
  rl.question("", (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
});
if (password.length < 8) { console.error("Too short."); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "off" ? false : { rejectUnauthorized: false } });
await c.connect();
const hash = await bcrypt.hash(password, 10);
const r = await c.query(
  `insert into auth.users (email, password_hash) values ($1, $2)
   on conflict (email) do update set password_hash = excluded.password_hash returning id`,
  [email, hash],
);
console.log(`Login ready for ${email}`);
await c.end();
