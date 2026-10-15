import { TOOLS } from './data-tools.js';
import { CATEGORIES } from './data-issues.js';
import { GENERATOR_LIST } from './generators.js';
import { esc, $, $$, installCopyHandler, reducedMotion } from './ui.js';
import * as store from './storage.js';
import { homePage, manifestLandingPage, learnPage, cheatsheetPage } from './pages-main.js';
import { generatorPage } from './pages-generator.js';
import { issuesPage, issueDetailPage } from './pages-issues.js';
import { masterFolderPage } from './pages-folder.js';
import { contactPage } from './pages-contact.js';
import { CONFIG } from './config.js';

const ROUTES = [
  [/^\/?$/, homePage],
  [/^\/learn\/([\w-]+)$/, (m) => learnPage({ id: m[1] })],
  [/^\/manifest$/, manifestLandingPage],
  [/^\/manifest\/cheatsheet$/, cheatsheetPage],
  [/^\/manifest\/([\w-]+)$/, (m) => generatorPage({ id: m[1] })],
  [/^\/issues(?:\/([\w-]+))?$/, (m) => issuesPage({ cat: m[1] })],
  [/^\/issues\/([\w-]+)\/([\w-]+)$/, (m) => issueDetailPage({ id: m[2] })],
  [/^\/issue\/([\w-]+)$/, (m) => issueDetailPage({ id: m[1] })],
  [/^\/master-folder$/, masterFolderPage],
  [/^\/contact$/, contactPage]
];
// '/issues/<cat>/<issue>' must be tested before '/issues/<cat>'
ROUTES.splice(5, 0, ROUTES.splice(6, 1)[0]);

const main = $('#main'); let cleanup = null; let navToken = 0;

function buildNav() {
  const dd = (id, label, items) => `<li class="nav-item" data-dd><button class="nav-btn" aria-expanded="false" aria-controls="dd-${id}" data-nav="${id}">${label} <span class="caret" aria-hidden="true">▼</span></button><ul class="dropdown" id="dd-${id}">${items.map(([h, t]) => `<li><a href="${h}">${esc(t)}</a></li>`).join('')}</ul></li>`;
  $('#nav-list').innerHTML = `
    <li class="nav-item"><a class="nav-link" href="#/" data-nav="home">Home</a></li>
    ${dd('learn', 'Learn', TOOLS.map((t) => [`#/learn/${t.id}`, t.name]))}
    ${dd('manifest', 'Manifest Generator', [['#/manifest', 'Overview'], ...GENERATOR_LIST.map(([id, n]) => [`#/manifest/${id}`, n]), ['#/manifest/cheatsheet', 'Linux & Docker Cheatsheet']])}
    ${dd('issues', 'Production Issues', [['#/issues', 'All issues'], ...CATEGORIES.map((c) => [`#/issues/${c.id}`, c.name])])}
    <li class="nav-item"><a class="nav-link" href="#/master-folder" data-nav="folder">Master Folder <span class="folder-count" id="fcount" aria-label="files saved">0</span></a></li>
    <li class="nav-item"><a class="nav-link" href="#/contact" data-nav="contact">Contact</a></li>`;
  const closeAll = (except) => $$('[data-dd]').forEach((li) => { if (li !== except) { li.classList.remove('open'); li.querySelector('.nav-btn').setAttribute('aria-expanded', 'false'); } });
  const setOpen = (li, open) => { closeAll(open ? li : null); li.classList.toggle('open', open); li.querySelector('.nav-btn').setAttribute('aria-expanded', String(open)); };
  $$('[data-dd]').forEach((li) => {
    const btn = li.querySelector('.nav-btn'); let t;
    btn.addEventListener('click', () => setOpen(li, !li.classList.contains('open')));
    li.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && innerWidth > 980) { clearTimeout(t); setOpen(li, true); } });
    li.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && innerWidth > 980) t = setTimeout(() => setOpen(li, false), 180); });
    li.addEventListener('keydown', (e) => {
      const links = $$('.dropdown a', li); const i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') { setOpen(li, false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(li, true); (links[i + 1] || links[0]).focus(); }
      else if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); (links[i - 1] || btn).focus(); }
    });
    li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget)) setOpen(li, false); });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-dd]')) closeAll(); });
  const toggle = $('#menu-toggle'); const list = $('#nav-list');
  toggle.addEventListener('click', () => { const o = list.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(o)); });
  list.addEventListener('click', (e) => { if (e.target.closest('a')) { list.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); closeAll(); } });
}
function markCurrent(path) {
  const key = path.startsWith('/learn') ? 'learn' : path.startsWith('/manifest') ? 'manifest' : path.startsWith('/issue') ? 'issues' : path === '/master-folder' ? 'folder' : path === '/contact' ? 'contact' : path === '/' || path === '' ? 'home' : '';
  $$('[data-nav]').forEach((el) => { if (el.dataset.nav === key) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
}
async function updateCount() { try { $('#fcount').textContent = String(await store.countFiles()); } catch { /* ignore */ } }

function render() {
  const token = ++navToken;
  const path = (location.hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  let page = null;
  for (const [re, fn] of ROUTES) { const m = path.match(re); if (m) { page = fn(m); break; } }
  if (!page) page = { title: 'Page not found — DevOps Master', html: `<div class="wrap section" style="text-align:center"><h1>That page does not exist</h1><p style="margin-inline:auto" class="muted">The link may be old or mistyped. Try one of these:</p><div class="row" style="justify-content:center"><a class="btn primary" href="#/">Go home</a><a class="btn" href="#/learn/docker">Learn Docker</a><a class="btn" href="#/issues">Production issues</a></div></div>` };
  document.title = page.title;
  // Fresh container per route so listeners attached by a page are discarded with it.
  main.innerHTML = ''; const pageEl = document.createElement('div'); pageEl.innerHTML = page.html; main.appendChild(pageEl);
  markCurrent(path);
  if (token !== navToken) return;
  try { cleanup = page.mount ? page.mount(pageEl) : null; } catch (err) { console.error(err); pageEl.insertAdjacentHTML('afterbegin', `<div class="wrap"><div class="warnbox err" role="alert">Part of this page failed to load: ${esc(err.message)}. Refresh the page to try again.</div></div>`); }
  window.scrollTo({ top: 0, behavior: 'auto' });
  const h1 = main.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  $('#live-route').textContent = document.title;
}

function init() {
  if (reducedMotion()) document.documentElement.classList.add('reduced');
  $('#year').textContent = new Date().getFullYear();
  $('#foot-mail').textContent = CONFIG.contactEmail;
  buildNav(); installCopyHandler();
  window.addEventListener('hashchange', render);
  window.addEventListener('mf-change', updateCount);
  store.init().then(updateCount);
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  render();
}
init();
