// Daily summary email via Gmail SMTP (app password in ~/career-ops/.env).
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { env } from './lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');

const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderSummary({ date, fresh, manual, queueSize, opening }) {
  const link = r => `<a href="${h(r.applyUrl || r.url)}">${h(r.role)}</a>`;
  let html = `<h2>career-ops ${h(date)}</h2>`;
  html += `<p>新找到 <b>${fresh.length}</b> 个岗位（答案已起草）；<b>${manual.length}</b> 个需要你手动投。<br>待提交队列共 <b>${queueSize}</b> 个，已在 Chrome 里打开前 <b>${opening}</b> 个——扩展会自动填好，你检查后点 Submit。<br>更多：<code>cd ~/career-ops/local/auto-apply &amp;&amp; node open-next.mjs 10</code></p>`;
  if (fresh.length) html += `<h3>🆕 今天新加入队列</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>公司</th><th>岗位</th><th>地点</th></tr>${fresh.map(r => `<tr><td>${h(r.company)}</td><td>${link(r)}</td><td>${h(r.location)}</td></tr>`).join('')}</table>`;
  if (manual.length) html += `<h3>✋ 需要手动投递（简历见附件 resume.pdf）</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>公司</th><th>岗位（链接）</th><th>原因</th></tr>${manual.map(r => `<tr><td>${h(r.company)}</td><td>${link(r)}</td><td>${h(r.reason)}</td></tr>`).join('')}</table>`;
  if (fresh.length) html += `<h3>📝 起草的答案</h3>${fresh.map(r => `<details><summary>${h(r.company)} — ${h(r.role)}</summary><ul>${r.answers.filter(a => a.value && a.kind !== 'file').map(a => `<li><b>${h(a.question)}</b><br>${h(Array.isArray(a.value) ? a.value.join('; ') : a.value)}</li>`).join('')}</ul>${(r.notes || []).length ? `<p>护栏修正：${h(r.notes.join(' | '))}</p>` : ''}</details>`).join('')}`;
  const oqf = path.join(HERE, 'open-questions.md');
  const oq = fs.existsSync(oqf) ? fs.readFileSync(oqf, 'utf8').split('\n').filter(l => /^- Q: .* \| A:\s*$/.test(l)).map(l => l.replace(/^- Q: /, '').replace(/ \| A:\s*$/, '')) : [];
  if (oq.length) html += `<h3>❓ 需要你回答一次的问题（${oq.length}）</h3><p>在 <code>~/career-ops/local/auto-apply/open-questions.md</code> 的 A: 后面写答案，以后所有申请都会用；然后跑 <code>node prepare.mjs --no-scan --retry-manual</code>。</p><ul>${oq.map(q => `<li>${h(q)}</li>`).join('')}</ul>`;
  if (!fresh.length && !manual.length) html += `<p>今天没有新的符合条件的岗位。</p>`;
  html += `<p style="color:#888">已投清单：~/career-ops/data/applications.md</p>`;
  return { subject: `[career-ops] ${date}: ${fresh.length} 新岗位，${manual.length} 需手动，队列 ${queueSize}`, html, needsResume: manual.length > 0 };
}

export async function sendSummary(summary) {
  const e = env();
  if (!e.GMAIL_USER || !e.GMAIL_APP_PASSWORD || !e.SUMMARY_TO) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD / SUMMARY_TO not set in ~/career-ops/.env');
  const { subject, html, needsResume } = renderSummary(summary);
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD.replace(/\s+/g, '') } });
  await t.sendMail({ from: `career-ops <${e.GMAIL_USER}>`, to: e.SUMMARY_TO, subject, html,
    attachments: needsResume ? [{ filename: 'resume.pdf', path: path.join(HERE, 'resume.pdf') }] : [] });
}
