// Local-only bridge between queue.json and the Chrome extension. Binds 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HERE, TODAY, log, env, QUEUE, STATE, recordTracker } from './lib.mjs';

const PORT = 47821;
const findItem = pageUrl => QUEUE.load().find(q => q.jobId && pageUrl.includes(q.jobId));

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && u.pathname === '/item') {
      const it = findItem(u.searchParams.get('url') || '');
      return send(res, 200, it ? { company: it.company, role: it.role, answers: it.answers, city: env().HOME_CITY || '' } : null);
    }
    if (req.method === 'GET' && u.pathname === '/resume') return send(res, 200, fs.readFileSync(path.join(HERE, 'resume.pdf')), 'application/pdf');
    if (req.method === 'POST' && u.pathname === '/applied') {
      const { url } = await readBody(req);
      const it = findItem(url || '');
      if (!it) return send(res, 404, { ok: false });
      recordTracker(it, 'Applied', `submitted ${TODAY} (Chrome)`);
      QUEUE.save(QUEUE.load().filter(q => q.url !== it.url));
      const st = STATE.load(); st.processed[it.url] = { date: TODAY, status: 'submitted' }; STATE.save(st);
      log('APPLIED', it.company, '|', it.role);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/debug') { // unknown widget / unfilled field: keep the DOM so the filler can learn it
      const d = await readBody(req);
      const dir = path.join(HERE, 'logs', 'dom'); fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${TODAY}-${String(d.company || 'x').replace(/\W+/g, '_')}.html`);
      fs.appendFileSync(f, `\n<!-- ${new Date().toISOString()} ${d.url} | ${String(d.why || '').replace(/--/g, '-')} -->\n${d.html || ''}\n`);
      log('DEBUG', d.company, '|', d.why);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { ok: false });
  } catch (e) { log('server error', e.message); send(res, 500, { ok: false }); }
}).listen(PORT, '127.0.0.1', () => log(`career-ops autofill server on 127.0.0.1:${PORT}`));
