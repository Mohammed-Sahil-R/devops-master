import { GENERATORS } from './generators.js';
import { looksLikeSecrets } from './generators.js';
import * as store from './storage.js';
import { esc, $, toast, openDialog, confirmDialog } from './ui.js';
import { mountSpeechPanel } from './audio.js';
import { mountWizard } from './wizard.js';

const optionsOf = (f, s) => (typeof f.options === 'function' ? f.options(s) : f.options);

function fieldHtml(f, s, errors) {
  const v = s[f.id]; const err = errors[f.id]; const id = `f-${f.id}`;
  const desc = [f.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ');
  const aria = `${desc ? `aria-describedby="${desc}"` : ''} ${err ? 'aria-invalid="true"' : ''}`;
  const hint = f.hint ? `<div class="hint" id="${id}-hint">${esc(f.hint)}</div>` : '';
  const em = err ? `<div class="err-msg" id="${id}-err" role="alert">${esc(err)}</div>` : '';
  if (f.type === 'checkbox') return `<div class="field"><label class="check"><input type="checkbox" id="${id}" data-f="${f.id}" ${v ? 'checked' : ''} ${aria}> <span>${esc(f.label)}</span></label>${hint}${em}</div>`;
  if (f.type === 'select') {
    const opts = optionsOf(f, s);
    return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-f="${f.id}" class="${err ? 'bad' : ''}" ${aria}>${opts.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>${hint}${em}</div>`;
  }
  const type = f.type === 'number' ? 'number' : 'text';
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.req ? ' <span class="muted">(required)</span>' : ''}</label><input id="${id}" data-f="${f.id}" type="${type}" ${type === 'number' ? 'inputmode="numeric" min="0"' : 'autocomplete="off" spellcheck="false"'} value="${esc(v ?? '')}" class="${err ? 'bad' : ''}" ${aria}>${hint}${em}</div>`;
}

export function generatorPage({ id }) {
  const gen = GENERATORS[id];
  if (!gen) return null;
  return {
    title: `${gen.title} — DevOps Master`,
    html: `
    <div class="wrap section" style="padding-top:2rem">
      <h1>${esc(gen.title)}</h1>
      <div style="display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:1rem;align-items:center;margin-bottom:1.2rem" class="gen-intro">
        <div class="wizard-box" id="wizard-box"></div>
        <div id="speech-slot"></div>
      </div>
      <div class="gen-layout">
        <section class="card" aria-label="Options">
          <fieldset style="margin-top:0"><legend>What would you like to do?</legend>
            <div class="seg" role="radiogroup">
              <label><input type="radio" name="mode" value="example" checked> Explore an example</label>
              <label><input type="radio" name="mode" value="create"> Create my own file</label>
            </div>
          </fieldset>
          <div id="left-body"></div>
        </section>
        <section class="card" aria-label="File preview">
          <div class="editor-head">
            <div><span class="fname" id="fname">—</span> <span class="tag" id="ftype" hidden></span></div>
            <div class="row">
              <button class="btn small" data-act="copy" disabled>Copy</button>
              <button class="btn small" data-act="download" disabled>Download</button>
              <button class="btn small gold" data-act="save" disabled>Save to Master Folder</button>
            </div>
          </div>
          <div class="editor"><pre class="gutter" id="gutter" aria-hidden="true">1</pre><textarea id="code" aria-label="Generated file contents (editable)" spellcheck="false" wrap="off" placeholder="Choose an example, or fill in the form and select Create file."></textarea></div>
          <div class="status" id="status" role="status" aria-live="polite"></div>
          <div id="notes"></div>
        </section>
      </div>
    </div>`,
    mount(root) {
      const S = { mode: 'example', ex: null, form: gen.state(), errors: {}, result: null, edited: false };
      const left = $('#left-body', root); const code = $('#code', root); const gutter = $('#gutter', root); const status = $('#status', root); const notes = $('#notes', root);
      const btn = (a) => $(`[data-act="${a}"]`, root);

      const cleanups = [];
      cleanups.push(mountSpeechPanel($('#speech-slot', root), { title: 'Alyantri says', mp3: `assets/audio/generators/${id}.mp3`, text: gen.intro }));
      cleanups.push(mountWizard($('#wizard-box', root)));

      const syncGutter = () => { const n = code.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter.scrollTop = code.scrollTop; };
      code.addEventListener('scroll', () => { gutter.scrollTop = code.scrollTop; });
      code.addEventListener('input', () => { S.edited = true; if (S.result) S.result.content = code.value; syncGutter(); });

      const showResult = (r, { example = false } = {}) => {
        S.result = { ...r }; S.edited = false;
        $('#fname', root).textContent = r.name; $('#ftype', root).textContent = r.language; $('#ftype', root).hidden = false;
        code.value = r.content; syncGutter();
        ['copy', 'download', 'save'].forEach((a) => { btn(a).disabled = false; });
        if (window.innerWidth <= 960) $('#fname', root).scrollIntoView({ block: 'start', behavior: 'smooth' });
        status.innerHTML = `<span style="color:var(--ok)">${example ? 'Example loaded.' : 'File generated.'}</span> It is a starting point, not production-ready. Review and test it first.`;
        const warn = (r.warnings || []).map((w) => `<li>${esc(w)}</li>`).join(''); const ass = (r.assumptions || []).map((w) => `<li>${esc(w)}</li>`).join('');
        notes.innerHTML = `${warn ? `<div class="warnbox"><strong>Warnings</strong><ul class="tip-list">${warn}</ul></div>` : ''}${ass ? `<div class="warnbox ok"><strong>Assumptions</strong><ul class="tip-list">${ass}</ul></div>` : ''}${r.extra ? `<p class="muted">Also generated: <code>${esc(r.extra[0].name)}</code>. You can save it from the Save dialog.</p>` : ''}<p class="muted" style="font-size:.9rem">Syntax looks right here, but only a real tool run (for example docker build, kubectl --dry-run, terraform validate) confirms it works in your environment.</p>`;
      };

      const renderLeft = () => {
        if (S.mode === 'example') {
          left.innerHTML = `<h2 style="font-size:1.15rem">Examples</h2><ul class="ex-list">${gen.examples.map((e) => `<li><button class="ex-btn" data-ex="${e.id}" aria-pressed="${S.ex === e.id}"><strong>${esc(e.label)}</strong><small>${esc(e.desc)}</small></button></li>`).join('')}</ul>`;
        } else {
          const active = document.activeElement?.id; const sc = left.scrollTop;
          left.innerHTML = `<h2 style="font-size:1.15rem">Describe your file</h2><div id="form">${gen.fields().filter((f) => !f.show || f.show(S.form)).map((f) => fieldHtml(f, S.form, S.errors)).join('')}</div>
            <div class="row" style="margin-top:1rem"><button class="btn primary" data-act="create">Create file</button><button class="btn" data-act="reset">Reset form</button></div>
            ${Object.keys(S.errors).length ? `<div class="err-msg" role="alert" style="margin-top:.6rem">Fix ${Object.keys(S.errors).length} field${Object.keys(S.errors).length > 1 ? 's' : ''} marked above, then create the file again.</div>` : ''}`;
          if (active) document.getElementById(active)?.focus({ preventScroll: true });
          left.scrollTop = sc;
        }
      };
      renderLeft();

      root.addEventListener('change', (e) => {
        if (e.target.name === 'mode') { S.mode = e.target.value; renderLeft(); return; }
        const id = e.target.dataset.f; if (!id) return;
        // Text/number fields only update state while typing. Re-rendering on blur would swallow the click on "Create file".
        if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { S.form[id] = e.target.value; return; }
        S.form[id] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (gen.onChange) gen.onChange(id, S.form);
        delete S.errors[id]; renderLeft();
      });
      root.addEventListener('input', (e) => {
        const id = e.target.dataset.f; if (!id || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
        S.form[id] = e.target.value;
        if (S.errors[id]) { delete S.errors[id]; e.target.classList.remove('bad'); document.getElementById(`f-${id}-err`)?.remove(); }
      });

      const doCreate = async () => {
        if (S.edited && !(await confirmDialog({ title: 'Replace your edits?', body: '<p>You edited the preview. Creating the file again will replace those edits.</p>', confirmLabel: 'Replace', danger: true }))) return;
        const errs = gen.validate(S.form); S.errors = errs;
        if (Object.keys(errs).length) { renderLeft(); const first = Object.keys(errs)[0]; document.getElementById(`f-${first}`)?.focus(); status.innerHTML = `<span style="color:var(--danger)">The form has ${Object.keys(errs).length} problem${Object.keys(errs).length > 1 ? 's' : ''}. Nothing was generated.</span>`; return; }
        try { showResult(gen.generate(S.form)); renderLeft(); } catch (err) { console.error(err); status.innerHTML = `<span style="color:var(--danger)">Could not generate the file: ${esc(err.message)}</span>`; }
      };

      root.addEventListener('click', async (e) => {
        const ex = e.target.closest('[data-ex]');
        if (ex) { S.ex = ex.dataset.ex; const item = gen.examples.find((x) => x.id === S.ex); showResult(item.make(), { example: true }); renderLeft(); $(`[data-ex="${S.ex}"]`, root)?.focus(); return; }
        const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; const a = b.dataset.act;
        if (a === 'create') doCreate();
        else if (a === 'reset') { S.form = gen.state(); S.errors = {}; renderLeft(); toast('Form reset.'); }
        else if (a === 'copy') { const { copyText } = await import('./ui.js'); const ok = await copyText(code.value); toast(ok ? 'Copied to clipboard.' : 'Copy failed. Select the text and copy it manually.', { error: !ok }); }
        else if (a === 'download') { const name = S.result.name.split('/').pop(); store.download(name, code.value); toast(`Download started: ${name}`); }
        else if (a === 'save') openSaveDialog();
      });

      const openSaveDialog = async () => {
        const folders = await store.listFolders(); const r = S.result;
        const secrets = looksLikeSecrets(code.value);
        const dlg = openDialog(`<h2>Save to Master Folder</h2>
          ${secrets.length ? `<div class="warnbox err" role="alert"><strong>This file may contain a secret</strong> (${esc(secrets.join(', '))}). Remove real secrets before saving or sharing.</div>` : ''}
          <div class="field"><label for="sv-name">File name</label><input id="sv-name" type="text" value="${esc(r.name.split('/').pop())}" autocomplete="off"></div>
          <div class="field"><label for="sv-folder">Folder</label><select id="sv-folder">${folders.map((f) => `<option ${f === gen.folder ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          ${r.extra ? `<label class="check"><input type="checkbox" id="sv-extra" checked> <span>Also save ${esc(r.extra[0].name)}</span></label>` : ''}
          <div class="err-msg" id="sv-err" role="alert"></div>
          <p class="muted" style="font-size:.9rem">Saved on this device and browser only. It is not synced to a cloud account.</p>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-x="cancel">Cancel</button><button class="btn primary" data-x="ok">Save file</button></div>`, { label: 'Save to Master Folder' });
        dlg.addEventListener('click', async (ev) => {
          const x = ev.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'cancel') return dlg.close();
          const name = $('#sv-name', dlg).value; const folder = $('#sv-folder', dlg).value;
          try {
            const rec = await store.saveFile({ name, folder, tool: gen.tool, content: code.value, language: r.language });
            if (r.extra && $('#sv-extra', dlg)?.checked) await store.saveFile({ name: r.extra[0].name, folder, tool: gen.tool, content: r.extra[0].content, language: r.extra[0].language });
            dlg.close(); toast(`Saved ${rec.name} to Master Folder / ${folder}.`);
            status.innerHTML = `<span style="color:var(--ok)">Saved ${esc(rec.name)}.</span> <a href="#/master-folder">Open Master Folder</a>`;
          } catch (err) { $('#sv-err', dlg).textContent = err.message; }
        });
        $('#sv-name', dlg).focus();
      };

      return () => cleanups.forEach((c) => c());
    }
  };
}
