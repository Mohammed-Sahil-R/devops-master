import { ISSUES, CATEGORIES, getIssue } from './data-issues.js';
import { esc, $ } from './ui.js';
import { mountSpeechPanel } from './audio.js';

const RISK = { low: ['lo', 'Low risk: mostly read-only checks'], mid: ['mid', 'Medium risk: some steps change a running system'], high: ['hi', 'High risk: take a backup and get a second pair of eyes'] };
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id;

const cmdRow = (pair, danger) => `<div><div class="cmd ${danger ? 'danger' : ''}"><code>${esc(pair[0])}</code><button class="btn small" type="button" data-copy="${esc(pair[0])}" aria-label="Copy command: ${esc(pair[0])}">Copy</button></div><p class="cmd-desc">${esc(pair[1])}</p></div>`;

export function issuesPage({ cat }) {
  const initial = cat && cat !== 'all' && CATEGORIES.some((c) => c.id === cat) ? cat : 'all';
  return {
    title: 'Production Issues — DevOps Master',
    html: `<div class="wrap">
      <header class="page-head"><h1>Production issues</h1><p class="lead">Describe the symptom, confirm the cause with safe read-only checks, then fix and verify.</p></header>
      <div id="speech-slot" style="margin-bottom:1rem"></div>
      <div class="search-row"><div style="flex:1;min-width:240px"><label for="q" class="sr-only">Search issues</label><input id="q" type="text" placeholder="Search by symptom, error or tool, e.g. CrashLoopBackOff" autocomplete="off"></div><button class="btn" id="clear" hidden>Clear search</button></div>
      <div class="chips" role="group" aria-label="Filter by category"><button class="chip" data-cat="all" aria-pressed="false">All (${ISSUES.length})</button>${CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="false">${esc(c.name)} (${ISSUES.filter((i) => i.cat === c.id).length})</button>`).join('')}</div>
      <p class="muted" id="count" role="status" aria-live="polite" style="margin-top:1rem"></p>
      <div class="grid c3" id="grid"></div>
    </div>`,
    mount(root) {
      let active = initial; const q = $('#q', root); const grid = $('#grid', root);
      const draw = () => {
        const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
        const list = ISSUES.filter((i) => (active === 'all' || i.cat === active) && terms.every((t) => `${i.title} ${i.symptom} ${i.kw} ${catName(i.cat)}`.toLowerCase().includes(t)));
        root.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === active)));
        $('#clear', root).hidden = !q.value;
        $('#count', root).textContent = `${list.length} issue${list.length === 1 ? '' : 's'} shown`;
        grid.innerHTML = list.length ? list.map((i) => `<a class="card issue-card" href="#/issue/${i.id}"><div class="row"><span class="tag">${esc(catName(i.cat))}</span><span class="tag ${RISK[i.risk][0]}">${i.level}</span></div><h3>${esc(i.title)}</h3><p class="muted" style="margin:0">${esc(i.symptom)}</p></a>`).join('')
          : `<div class="card" style="grid-column:1/-1"><h3>No issues match that search</h3><p class="muted">Try fewer words, an error code, or a tool name. Or browse all categories.</p><button class="btn" id="reset">Show all issues</button></div>`;
      };
      q.addEventListener('input', draw);
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-cat]'); if (c) { active = c.dataset.cat; history.replaceState(null, '', `#/issues/${active}`); draw(); }
        if (e.target.id === 'clear' || e.target.id === 'reset') { q.value = ''; if (e.target.id === 'reset') active = 'all'; draw(); q.focus(); }
      });
      draw();
      return mountSpeechPanel($('#speech-slot', root), { title: 'Alyantri says', mp3: 'assets/audio/issues.mp3', text: 'When production breaks, stay calm. **Observe first**, change second. Every guide starts with read-only checks.' });
    }
  };
}

export function issueDetailPage({ id }) {
  const i = getIssue(id); if (!i) return null;
  const related = (i.related || []).map(getIssue).filter(Boolean);
  const [riskCls, riskText] = RISK[i.risk];
  return {
    title: `${i.title} — DevOps Master`,
    html: `<div class="wrap issue-detail" style="max-width:960px">
      <p style="margin-top:1.5rem"><a href="#/issues/${i.cat}">← All ${esc(catName(i.cat))} issues</a></p>
      <h1>${esc(i.title)}</h1>
      <div class="row"><span class="tag">${esc(catName(i.cat))}</span><span class="tag ${riskCls}">${esc(riskText)}</span><span class="tag">${i.level}</span></div>
      <section class="card" style="margin-top:1rem"><h2>Symptoms</h2><p>${esc(i.symptom)}</p></section>
      <section><h2>Likely causes</h2><ul class="tip-list">${i.causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
      <section><h2>Step 1: confirm the cause (read-only)</h2><p class="muted">These commands only look. Replace the &lt;placeholders&gt; with your own values.</p><div class="grid">${i.diag.map((d) => cmdRow(d)).join('')}</div></section>
      <section><h2>Step 2: fix it</h2><ol class="steps">${i.fix.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>
      ${i.change.length ? `<section><h2>Commands that change things</h2><div class="warnbox"><strong>Caution.</strong> These modify a running system. Confirm the environment, the target and your rollback plan first.</div><div class="grid">${i.change.map((d) => cmdRow(d, true)).join('')}</div></section>` : ''}
      <section><h2>Step 3: verify</h2><ul class="tip-list">${i.verify.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
      <section><h2>Prevent it next time</h2><ul class="tip-list">${i.prevent.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
      ${related.length ? `<section><h2>Related issues</h2><ul class="tip-list">${related.map((r) => `<li><a href="#/issue/${r.id}">${esc(r.title)}</a></li>`).join('')}</ul></section>` : ''}
      <p class="muted" style="margin-top:2rem">Guidance reflects common practice and may differ for your tool versions. Test changes in a safe environment first.</p>
    </div>`
  };
}
