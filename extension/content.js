// career-ops autofill: fills a queued Greenhouse/Ashby form in YOUR Chrome, checks it, never submits.
(() => {
  const ask = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txt = e => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const key = s => String(s || '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const DECLINE = o => /decline|don.?t wish|do not wish|prefer not|not to (answer|disclose|say)|choose not/i.test(o);
  const EEO = /\b(gender|race|ethnic|hispanic|latino|veteran|disabilit|sexual orientation|transgender)/i;
  const CONFIRM = /thank you for (applying|your (application|interest))|application (has been )?(submitted|received)|we('|’)ve received your application|successfully submitted/i;

  // Wait until the form stops re-rendering (no DOM mutations for 1.2s, max 12s).
  const settle = () => new Promise(res => {
    let t = setTimeout(done, 1200); const cap = setTimeout(done, 12000);
    const mo = new MutationObserver(m => { if (m.some(x => !panel.contains(x.target))) { clearTimeout(t); t = setTimeout(done, 1200); } });
    function done() { mo.disconnect(); clearTimeout(t); clearTimeout(cap); res(); }
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });

  // ---------- panel ----------
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:340px;max-height:70vh;overflow:auto;background:#fff;color:#111;border:2px solid #444;border-radius:8px;padding:10px;font:12px/1.4 -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)';
  const say = (html) => { panel.innerHTML = `<b>career-ops autofill</b><div style="margin-top:6px">${html}</div>`; };

  // ---------- DOM field discovery ----------
  function labelOf(e) {
    if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l && txt(l)) return txt(l); }
    const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(' ').map(i => txt(document.getElementById(i))).join(' ').trim(); if (t) return t; }
    if (e.getAttribute('aria-label')) return e.getAttribute('aria-label');
    const l = e.closest('label'); return l ? txt(l) : '';
  }
  function groupQuestion(els, optionLabels) {
    let a = els[0].parentElement;
    while (a && !els.every(x => a.contains(x))) a = a.parentElement;
    for (let i = 0; i < 3 && a && els.length === 1 && txt(a).length <= (optionLabels[0] || '').length + 2; i++) a = a.parentElement;
    let q = txt(a); for (const o of optionLabels) q = q.replace(o, ' ');
    return q.replace(/\s+/g, ' ').trim();
  }
  function discover() {
    const out = [], groups = new Map();
    for (const e of document.querySelectorAll('input, textarea, select')) {
      const t = (e.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'search'].includes(t) || /recaptcha/.test(e.name || e.id) || (e.id || '').startsWith('iti-') || /requiredInput/.test(e.className || '')) continue;
      if (e.closest('#career-ops-panel')) continue;
      const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) && t !== 'file') continue;
      if (t === 'radio' || t === 'checkbox') {
        const g = e.name || e.closest('fieldset')?.id || Math.random();
        if (!groups.has(g)) { const f = { kind: t, els: [], options: [] }; groups.set(g, f); out.push(f); }
        const f = groups.get(g); f.els.push(e); f.options.push(labelOf(e) || txt(e.parentElement));
        continue;
      }
      const role = e.getAttribute('role');
      out.push({ kind: e.tagName === 'SELECT' ? 'select' : t === 'file' ? 'file' : e.tagName === 'TEXTAREA' ? 'textarea' : role === 'combobox' ? 'combobox' : 'text', el: e, question: labelOf(e) });
    }
    for (const f of out) if (f.els) f.question = groupQuestion(f.els, f.options);
    for (const f of out) f.required = /\*\s*$/.test(f.question || '') || !!(f.el && (f.el.required || f.el.getAttribute('aria-required') === 'true'));
    return out;
  }

  // ---------- fillers (real DOM events so React-based forms register them) ----------
  const setNative = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  async function fillText(el, v) { el.focus(); setNative(el, String(v)); el.dispatchEvent(new Event('blur', { bubbles: true })); el.blur(); }
  async function pickCombo(el, v) {
    el.focus(); el.click(); setNative(el, String(v).slice(0, 40)); await sleep(900);
    const lb = el.getAttribute('aria-controls');
    const opts = [...(lb ? document.querySelectorAll(`[id="${CSS.escape(lb)}"] [role=option]`) : document.querySelectorAll('[role=option]'))];
    const want = String(v).toLowerCase();
    const o = opts.find(x => txt(x).toLowerCase() === want) || opts.find(x => txt(x).toLowerCase().startsWith(want)) || (opts.length && /location|city/i.test(el.id + labelOf(el)) ? opts[0] : null);
    if (!o) throw new Error(`no option "${v}"`);
    o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); await sleep(200);
  }
  function clickOption(f, v) {
    const i = f.options.findIndex(o => o.toLowerCase() === String(v).toLowerCase());
    const j = i >= 0 ? i : f.options.findIndex(o => o.toLowerCase().startsWith(String(v).toLowerCase().slice(0, 25)));
    if (j < 0) throw new Error(`no option "${v}"`);
    const el = f.els[j]; if (el.checked) return;
    const lab = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    (lab || el.parentElement || el).click();
    if (!el.checked) el.click();
  }
  async function attachResume(el) {
    const b64 = await ask({ type: 'resume' });
    const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([arr], 'resume.pdf', { type: 'application/pdf' }));
    el.files = dt.files; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);
  }

  // ---------- locate a question's container by its label text (widget-agnostic) ----------
  const CONTROL = 'input:not([type=hidden]), textarea, select, button:not([type=submit])';
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  function findBox(question) {
    const k = key(question); if (!k) return null;
    const cands = [];
    for (const n of document.querySelectorAll('label, legend, [class*="title"], [class*="label"], [class*="question"], p, span, h3, h4')) {
      if (n.closest('#career-ops-panel') || n.matches('button, [role=option]')) continue;
      const nk = key(txt(n)); if (!nk) continue;
      if (nk === k || (nk.length > 8 && k.length > 8 && (nk.startsWith(k) || k.startsWith(nk)) && Math.abs(nk.length - k.length) < 30)) cands.push(n);
    }
    cands.sort((a, b) => txt(a).length - txt(b).length);
    for (const n of cands) {
      const entry = n.closest('[class*="field-entry"], fieldset, [class*="field-wrapper"], [class*="question"]');
      if (entry && entry !== n && entry.querySelector(CONTROL)) return { label: n, box: entry };
      let c = n;
      for (let i = 0; i < 5 && c; i++, c = c.parentElement) if (c.querySelector(CONTROL)) return { label: n, box: c };
    }
    return null;
  }
  const isActive = b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true' || /active|selected|checked|pressed/i.test(b.className);
  const optionText = e => labelOf(e) || txt(e.parentElement);

  function boxFilled(box, kind) {
    if (kind === 'file') return [...box.querySelectorAll('input[type=file]')].some(i => i.files?.length) || /resume\.pdf/i.test(txt(box));
    const btns = [...box.querySelectorAll('button')].filter(b => b.type !== 'submit' && txt(b) && visible(b));
    if (btns.length && btns.length <= 6 && !box.querySelector('input[type=radio]')) return btns.some(isActive);
    const ch = [...box.querySelectorAll('input[type=radio], input[type=checkbox]')];
    if (ch.length) return ch.some(e => e.checked);
    const sel = box.querySelector('select'); if (sel) return !!sel.value;
    const t = [...box.querySelectorAll('textarea, input')].filter(i => !['hidden', 'file', 'radio', 'checkbox'].includes(i.type) && visible(i));
    return t.some(i => String(i.value || '').trim()) || (box.querySelector('[role=combobox]') && !/^select\.{0,3}$/i.test(txt(box.querySelector('[class*="single-value"], [class*="singleValue"]')) || 'select'));
  }

  async function typeahead(el, v, isLocation) {
    const tries = isLocation ? [String(v).split(',')[0].trim(), String(v)] : [String(v)];
    for (const t of tries) {
      el.focus(); el.click(); setNative(el, t.slice(0, 40)); await sleep(1200);
      const lb = el.getAttribute('aria-controls');
      let opts = [...document.querySelectorAll(lb ? `[id="${CSS.escape(lb)}"] [role=option]` : '[role=option]')].filter(visible);
      if (!opts.length) opts = [...document.querySelectorAll('[role=listbox] li, [class*="option"], [class*="Option"], [class*="suggestion"], [class*="result"] li')].filter(x => visible(x) && !x.closest('#career-ops-panel') && txt(x));
      const want = String(v).toLowerCase(), first = t.toLowerCase();
      const o = opts.find(x => txt(x).toLowerCase() === want) || opts.find(x => txt(x).toLowerCase().startsWith(first)) || (isLocation ? opts.find(x => /georgia|\bga\b/i.test(txt(x))) || opts[0] : null);
      if (o) { o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); await sleep(300); return txt(o); }
    }
    throw new Error(`no dropdown option for "${v}"`);
  }

  // Fill one answer inside its container, whatever the widget is.
  async function fillBox(box, a) {
    const v = a.value, vals = [].concat(v).map(String);
    const isLocation = /location|city|where are you (based|located)/i.test(a.question);
    if (a.kind === 'file') { const f = box.querySelector('input[type=file]') || document.querySelector('input[type=file]'); if (!f) throw new Error('no file input'); await attachResume(f); return 'resume.pdf'; }
    const btns = [...box.querySelectorAll('button')].filter(b => b.type !== 'submit' && txt(b) && visible(b));
    if (btns.length && vals.every(x => btns.some(b => key(txt(b)) === key(x)))) {
      for (const x of vals) { const b = btns.find(b => key(txt(b)) === key(x)); if (!isActive(b)) b.click(); await sleep(250); }
      return vals.join('; ');
    }
    const ch = [...box.querySelectorAll('input[type=radio], input[type=checkbox]')];
    if (ch.length) {
      const f = { els: ch, options: ch.map(optionText) };
      for (const x of vals) clickOption(f, x);
      return vals.join('; ');
    }
    const sel = box.querySelector('select');
    if (sel) { const o = [...sel.options].find(o => key(o.text) === key(vals[0])); if (!o) throw new Error('no option'); setNative(sel, o.value); return o.text; }
    const ta = box.querySelector('textarea');
    if (ta && visible(ta)) { await fillText(ta, vals.join(', ')); return vals.join(', '); }
    const inp = [...box.querySelectorAll('input')].find(i => !['hidden', 'radio', 'checkbox', 'file', 'submit', 'button'].includes(i.type) && !/^iti-|recaptcha/.test(i.id + i.name) && visible(i));
    if (!inp) throw new Error('unknown widget');
    const combo = inp.getAttribute('role') === 'combobox' || inp.getAttribute('aria-autocomplete') || /start typing|search/i.test(inp.placeholder || '') || isLocation;
    if (combo) { let r = ''; for (const x of vals) r = await typeahead(inp, x, isLocation); return r; }
    await fillText(inp, vals.join(', ')); return vals.join(', ');
  }

  // Unknown widgets: send the container HTML home so the filler can learn it.
  const report = (company, why, box) => ask({ type: 'debug', url: location.href, company, why, html: (box?.outerHTML || '').slice(0, 400000) });

  async function run(item) {
    say(`Filling <b>${item.company}</b> — ${item.role}…`);
    for (let t = 0; t < 30 && !document.querySelector('input[type=file]'); t++) await sleep(500);
    await sleep(800);
    const log = [], used = new Set();
    // Resume first: Ashby parses it and re-renders the whole form, wiping anything filled before.
    const answers = [...item.answers].sort((x, y) => (y.kind === 'file') - (x.kind === 'file'));
    const fillOne = async a => {
      const hit = a.kind === 'file' ? { box: (document.querySelector('input[type=file]')?.closest('[class*="field-entry"], fieldset, div')) || document.body } : findBox(a.question);
      if (!hit) return [a.required ? '❌' : '·', a.question, 'question not found on page'];
      used.add(hit.box);
      try { return ['✅', a.question, await fillBox(hit.box, a)]; }
      catch (e) { if (a.required) report(item.company, `${a.question}: ${e.message}`, hit.box); return [a.required ? '❌' : '⚠️', a.question, e.message]; }
    };
    const todo = answers.filter(a => !(a.value === '' || a.value == null || (Array.isArray(a.value) && !a.value.length)));
    for (const a of todo) { log.push(await fillOne(a)); if (a.kind === 'file') await settle(); }
    await settle();
    // Re-find every box (re-renders detach old nodes) and re-fill anything that didn't stick, once.
    const stuck = a => { const h = a.kind === 'file' ? { box: document.querySelector('input[type=file]')?.closest('[class*="field-entry"], fieldset, div') } : findBox(a.question); return h?.box && boxFilled(h.box, a.kind); };
    for (const a of todo) if (a.kind !== 'file' && !stuck(a)) { const r = await fillOne(a); const i = log.findIndex(x => x[1] === a.question); log[i] = r[0] === '✅' ? ['✅', a.question, r[2] + ' (refilled)'] : r; }
    // page-only fields: EEO (decline) and Greenhouse location (city)
    const fields = discover();
    for (const f of fields) {
      const el = f.el || f.els?.[0]; if ([...used].some(b => b.contains(el))) continue;
      try {
        if (EEO.test(f.question || '')) {
          if (f.kind === 'combobox') { f.el.click(); await sleep(500); const lb = f.el.getAttribute('aria-controls'); const o = [...document.querySelectorAll(lb ? `[id="${CSS.escape(lb)}"] [role=option]` : '[role=option]')].find(x => DECLINE(txt(x))); if (o) { o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); log.push(['✅', f.question, txt(o)]); } else document.body.click(); }
          else if (f.kind === 'radio') { const o = f.options.find(DECLINE); if (o) { clickOption(f, o); log.push(['✅', f.question, o]); } }
          else if (f.kind === 'select') { const o = [...f.el.options].find(o => DECLINE(o.text)); if (o) { setNative(f.el, o.value); log.push(['✅', f.question, o.text]); } }
        } else if (item.city && f.kind === 'combobox' && /location|city/i.test(f.el.id + f.question) && !filledOK(f)) {
          log.push(['✅', f.question, await typeahead(f.el, item.city, true)]);
        }
      } catch (e) { log.push(['⚠️', f.question, e.message]); }
    }
    // self-check: verify each answer actually landed, plus any required field we never touched
    await sleep(1000);
    const missing = [];
    await settle();
    for (const a of todo) {
      if (!a.required || stuck(a)) continue;
      const box = a.kind === 'file' ? null : findBox(a.question)?.box;
      missing.push({ q: a.question, el: box }); report(item.company, `did not stick: ${a.question}`, box);
    }
    for (const a of item.answers) if (a.required && !todo.includes(a)) { const box = findBox(a.question)?.box; if (!box || !boxFilled(box, a.kind)) missing.push({ q: a.question + ' (yours to write)', el: box }); }
    for (const f of discover()) {
      const el = f.el || f.els?.[0];
      if (!f.required || filledOK(f) || /cover letter/i.test(f.question) || item.answers.some(a => findBox(a.question)?.box?.contains(el))) continue;
      missing.push({ q: f.question + ' (not in my draft)', el }); report(item.company, `unexpected required field: ${f.question}`, el?.closest('div')?.parentElement);
    }
    const rows = log.map(([s, q, v]) => `<div>${s} <b>${String(q).slice(0, 70)}</b><br><span style="color:#555">${String(v).slice(0, 160)}</span></div>`).join('');
    const head = missing.length
      ? `<div style="background:#fde2e2;padding:6px;border-radius:4px">❌ ${missing.length} required field(s) NOT filled — fill these by hand before submitting:<br>${missing.map(m => '• ' + String(m.q).slice(0, 80)).join('<br>')}</div>`
      : `<div style="background:#dcf5dc;padding:6px;border-radius:4px">✅ All required fields filled and verified. Review, then click <b>Submit</b> yourself.</div>`;
    if (missing.length) report(item.company, 'FULL FORM after fill', document.querySelector('form') || document.querySelector('[class*="application-form"]') || document.body);
    say(head + `<details style="margin-top:6px"><summary>What I filled (${log.length})</summary>${rows}</details>`);
    for (const m of missing) if (m.el) (m.el.closest?.('div') || m.el).style.outline = '3px solid #e33';
  }

  // ---------- confirmation watcher ----------
  let reported = false;
  setInterval(async () => {
    if (reported) return;
    if (CONFIRM.test(txt(document.body).slice(0, 6000))) {
      reported = true;
      const r = await ask({ type: 'applied', url: location.href });
      say(r?.ok ? '✅ Submitted — recorded as <b>Applied</b> in your tracker.' : '✅ Submitted (this posting was not in the queue, nothing recorded).');
    }
  }, 2000);

  (async () => {
    const item = await ask({ type: 'item', url: location.href });
    if (!item || item.error) return; // not a queued posting: stay invisible
    panel.id = 'career-ops-panel'; document.body.appendChild(panel);
    try { await run(item); } catch (e) { say('⚠️ Autofill error: ' + e.message + '<br>Fill the form manually.'); }
  })();
})();
