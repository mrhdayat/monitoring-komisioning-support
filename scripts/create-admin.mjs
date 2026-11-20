// Pakai: npm run admin:create -- <username> <password> [--remote]  (default --local)
import { execFileSync } from 'node:child_process';
import { hashPassword } from '../worker/password.ts';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const [user, pw] = args.filter((a) => !a.startsWith('--'));
if (!user || !pw) { console.error('Pakai: npm run admin:create -- <username> <password> [--remote]'); process.exit(1); }

const q = (s) => `'${s.replaceAll("'", "''")}'`;
const sql = `INSERT INTO admins (username, password_hash, created_at) VALUES (${q(user)}, ${q(await hashPassword(pw))}, ${Date.now()})`;
execFileSync('npx', ['wrangler', 'd1', 'execute', 'komisioning', remote ? '--remote' : '--local', '--command', sql], { stdio: 'inherit' });
