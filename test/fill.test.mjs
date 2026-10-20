// Offline test of the extension's filler against a local Ashby/Greenhouse-like form (no real postings).
// Covers: text, resume, Yes/No buttons without a type attribute, radios, location type-ahead,
// react-select style combobox, textarea, a resume-triggered re-render that wipes fields, and a
// negative case (option that doesn't exist must show red). Run: node test/fill.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = createRequire(path.resolve(HERE, '../../../package.json'))('playwright');
const content = fs.readFileSync(path.join(HERE, '../extension/content.js'), 'utf8');
const answers = (radio) => [
  { question: 'Full Legal Name', kind: 'text', required: true, value: 'X F' },
  { question: 'Resume', kind: 'file', required: true, value: 'RESUME' },
  { question: 'Are you legally authorized to work in the country where this role is located?', kind: 'boolean', required: true, value: 'Yes' },
  { question: 'Which best describes you?', kind: 'select', required: true, value: radio },
  { question: 'Current Location', kind: 'text', required: true, value: 'Atlanta, GA, United States' },
  { question: 'Will you now or in the future require sponsorship?', kind: 'select', required: true, value: 'Yes' },
  { question: 'What is the most impressive thing you’ve personally built?', kind: 'textarea', required: true, value: 'Built a thing.' },
];
async function run(radio) {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.addInitScript(it => { window.chrome = { runtime: { sendMessage: (m, r) => setTimeout(() => r(m.type === 'item' ? it : m.type === 'resume' ? btoa('%PDF-1.4') : { ok: true }), 10) } }; }, { company: 'Test', role: 'R', city: 'Atlanta, Georgia', answers: answers(radio) });
  await p.goto('file://' + path.join(HERE, 'fixture-form.html'));
  await p.addScriptTag({ content });
  await p.waitForFunction(() => /All required|NOT filled|Autofill error/.test(document.getElementById('career-ops-panel')?.innerText || ''), null, { timeout: 60000 });
  const panel = await p.evaluate(() => document.getElementById('career-ops-panel').innerText);
  const state = await p.evaluate(() => ({ name: n.value, yes: document.querySelector('._yesno_ button._active_')?.textContent, radio: q2.checked, loc: loc.value, ta: t.value, file: r.files.length, sp: document.querySelector('.select__single-value').textContent }));
  await b.close(); return { panel, state };
}
const ok = await run('Option B');
const good = /All required/.test(ok.panel) && JSON.stringify(ok.state) === JSON.stringify({ name: 'X F', yes: 'Yes', radio: true, loc: 'Atlanta, Georgia, United States', ta: 'Built a thing.', file: 1, sp: 'Yes' });
const bad = await run('Option Z');
const caught = /NOT filled[\s\S]*Which best describes you/.test(bad.panel);
console.log(good ? 'PASS fill' : 'FAIL fill ' + JSON.stringify(ok)); console.log(caught ? 'PASS self-check' : 'FAIL self-check ' + bad.panel);
process.exitCode = good && caught ? 0 : 1;

// ---- Lever: real /apply markup (scripts stripped), questions read by prepare.mjs's own parser ----
const { leverParse } = await import('../prepare.mjs');
const lhtml = fs.readFileSync(path.join(HERE, 'fixture-lever.html'), 'utf8');
const lf = leverParse(lhtml);
const pick = f => f.kind === 'file' ? 'RESUME' : f.kind === 'multiselect' ? [f.options[0]] : f.kind === 'select' ? f.options[f.options.length > 2 ? 2 : 0] : f.kind === 'textarea' ? 'Some text.' : /location/i.test(f.question) ? 'Atlanta, GA, United States' : 'x';
const lAnswers = lf.map(f => ({ question: f.question, kind: f.kind, required: f.required, value: pick(f) }));
{
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/^https?:/, r => r.abort());
  await p.addInitScript(it => { window.chrome = { runtime: { sendMessage: (m, r) => setTimeout(() => r(m.type === 'item' ? it : m.type === 'resume' ? btoa('%PDF-1.4') : { ok: true }), 10) } }; }, { company: 'Lever', role: 'R', city: 'Atlanta, Georgia', answers: lAnswers });
  await p.goto('file://' + path.join(HERE, 'fixture-lever.html'));
  await p.addScriptTag({ content });
  await p.waitForFunction(() => /All required|NOT filled|Autofill error/.test(document.getElementById('career-ops-panel')?.innerText || ''), null, { timeout: 90000 });
  const panel = await p.evaluate(() => document.getElementById('career-ops-panel').innerText);
  const loc = await p.evaluate(() => document.getElementById('location-input').value);
  await b.close();
  const lok = /All required/.test(panel) && loc === 'Atlanta, GA, United States';
  console.log(lok ? `PASS lever (${lf.length} fields)` : 'FAIL lever\n' + panel + '\nloc=' + loc);
  if (!lok) process.exitCode = 1;
}
