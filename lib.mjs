// Shared helpers: tracker writes, pipeline marks, queue/state files.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = path.resolve(HERE, '../..');
export const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const log = (...a) => console.log(new Date().toISOString(), ...a);
// Personal settings live in career-ops' .env (GMAIL_USER, GMAIL_APP_PASSWORD, SUMMARY_TO, HOME_CITY), never in code.
export function env() {
  const e = {};
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/); if (m) e[m[1]] = m[2]; }
  return e;
}

const json = (file, dflt) => ({
  load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : dflt()),
  save: v => fs.writeFileSync(file, JSON.stringify(v, null, 1)),
});
export const STATE = json(path.join(HERE, 'state.json'), () => ({ processed: {} }));
export const QUEUE = json(path.join(HERE, 'queue.json'), () => []);

const trackerPath = path.join(ROOT, 'data/applications.md');
export function trackerRows() {
  return fs.readFileSync(trackerPath, 'utf8').split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l)).map(l => {
    const c = l.split('|').map(s => s.trim());
    return { num: Number(c[1]), company: c[3], role: c[4], status: c[6] };
  });
}

function nextNum() {
  const nums = trackerRows().map(r => r.num);
  for (const d of ['reports', 'batch/tracker-additions']) {
    const dir = path.join(ROOT, d);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { const m = f.match(/^(\d+)-/); if (m) nums.push(Number(m[1])); }
  }
  return Math.max(0, ...nums) + 1;
}

// Create or update the tracker row for a posting.
export function recordTracker(p, status, note) {
  const existing = trackerRows().find(r => norm(r.company) === norm(p.company) && norm(r.role) === norm(p.role));
  if (existing) {
    spawnSync('node', ['set-status.mjs', String(existing.num), status, '--note', note, '--force'], { cwd: ROOT, encoding: 'utf8' });
    return;
  }
  const num = nextNum();
  const clean = s => String(s).replace(/[\t\n|]/g, ' ');
  const tsv = `num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n${num}\t${TODAY}\t${clean(p.company)}\t${clean(p.role)}\t${status}\tN/A\t❌\t—\t${clean(note)}\t${p.url}\n`;
  fs.mkdirSync(path.join(ROOT, 'batch/tracker-additions'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'batch/tracker-additions', `${String(num).padStart(3, '0')}-${norm(p.company)}.tsv`), tsv);
  spawnSync('node', ['merge-tracker.mjs'], { cwd: ROOT, encoding: 'utf8' });
}

export function markPipeline(url, tag) {
  const pipePath = path.join(ROOT, 'data/pipeline.md');
  const lines = fs.readFileSync(pipePath, 'utf8').split('\n');
  const i = lines.findIndex(l => l.startsWith(`- [ ] ${url} `) || l === `- [ ] ${url}`);
  if (i >= 0) { lines[i] = lines[i].replace('- [ ] ', '- [x] ') + ` — ${tag} ${TODAY}`; fs.writeFileSync(pipePath, lines.join('\n')); }
}

// Open up to n queued applications in Chrome, capped at DAILY_MAX (default 20) per day.
// Round-robin across companies so one day isn't seven roles at the same place.
export function openBatch(n, { force = false } = {}) {
  const max = Number(env().DAILY_MAX || 20);
  const st = STATE.load();
  if (st.opened?.date !== TODAY) st.opened = { date: TODAY, urls: [] };
  const left = force ? n : Math.max(0, Math.min(n, max - st.opened.urls.length));
  const byCo = new Map();
  for (const q of QUEUE.load().filter(q => !st.opened.urls.includes(q.url))) { if (!byCo.has(q.company)) byCo.set(q.company, []); byCo.get(q.company).push(q); }
  const order = []; for (let i = 0; order.length < left && [...byCo.values()].some(v => v.length > i); i++) for (const v of byCo.values()) if (v[i] && order.length < left) order.push(v[i]);
  log(`opened today ${st.opened.urls.length}/${max}; opening ${order.length}`);
  for (const q of order) { log(' ', q.company, '|', q.role); spawnSync('open', ['-a', 'Google Chrome', q.applyUrl]); spawnSync('sleep', ['2']); st.opened.urls.push(q.url); }
  STATE.save(st);
  return order.length;
}
