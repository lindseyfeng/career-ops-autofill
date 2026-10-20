// Runs at login and at 08:00 (launchd); does the full prep once per day, then opens a batch
// of pre-filled applications in your normal Google Chrome. You review and click Submit.
// Usage: node morning.mjs [--force] [--open N]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HERE, TODAY, log, STATE, QUEUE, openBatch } from './lib.mjs';
import { sendSummary } from './email.mjs';

const args = process.argv.slice(2);
const OPEN = args.includes('--open') ? Number(args[args.indexOf('--open') + 1]) : 10;
const st = STATE.load();
if (st.lastMorning === TODAY && !args.includes('--force')) { log('already ran today'); process.exit(0); }

const before = new Set(QUEUE.load().map(q => q.url));
log('prepare: scan + draft answers (APIs only, no application pages opened)');
const r = spawnSync('node', [path.join(HERE, 'prepare.mjs')], { cwd: HERE, encoding: 'utf8', timeout: 6 * 3600e3, stdio: 'inherit' });
log('prepare exit', r.status);

const queue = QUEUE.load();
const fresh = queue.filter(q => !before.has(q.url));
const mf = path.join(HERE, 'logs', `prepare-${TODAY}.json`);
const manual = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')).manual : [];

const s2 = STATE.load(); s2.lastMorning = TODAY; STATE.save(s2);

try { await sendSummary({ date: TODAY, fresh, manual, queueSize: queue.length, opening: Math.min(OPEN, queue.length) }); log('email sent'); }
catch (e) { log('email skipped:', e.message); }

openBatch(OPEN);
