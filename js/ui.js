// Small UI helpers shared by all pages.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer;
export function toast(message, { error = false, ms = 3800 } = {}) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.className = 'toast' + (error ? ' err' : '');
  el.textContent = message; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    throw new Error('no clipboard api');
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

/** Global click handler for [data-copy] buttons. */
export function installCopyHandler() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]'); if (!btn) return;
    const ok = await copyText(btn.getAttribute('data-copy'));
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old; btn.textContent = ok ? 'Copied' : 'Copy failed';
    toast(ok ? 'Copied to clipboard.' : 'Copy failed. Select the text and copy it manually.', { error: !ok });
    setTimeout(() => { btn.textContent = old; }, 1600);
  });
}

/** Native <dialog> based modal. Returns the dialog element; resolves via the callbacks you attach. */
export function openDialog(html, { wide = false, label = 'Dialog' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.setAttribute('aria-label', label);
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`<h2>${esc(title)}</h2><div>${body}</div><div class="row" style="margin-top:1rem;justify-content:flex-end"><button class="btn" data-act="cancel">${esc(cancelLabel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(confirmLabel)}</button></div>`, { label: title });
    let result = false;
    dlg.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; result = b.dataset.act === 'ok'; dlg.close(); });
    dlg.addEventListener('close', () => resolve(result));
    dlg.querySelector('[data-act="cancel"]').focus();
  });
}

export function promptDialog({ title, label, value = '', confirmLabel = 'Save', validate }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`<h2>${esc(title)}</h2><div class="field"><label for="pd-input">${esc(label)}</label><input id="pd-input" type="text" value="${esc(value)}" autocomplete="off"><div class="err-msg" id="pd-err" role="alert"></div></div><div class="row" style="justify-content:flex-end"><button class="btn" data-act="cancel">Cancel</button><button class="btn primary" data-act="ok">${esc(confirmLabel)}</button></div>`, { label: title });
    const input = dlg.querySelector('#pd-input'); const err = dlg.querySelector('#pd-err'); let result = null;
    const submit = () => { const v = input.value.trim(); const m = validate ? validate(v) : ''; if (m) { err.textContent = m; input.classList.add('bad'); input.focus(); return; } result = v; dlg.close(); };
    dlg.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'ok') submit(); else dlg.close(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    dlg.addEventListener('close', () => resolve(result));
    input.focus(); input.select();
  });
}

export const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const ext = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
